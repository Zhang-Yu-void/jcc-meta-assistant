import { rateLimitedFetch } from "../fetch.js";
import * as cheerio from "cheerio";
import type { AdapterResult, CrawlContext, RawPostHint } from "../types.js";
import { isRelevantPost } from "../parse.js";

type XhsNoteItem = {
  model_type?: string;
  id?: string;
  xsec_token?: string;
  note_card?: {
    display_title?: string;
    user?: { nickname?: string; nick_name?: string };
    interact_info?: {
      liked_count?: string | number;
      collected_count?: string | number;
      comment_count?: string | number;
    };
  };
};

export type XhsSearchNotesResponse = {
  success?: boolean;
  code?: number;
  msg?: string;
  data?: { items?: XhsNoteItem[]; has_more?: boolean };
};

export function parseXhsSearchNotesJson(data: XhsSearchNotesResponse): RawPostHint[] {
  const hints: RawPostHint[] = [];
  for (const item of data.data?.items ?? []) {
    if (item.model_type && item.model_type !== "note") continue;
    const title = item.note_card?.display_title?.trim();
    if (!title) continue;
    if (!isRelevantPost(title) && !title.includes("阵")) continue;
    const nick = item.note_card?.user?.nickname ?? item.note_card?.user?.nick_name ?? "";
    const liked = Number(item.note_card?.interact_info?.liked_count ?? 0) || 0;
    const collected = Number(item.note_card?.interact_info?.collected_count ?? 0) || 0;
    const id = item.id ?? "";
    const token = item.xsec_token ? `?xsec_token=${encodeURIComponent(item.xsec_token)}` : "";
    hints.push({
      platform: "xhs",
      title,
      body: nick ? `作者：${nick}` : "",
      url: id ? `https://www.xiaohongshu.com/explore/${id}${token}` : "https://www.xiaohongshu.com/search_result",
      engagement: liked + collected,
    });
  }
  const dedup = new Map<string, RawPostHint>();
  for (const h of hints) dedup.set(h.title, h);
  return [...dedup.values()].slice(0, 30);
}

/** Legacy HTML fallback (SSR usually empty). */
export function parseXhsSearchHtml(html: string): RawPostHint[] {
  const hints: RawPostHint[] = [];
  const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
  if (stateMatch) {
    try {
      const state = JSON.parse(stateMatch[1].replace(/undefined/g, "null")) as {
        search?: { feeds?: { items?: Array<{ noteCard?: { displayTitle?: string; user?: { nickname?: string } }; id?: string }> } };
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
      /* fall through */
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

function buildSearchBody(ctx: CrawlContext): Record<string, unknown> {
  return {
    keyword: ctx.xhsKeyword,
    page: 1,
    page_size: 20,
    search_id: ctx.xhsSearchId ?? `jcc${Date.now().toString(36)}`,
    sort: "general",
    note_type: 0,
    ext_flags: [],
    geo: "",
    image_formats: ["jpg", "webp", "avif"],
    session_id: ctx.xhsSessionId ?? "00000000-0000-0000-0000-000000000000",
  };
}

export async function crawlXhs(ctx: CrawlContext): Promise<AdapterResult> {
  const hints: RawPostHint[] = [];
  const errors: string[] = [];

  if (!ctx.xhsCookie) {
    errors.push("XHS skipped — set XHS_COOKIE (copy from browser) to enable");
    return { platform: "xhs", hints, errors };
  }

  if (!ctx.xhsXs || !ctx.xhsXsCommon || !ctx.xhsXt) {
    errors.push(
      "XHS needs signed headers — set XHS_X_S / XHS_X_S_COMMON / XHS_X_T from browser Network (search/notes request). Cookie alone is not enough.",
    );
    return { platform: "xhs", hints, errors };
  }

  try {
    const body = buildSearchBody(ctx);
    const url = ctx.xhsSearchUrl ?? "https://so.xiaohongshu.com/api/sns/web/v2/search/notes";
    const headers: Record<string, string> = {
      Cookie: ctx.xhsCookie,
      Referer: "https://www.xiaohongshu.com/",
      Origin: "https://www.xiaohongshu.com",
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json;charset=UTF-8",
      "x-s": ctx.xhsXs,
      "x-s-common": ctx.xhsXsCommon,
      "x-t": ctx.xhsXt,
    };
    if (ctx.xhsRapParam) headers["x-rap-param"] = ctx.xhsRapParam;
    if (ctx.xhsB3TraceId) headers["x-b3-traceid"] = ctx.xhsB3TraceId;
    if (ctx.xhsXrayTraceId) headers["x-xray-traceid"] = ctx.xhsXrayTraceId;

    const res = await rateLimitedFetch(
      url,
      { method: "POST", headers, body: JSON.stringify(body) },
      ctx.rateLimitMs,
    );
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);

    let json: XhsSearchNotesResponse;
    try {
      json = JSON.parse(text) as XhsSearchNotesResponse;
    } catch {
      throw new Error(`invalid JSON: ${text.slice(0, 120)}`);
    }

    if (json.success === false || (json.code != null && json.code !== 0)) {
      errors.push(`XHS API rejected: code=${json.code} msg=${json.msg ?? ""} — refresh x-s headers from browser`);
      return { platform: "xhs", hints, errors };
    }

    hints.push(...parseXhsSearchNotesJson(json));
    if (!hints.length) errors.push("XHS returned no relevant notes");
  } catch (e) {
    errors.push(`xhs: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { platform: "xhs", hints, errors };
}
