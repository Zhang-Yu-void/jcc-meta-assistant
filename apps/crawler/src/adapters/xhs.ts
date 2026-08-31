import * as cheerio from "cheerio";
import { fetchText } from "../fetch.js";
import type { AdapterResult, CrawlContext, RawPostHint } from "../types.js";
import { isRelevantPost } from "../parse.js";

export function parseXhsSearchHtml(html: string): RawPostHint[] {
  const hints: RawPostHint[] = [];

  const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
  if (stateMatch) {
    try {
      const state = JSON.parse(stateMatch[1].replace(/undefined/g, "null")) as {
        search?: { feeds?: { items?: Array<{ noteCard?: { displayTitle?: string; user?: { nickname?: string } }; id?: string; xsecToken?: string }> } };
      };
      const items = state.search?.feeds?.items ?? [];
      for (const item of items) {
        const title = item.noteCard?.displayTitle?.trim();
        if (!title) continue;
        if (!isRelevantPost(title) && !title.includes("阵")) continue;
        const id = item.id ?? "";
        hints.push({
          platform: "xhs",
          title,
          body: item.noteCard?.user?.nickname ? `作者：${item.noteCard.user.nickname}` : "",
          url: id ? `https://www.xiaohongshu.com/explore/${id}` : "https://www.xiaohongshu.com/search_result",
        });
      }
      if (hints.length) return hints.slice(0, 30);
    } catch {
      /* fall through to cheerio */
    }
  }

  const $ = cheerio.load(html);
  $("a, span, div").each((_, el) => {
    const text = $(el).text().trim();
    if (text.length < 6 || text.length > 80) return;
    if (!isRelevantPost(text) && !text.includes("阵")) return;
    hints.push({
      platform: "xhs",
      title: text,
      body: "",
      url: "https://www.xiaohongshu.com/search_result",
    });
  });

  const dedup = new Map<string, RawPostHint>();
  for (const h of hints) dedup.set(h.title, h);
  return [...dedup.values()].slice(0, 20);
}

export async function crawlXhs(ctx: CrawlContext): Promise<AdapterResult> {
  const hints: RawPostHint[] = [];
  const errors: string[] = [];

  if (!ctx.xhsCookie) {
    errors.push("XHS skipped — set XHS_COOKIE (copy from browser) to enable");
    return { platform: "xhs", hints, errors };
  }

  try {
    const kw = encodeURIComponent(ctx.xhsKeyword);
    const url = `https://www.xiaohongshu.com/search_result?keyword=${kw}&source=web_search_result_notes`;
    const html = await fetchText(url, {
      headers: {
        Cookie: ctx.xhsCookie,
        Referer: "https://www.xiaohongshu.com/",
      },
    });
    hints.push(...parseXhsSearchHtml(html));
    if (!hints.length) errors.push("XHS returned no comp posts — cookie may be expired");
  } catch (e) {
    errors.push(`xhs: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { platform: "xhs", hints, errors };
}
