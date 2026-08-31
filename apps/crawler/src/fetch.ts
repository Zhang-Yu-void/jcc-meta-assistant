const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const TAPTAP_XUA =
  "V=1&PN=WebApp&LANG=zh_CN&VN=2.8.0&VN_CODE=102&LOC=CN&PLT=PC&DS=Android&DT=PC";

let lastFetchAt = 0;

export function getDefaultUserAgent(): string {
  return process.env.CRAWLER_USER_AGENT ?? DEFAULT_UA;
}

export function getTapTapXUa(): string {
  return process.env.TAPTAP_XUA ?? TAPTAP_XUA;
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export async function rateLimitedFetch(
  url: string,
  init: RequestInit = {},
  rateLimitMs = Number(process.env.CRAWLER_RATE_MS ?? 800),
): Promise<Response> {
  const now = Date.now();
  const wait = Math.max(0, lastFetchAt + rateLimitMs - now);
  if (wait > 0) await sleep(wait);
  lastFetchAt = Date.now();

  const headers = new Headers(init.headers);
  if (!headers.has("User-Agent")) headers.set("User-Agent", getDefaultUserAgent());

  return fetch(url, { ...init, headers });
}

export async function fetchText(url: string, init: RequestInit = {}, rateLimitMs?: number): Promise<string> {
  const res = await rateLimitedFetch(url, init, rateLimitMs);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

export async function fetchJson<T>(url: string, init: RequestInit = {}, rateLimitMs?: number): Promise<T> {
  const res = await rateLimitedFetch(url, init, rateLimitMs);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}

export function parseGuestJsFromHtml(html: string): string | null {
  const m = html.match(/guestJs=([0-9]+_[a-z0-9]+)/i);
  return m?.[1] ?? null;
}

export async function bootstrapNgaGuestCookie(fid: string): Promise<string> {
  const url = `https://bbs.nga.cn/thread.php?fid=${fid}`;
  const html = await fetchText(url);
  const guestJs = parseGuestJsFromHtml(html);
  if (!guestJs) throw new Error("NGA guestJs not found — set NGA_COOKIE manually");
  return `guestJs=${guestJs}`;
}

export function cookieHeader(base?: string, extra?: string): string {
  const parts = [base, extra].filter(Boolean);
  return parts.join("; ");
}

export { TAPTAP_XUA };
