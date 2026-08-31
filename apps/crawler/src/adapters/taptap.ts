import { fetchJson, getTapTapXUa, rateLimitedFetch } from "../fetch.js";
import type { AdapterResult, CrawlContext, RawPostHint } from "../types.js";
import { isRelevantPost } from "../parse.js";

type TapFeedItem = {
  type?: string;
  moment?: {
    id_str?: string;
    created_time?: number;
    topic?: {
      title?: string;
      summary?: string;
      contents?: Array<{ type?: string; text?: string }>;
    };
    stat?: { ups?: number; comments?: number; pv_total?: number };
  };
};

type TapFeedResponse = {
  success?: boolean;
  data?: { list?: TapFeedItem[] };
};

function momentText(item: TapFeedItem): { title: string; body: string; id: string; engagement: number } {
  const m = item.moment ?? {};
  const t = m.topic ?? {};
  const title = (t.title ?? "").trim();
  const summary = (t.summary ?? "").trim();
  const bodyParts = (t.contents ?? [])
    .filter((c) => c.type === "text" && c.text)
    .map((c) => c.text as string);
  const body = [summary, ...bodyParts].filter(Boolean).join("\n");
  const stat = m.stat ?? {};
  const engagement = (stat.ups ?? 0) + (stat.comments ?? 0) + Math.floor((stat.pv_total ?? 0) / 10);
  return { title: title || summary.slice(0, 40), body, id: m.id_str ?? "", engagement };
}

export async function crawlTapTap(ctx: CrawlContext): Promise<AdapterResult> {
  const hints: RawPostHint[] = [];
  const errors: string[] = [];
  const pages = Number(process.env.TAPTAP_PAGES ?? 3);

  for (let page = 0; page < pages; page++) {
    try {
      const url = new URL("https://www.taptap.cn/webapiv2/feed/v7/by-group");
      url.searchParams.set("type", "feed");
      url.searchParams.set("group_id", ctx.taptapGroupId);
      url.searchParams.set("sort", "default");
      url.searchParams.set("limit", "10");
      url.searchParams.set("status", "0");
      url.searchParams.set("with_hot_comment", "true");
      url.searchParams.set("__times", String(page));

      const res = await rateLimitedFetch(url.toString(), {
        headers: { "X-UA": getTapTapXUa() },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as TapFeedResponse;
      const list = json.data?.list ?? [];
      if (!list.length) break;

      for (const item of list) {
        if (item.type !== "moment") continue;
        const { title, body, id, engagement } = momentText(item);
        const text = `${title}\n${body}`;
        if (!isRelevantPost(text) && !title.includes("阵")) continue;
        hints.push({
          platform: "taptap",
          title,
          body,
          url: id ? `https://www.taptap.cn/moment/${id}` : `https://www.taptap.cn/app/176937/topic`,
          engagement,
        });
      }
    } catch (e) {
      errors.push(`taptap page ${page}: ${e instanceof Error ? e.message : String(e)}`);
      break;
    }
  }

  return { platform: "taptap", hints, errors };
}

export function parseTapFeedJson(raw: TapFeedResponse): RawPostHint[] {
  const hints: RawPostHint[] = [];
  for (const item of raw.data?.list ?? []) {
    if (item.type !== "moment") continue;
    const { title, body, id, engagement } = momentText(item);
    hints.push({
      platform: "taptap",
      title,
      body,
      url: `https://www.taptap.cn/moment/${id}`,
      engagement,
    });
  }
  return hints;
}
