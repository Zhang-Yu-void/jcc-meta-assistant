import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type XhsSessionStatus = {
  ok: boolean;
  checkedAt: string;
  reason?: string;
  storageState?: string;
  source: "check" | "login" | "crawl";
};

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export function xhsDir(): string {
  return path.join(ROOT, "data/xhs");
}

export function defaultStatusPath(): string {
  return process.env.XHS_STATUS_PATH ?? path.join(xhsDir(), "status.json");
}

export function defaultEmailCooldownPath(): string {
  return path.join(xhsDir(), ".last-expire-email");
}

export function writeXhsStatus(status: XhsSessionStatus, filePath = defaultStatusPath()): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(status, null, 2), "utf-8");
}

export function readXhsStatus(filePath = defaultStatusPath()): XhsSessionStatus | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as XhsSessionStatus;
  } catch {
    return null;
  }
}

/** Build Cookie header from Playwright storageState.json */
export function cookieHeaderFromStorageState(storageStatePath: string): string | null {
  if (!existsSync(storageStatePath)) return null;
  try {
    const raw = JSON.parse(readFileSync(storageStatePath, "utf-8")) as {
      cookies?: Array<{ name: string; value: string; domain?: string }>;
    };
    const cookies = (raw.cookies ?? []).filter((c) => {
      const d = c.domain ?? "";
      return d.includes("xiaohongshu.com") || d.includes("xhscdn.com") || !d;
    });
    if (!cookies.length) return null;
    // Prefer unique names (last wins)
    const map = new Map<string, string>();
    for (const c of cookies) map.set(c.name, c.value);
    return [...map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  } catch {
    return null;
  }
}

export function shouldSendExpireEmail(cooldownMinutes: number, cooldownFile = defaultEmailCooldownPath()): boolean {
  if (!existsSync(cooldownFile)) return true;
  try {
    const last = Number(readFileSync(cooldownFile, "utf-8").trim());
    if (!Number.isFinite(last)) return true;
    return Date.now() - last >= cooldownMinutes * 60_000;
  } catch {
    return true;
  }
}

export function markExpireEmailSent(cooldownFile = defaultEmailCooldownPath()): void {
  mkdirSync(path.dirname(cooldownFile), { recursive: true });
  writeFileSync(cooldownFile, String(Date.now()), "utf-8");
}

export function clearExpireEmailCooldown(cooldownFile = defaultEmailCooldownPath()): void {
  try {
    if (existsSync(cooldownFile)) unlinkSync(cooldownFile);
  } catch {
    /* ignore */
  }
}
