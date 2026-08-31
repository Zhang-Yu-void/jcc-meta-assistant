import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { checkXhsSession, defaultStorageStatePath } from "./adapters/xhs-playwright.js";
import {
  cookieHeaderFromStorageState,
  defaultStatusPath,
  markExpireEmailSent,
  shouldSendExpireEmail,
  writeXhsStatus,
  type XhsSessionStatus,
} from "./xhs-session.js";

const ALIYUN_HOST = process.env.ALIYUN_HOST ?? "aliyun";
const ALIYUN_XHS_DIR = process.env.ALIYUN_XHS_DIR ?? "/opt/jcc-meta-assistant/data/xhs";
const ALIYUN_ENV = process.env.ALIYUN_ENV ?? "/etc/jcc-meta.env";
const MAIL_SCRIPT = process.env.XHS_MAIL_SCRIPT ?? "/opt/ruoyi/monitor/send_health_email.py";
const COOLDOWN_MIN = Number(process.env.XHS_EMAIL_COOLDOWN_MIN ?? 360);
const REPO_HINT = process.env.XHS_REPO_PATH ?? "~/github/jcc-meta-assistant";

export async function runXhsCheck(opts?: { notify?: boolean; sync?: boolean }): Promise<XhsSessionStatus> {
  const storageState = defaultStorageStatePath();
  const result = await checkXhsSession({ storageState });
  const status: XhsSessionStatus = {
    ok: result.ok,
    checkedAt: new Date().toISOString(),
    reason: result.reason,
    storageState,
    source: "check",
  };
  writeXhsStatus(status);

  console.log(status.ok ? "[OK] 小红书会话有效" : "[EXPIRED] 小红书会话无效");
  console.log(`  reason: ${status.reason}`);
  console.log(`  checkedAt: ${status.checkedAt}`);
  console.log(`  status → ${defaultStatusPath()}`);

  if (opts?.sync !== false) syncStatusToAliyun(status, storageState);
  if (!status.ok && opts?.notify !== false) maybeEmailExpire(status);

  return status;
}

export function syncStatusToAliyun(status: XhsSessionStatus, storageStatePath: string): void {
  console.log(`[sync] → ${ALIYUN_HOST}:${ALIYUN_XHS_DIR}`);

  const mkdir = spawnSync("ssh", [ALIYUN_HOST, `mkdir -p '${ALIYUN_XHS_DIR}'`], { encoding: "utf-8" });
  if (mkdir.status !== 0) {
    console.warn(`[sync] mkdir failed: ${mkdir.stderr || mkdir.stdout}`);
    return;
  }

  spawnSync("scp", [defaultStatusPath(), `${ALIYUN_HOST}:${ALIYUN_XHS_DIR}/status.json`], { stdio: "inherit" });

  if (status.ok && existsSync(storageStatePath)) {
    spawnSync("scp", [storageStatePath, `${ALIYUN_HOST}:${ALIYUN_XHS_DIR}/storageState.json`], { stdio: "inherit" });
    const cookie = cookieHeaderFromStorageState(storageStatePath);
    if (cookie) updateRemoteXhsCookie(cookie);
  }
  console.log("[sync] done");
}

function updateRemoteXhsCookie(cookie: string): void {
  const b64 = Buffer.from(cookie, "utf-8").toString("base64");
  const dir = mkdtempSync(path.join(tmpdir(), "xhs-cookie-"));
  const pyFile = path.join(dir, "update_xhs_cookie.py");
  const remotePy = `/tmp/jcc-update-xhs-cookie-${Date.now()}.py`;
  const safeScript = [
    "#!/usr/bin/env python3",
    "import base64",
    "from pathlib import Path",
    `cookie = base64.b64decode("${b64}").decode()`,
    `p = Path("${ALIYUN_ENV}")`,
    "lines = p.read_text().splitlines() if p.exists() else []",
    "out, found = [], False",
    "for line in lines:",
    '    if line.startswith("XHS_COOKIE=") or line.startswith("# XHS_COOKIE="):',
    "        if not found:",
    "            esc = cookie.replace(chr(39), chr(39)+chr(34)+chr(39)+chr(34)+chr(39))",
    '            out.append("XHS_COOKIE=" + chr(39) + esc + chr(39))',
    "            found = True",
    "        continue",
    "    out.append(line)",
    "if not found:",
    "    esc = cookie.replace(chr(39), chr(39)+chr(34)+chr(39)+chr(34)+chr(39))",
    '    out.append("XHS_COOKIE=" + chr(39) + esc + chr(39))',
    'p.write_text("\\n".join(out) + "\\n")',
    "print('XHS_COOKIE updated', len(cookie))",
  ].join("\n");

  try {
    writeFileSync(pyFile, safeScript, "utf-8");
    const scp = spawnSync("scp", [pyFile, `${ALIYUN_HOST}:${remotePy}`], { encoding: "utf-8" });
    if (scp.status !== 0) {
      console.warn(`[sync] scp cookie script failed: ${scp.stderr}`);
      return;
    }
    const update = spawnSync("ssh", [ALIYUN_HOST, `python3 '${remotePy}'; rm -f '${remotePy}'`], {
      encoding: "utf-8",
    });
    if (update.status === 0) console.log(`[sync] ${update.stdout.trim()}`);
    else console.warn(`[sync] cookie update failed: ${update.stderr || update.stdout}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}


function maybeEmailExpire(status: XhsSessionStatus): void {
  if (!shouldSendExpireEmail(COOLDOWN_MIN)) {
    console.log(`[mail] skip (cooldown ${COOLDOWN_MIN}m)`);
    return;
  }

  const body = [
    "【金铲铲 Meta】小红书登录已过期或无效",
    "",
    `检测时间: ${status.checkedAt}`,
    `原因: ${status.reason ?? "unknown"}`,
    "",
    "请在 Mac 上执行：",
    `  cd ${REPO_HINT}`,
    "  ./scripts/xhs-login-sync.sh",
    "",
    "流程：浏览器扫码 → 终端按 Enter → 自动同步会话到阿里云并推送阵容。",
  ].join("\n");

  const dir = mkdtempSync(path.join(tmpdir(), "xhs-mail-"));
  const bodyFile = path.join(dir, "body.txt");
  writeFileSync(bodyFile, body, "utf-8");
  const remoteBody = `/tmp/jcc-xhs-expire-${Date.now()}.txt`;

  try {
    const scp = spawnSync("scp", [bodyFile, `${ALIYUN_HOST}:${remoteBody}`], { encoding: "utf-8" });
    if (scp.status !== 0) {
      console.warn(`[mail] scp body failed: ${scp.stderr}`);
      return;
    }
    const subject = "[JCC Meta] 小红书登录过期 — 请本机 ./scripts/xhs-login-sync.sh";
    const mail = spawnSync(
      "ssh",
      [ALIYUN_HOST, `python3 '${MAIL_SCRIPT}' ${JSON.stringify(subject)} '${remoteBody}'; rm -f '${remoteBody}'`],
      { encoding: "utf-8" },
    );
    if (mail.status === 0) {
      markExpireEmailSent();
      console.log(`[mail] sent (${mail.stdout.trim()})`);
    } else {
      console.warn(`[mail] failed: ${mail.stderr || mail.stdout}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
