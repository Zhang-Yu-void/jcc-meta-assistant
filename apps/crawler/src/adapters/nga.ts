import * as cheerio from "cheerio";
import { bootstrapNgaGuestCookie, cookieHeader, fetchText } from "../fetch.js";
import type { AdapterResult, CrawlContext, RawPostHint } from "../types.js";
import { isRelevantPost } from "../parse.js";

function decodeHtml(html: string): string {
  try {
    return Buffer.from(html, "binary").toString("utf8");
  } catch {
    return html;
  }
}

export function parseNgaThreadList(html: string, fid: string): RawPostHint[] {
  const $ = cheerio.load(html);
  const hints: RawPostHint[] = [];

  $("a").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const title = $(el).text().trim();
    if (!title || title.length < 4) return;
    if (!href.includes("read.php") && !href.includes("tid=")) return;
    const text = title;
    if (!isRelevantPost(text) && !title.includes("阵")) return;
    const url = href.startsWith("http") ? href : `https://bbs.nga.cn${href.startsWith("/") ? href : `/${href}`}`;
    hints.push({
      platform: "nga",
      title,
      body: "",
      url,
    });
  });

  if (hints.length === 0) {
    const plain = decodeHtml(html);
    const re = /\[([^\]]{2,40})\]\s*<a[^>]+href="(\/read\.php\?tid=\d+[^"]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(plain))) {
      const title = m[1].trim();
      if (!isRelevantPost(title) && !title.includes("阵")) continue;
      hints.push({
        platform: "nga",
        title,
        body: "",
        url: `https://bbs.nga.cn${m[2]}`,
      });
    }
  }

  return hints.slice(0, 30);
}

export async function crawlNga(ctx: CrawlContext): Promise<AdapterResult> {
  const hints: RawPostHint[] = [];
  const errors: string[] = [];

  try {
    let cookie = ctx.ngaCookie;
    if (!cookie) {
      cookie = await bootstrapNgaGuestCookie(ctx.ngaFid);
    }

    const url = `https://bbs.nga.cn/thread.php?fid=${ctx.ngaFid}&order_by=postdatedesc&rand=${Date.now()}`;
    let html = await fetchText(url, {
      headers: { Cookie: cookieHeader(cookie) },
    });

    if (html.includes("访客不能直接访问") || html.includes("ERROR:15")) {
      const guestJs = html.match(/guestJs=([0-9]+_[a-z0-9]+)/i)?.[1];
      if (guestJs) {
        await new Promise((r) => setTimeout(r, 400));
        html = await fetchText(`${url}&rand2=${Date.now()}`, {
          headers: { Cookie: cookieHeader(`guestJs=${guestJs}`, cookie) },
        });
      }
    }

    if (html.includes("访客不能直接访问")) {
      errors.push("NGA blocked guest access — set NGA_COOKIE from logged-in browser");
    } else {
      hints.push(...parseNgaThreadList(html, ctx.ngaFid));
    }
  } catch (e) {
    errors.push(`nga: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { platform: "nga", hints, errors };
}
