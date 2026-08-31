import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type BrowserContext, type Page, type Response } from "playwright";
import type { AdapterResult, CrawlContext, RawPostHint } from "../types.js";
import { sleep } from "../fetch.js";
import { writeXhsStatus } from "../xhs-session.js";
import {
  extractNoteDescFromJson,
  mergeDetailIntoHint,
  parseSearchResponseOrThrow,
  rankHintsForDetail,
} from "./xhs-detail.js";
import type { XhsSearchNotesResponse } from "./xhs.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

export function defaultStorageStatePath(): string {
  return process.env.XHS_STORAGE_STATE ?? path.join(ROOT, "data/xhs/storageState.json");
}

function searchUrl(keyword: string): string {
  const kw = encodeURIComponent(keyword);
  return `https://www.xiaohongshu.com/search_result?keyword=${kw}&source=web_search_result_notes`;
}

function isSearchNotesResponse(url: string): boolean {
  return /\/api\/sns\/web\/v\d+\/search\/notes/.test(url);
}

function isNoteDetailResponse(url: string): boolean {
  return (
    /\/api\/sns\/web\/v\d+\/(feed|note\/)/.test(url) ||
    /\/api\/sns\/web\/v\d+\/note\b/.test(url) ||
    url.includes("/api/sns/web/v1/feed")
  );
}

async function readJson(res: Response): Promise<unknown | null> {
  try {
    return await res.json();
  } catch {
    try {
      const t = await res.text();
      return JSON.parse(t);
    } catch {
      return null;
    }
  }
}

async function waitForSearchNotes(page: Page, timeoutMs: number): Promise<XhsSearchNotesResponse> {
  const res = await page.waitForResponse(
    (r) => isSearchNotesResponse(r.url()) && r.request().method() === "POST" && r.status() === 200,
    { timeout: timeoutMs },
  );
  const json = (await readJson(res)) as XhsSearchNotesResponse | null;
  if (!json) throw new Error("search/notes response not JSON");
  return json;
}

async function fetchNoteDesc(page: Page, hint: RawPostHint, timeoutMs: number): Promise<string | null> {
  let desc: string | null = null;

  const onResponse = async (res: Response) => {
    if (desc) return;
    if (!isNoteDetailResponse(res.url()) || res.status() !== 200) return;
    const json = await readJson(res);
    const d = extractNoteDescFromJson(json);
    if (d) desc = d;
  };

  page.on("response", onResponse);
  try {
    await page.goto(hint.url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    const deadline = Date.now() + timeoutMs;
    while (!desc && Date.now() < deadline) {
      await sleep(400);
      if (desc) break;
      // DOM fallback
      const fromDom = await page
        .locator("#detail-desc, .desc, [class*='desc']")
        .first()
        .textContent({ timeout: 500 })
        .catch(() => null);
      if (fromDom && fromDom.trim().length > 20) {
        desc = fromDom.trim();
        break;
      }
      // INITIAL_STATE fallback
      const stateDesc = await page
        .evaluate(() => {
          const w = window as unknown as { __INITIAL_STATE__?: unknown };
          const s = w.__INITIAL_STATE__;
          if (!s) return null;
          const raw = JSON.stringify(s);
          const m = raw.match(/"desc"\s*:\s*"((?:\\.|[^"\\])*)"/);
          if (!m) return null;
          try {
            return JSON.parse(`"${m[1]}"`) as string;
          } catch {
            return m[1];
          }
        })
        .catch(() => null);
      if (stateDesc && stateDesc.trim().length > 10) {
        desc = stateDesc.trim();
        break;
      }
    }
  } finally {
    page.off("response", onResponse);
  }

  return desc;
}

function launchOptions(headed: boolean) {
  // Prefer system Chrome to avoid downloading Playwright's Chromium bundle.
  const channel = process.env.XHS_BROWSER_CHANNEL ?? "chrome";
  return {
    headless: !headed,
    channel: channel === "chromium" ? undefined : channel,
  } as const;
}

export async function crawlXhsPlaywright(ctx: CrawlContext): Promise<AdapterResult> {
  const hints: RawPostHint[] = [];
  const errors: string[] = [];
  const storageState = ctx.xhsStorageState ?? defaultStorageStatePath();
  const detailLimit = ctx.xhsDetailLimit ?? Number(process.env.XHS_DETAIL_LIMIT ?? 10);
  const headed = (process.env.XHS_HEADED ?? "0") === "1";
  const timeoutMs = Number(process.env.XHS_TIMEOUT_MS ?? 45000);

  if (!existsSync(storageState)) {
    errors.push(`XHS playwright: missing ${storageState} — run: pnpm xhs:login`);
    return { platform: "xhs", hints, errors };
  }

  const browser = await chromium.launch(launchOptions(headed));
  const context = await browser.newContext({
    storageState,
    userAgent:
      ctx.userAgent ||
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "zh-CN",
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  try {
    const url = searchUrl(ctx.xhsKeyword);
    const searchPromise = waitForSearchNotes(page, timeoutMs);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });

    // login wall detection
    if (/login|passport/i.test(page.url())) {
      throw new Error("session expired — run pnpm xhs:login");
    }

    let searchJson: XhsSearchNotesResponse;
    try {
      searchJson = await searchPromise;
    } catch {
      // retry once: soft reload / click 笔记 tab
      await page.reload({ waitUntil: "domcontentloaded" });
      searchJson = await waitForSearchNotes(page, timeoutMs);
    }

    let list = parseSearchResponseOrThrow(searchJson);
    list = rankHintsForDetail(list, Math.max(detailLimit * 2, detailLimit));
    const targets = list.slice(0, detailLimit);

    for (const hint of targets) {
      try {
        await sleep(ctx.rateLimitMs);
        const desc = await fetchNoteDesc(page, hint, timeoutMs);
        if (desc) {
          hints.push(mergeDetailIntoHint(hint, desc));
        } else {
          hints.push(hint);
          errors.push(`xhs detail empty: ${hint.title.slice(0, 40)}`);
        }
      } catch (e) {
        hints.push(hint);
        errors.push(`xhs detail: ${hint.title.slice(0, 24)} — ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // also keep remaining list titles without detail (low priority)
    for (const h of list.slice(detailLimit)) {
      if (!hints.some((x) => x.title === h.title)) hints.push(h);
    }

    if (!hints.length) errors.push("XHS playwright: no notes");
    else {
      writeXhsStatus({
        ok: true,
        checkedAt: new Date().toISOString(),
        reason: `crawl ok (${hints.length} notes)`,
        storageState,
        source: "crawl",
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`xhs playwright: ${msg}`);
    if (/session expired|not authenticated|missing .*storageState/i.test(msg)) {
      writeXhsStatus({
        ok: false,
        checkedAt: new Date().toISOString(),
        reason: msg,
        storageState,
        source: "crawl",
      });
    }
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }

  return { platform: "xhs", hints, errors };
}

export async function runXhsLogin(opts?: { storageState?: string; timeoutMs?: number }): Promise<string> {
  const storageState = opts?.storageState ?? defaultStorageStatePath();
  mkdirSync(path.dirname(storageState), { recursive: true });
  const timeoutMs = opts?.timeoutMs ?? Number(process.env.XHS_LOGIN_TIMEOUT_MS ?? 300_000);

  const browser = await chromium.launch(launchOptions(true));
  const context = await browser.newContext({
    locale: "zh-CN",
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  await page.goto("https://www.xiaohongshu.com/", { waitUntil: "domcontentloaded" });

  // Try open login / QR panel (ignore failure — user can click manually)
  await page
    .locator('text=登录', { hasText: /^登录$/ })
    .first()
    .click({ timeout: 3000 })
    .catch(() => undefined);
  await page.getByRole("button", { name: /登录/ }).first().click({ timeout: 2000 }).catch(() => undefined);

  console.log("");
  console.log("1. 在弹出的 Chrome 里扫码 / 登录小红书");
  console.log("2. 确认右上角已显示头像（已登录）");
  console.log("3. 回到本终端，按 Enter 保存会话（窗口不会自动关）");
  console.log(`   最长等待 ${Math.round(timeoutMs / 1000)}s；超时将退出`);
  console.log("");

  await waitForEnter(timeoutMs);

  const ok = await isReallyLoggedIn(page, context);
  if (!ok) {
    await browser.close();
    throw new Error("未检测到已登录状态。请确认扫码成功后再按 Enter，然后重试 pnpm xhs:login");
  }

  await sleep(800);
  await context.storageState({ path: storageState });
  await browser.close();

  writeXhsStatus({
    ok: true,
    checkedAt: new Date().toISOString(),
    reason: "login ok",
    storageState,
    source: "login",
  });
  console.log(`✓ 已保存登录态 → ${storageState}`);
  return storageState;
}

/** Headless probe: is storageState still a logged-in session? */
export async function checkXhsSession(opts?: {
  storageState?: string;
  timeoutMs?: number;
}): Promise<{ ok: boolean; reason: string }> {
  const storageState = opts?.storageState ?? defaultStorageStatePath();
  const timeoutMs = opts?.timeoutMs ?? Number(process.env.XHS_TIMEOUT_MS ?? 45000);

  if (!existsSync(storageState)) {
    return { ok: false, reason: `missing storageState: ${storageState}` };
  }

  const browser = await chromium.launch(launchOptions(false));
  const context = await browser.newContext({
    storageState,
    locale: "zh-CN",
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  try {
    await page.goto("https://www.xiaohongshu.com/", { waitUntil: "domcontentloaded", timeout: timeoutMs });
    if (/login|passport/i.test(page.url())) {
      return { ok: false, reason: "redirected to login page" };
    }
    const ok = await isReallyLoggedIn(page, context);
    return ok
      ? { ok: true, reason: "logged in" }
      : { ok: false, reason: "session present but not authenticated (expired or guest)" };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

async function waitForEnter(timeoutMs: number): Promise<void> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) {
    // Non-interactive: fall back to polling real login (stricter than before)
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await sleep(3000);
    }
    return;
  }
  stdout.write("> 登录完成后按 Enter … ");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      stdin.pause();
      reject(new Error("登录等待超时"));
    }, timeoutMs);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = () => {
      clearTimeout(timer);
      stdin.off("data", onData);
      stdin.pause();
      resolve();
    };
    stdin.on("data", onData);
  });
}

async function isReallyLoggedIn(page: Page, context: BrowserContext): Promise<boolean> {
  // 1) INITIAL_STATE.user.loggedIn
  const fromState = await page
    .evaluate(() => {
      const w = window as unknown as { __INITIAL_STATE__?: { user?: { loggedIn?: boolean; userInfo?: { user_id?: string; userId?: string } } } };
      const u = w.__INITIAL_STATE__?.user;
      if (u?.loggedIn) return true;
      const id = u?.userInfo?.user_id || u?.userInfo?.userId;
      return Boolean(id && String(id).length > 5);
    })
    .catch(() => false);
  if (fromState) return true;

  // 2) Cookie web_session alone is NOT enough (guest also has it). Require red-ish id cookie combo after login.
  const cookies = await context.cookies("https://www.xiaohongshu.com");
  const map = Object.fromEntries(cookies.map((c) => [c.name, c.value]));
  if (map["web_session"] && map["id-token"] && map["id-token"].length > 20) return true;
  if (map["web_session"] && map["customer-sso-sid"]) return true;

  // 3) Probe me API via page context (uses browser cookies + signs)
  const meOk = await page
    .evaluate(async () => {
      try {
        const r = await fetch("https://edith.xiaohongshu.com/api/sns/web/v2/user/me", {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        const j = (await r.json()) as { success?: boolean; data?: { user_id?: string } };
        return Boolean(j?.success && j?.data?.user_id);
      } catch {
        return false;
      }
    })
    .catch(() => false);

  return meOk;
}
