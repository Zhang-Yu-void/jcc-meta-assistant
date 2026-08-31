import type { ParsedCompHint, RawPostHint } from "./types.js";
import type { MetaBundle } from "@jcc/meta-schema";
import { championByName } from "./champions.js";

const COMP_KEYWORDS = ["阵容", "吃鸡", "上分", "T0", "T1", "S级", "A级", "羁绊", "运营", "推荐", "攻略", "思路"];

export function isRelevantPost(text: string): boolean {
  if (COMP_KEYWORDS.some((k) => text.includes(k))) return true;
  if (/【[^】]{2,16}】/.test(text) && /T0|T1|胜率|登顶|S级|A级/.test(text)) return true;
  return false;
}

export function extractBracketName(text: string): string | null {
  const m = text.match(/【([^】]{2,20})】/);
  return m?.[1]?.trim() ?? null;
}

export function extractCompName(title: string, body: string): string {
  const fromBracket = extractBracketName(title) ?? extractBracketName(body);
  if (fromBracket) return fromBracket;
  const fromPattern = title.match(/([\u4e00-\u9fffA-Za-z0-9]{2,12})阵容/)?.[1]?.trim();
  if (fromPattern) return fromPattern;
  const sliced = title.slice(0, 24).trim();
  return sliced || "未命名阵容";
}

export function extractTier(text: string): "S" | "A" | "B" {
  if (/T0|S级|S 级|登顶|断层|版本答案/.test(text)) return "S";
  if (/T1|A级|A 级|强势|上分/.test(text)) return "A";
  return "B";
}

export function extractWinRate(text: string): number {
  const m = text.match(/胜率[^0-9]*(\d+(?:\.\d+)?)\s*%/);
  if (m) return Math.min(1, Number(m[1]) / 100);
  const m2 = text.match(/(\d+(?:\.\d+)?)\s*%[^%]{0,6}胜率/);
  if (m2) return Math.min(1, Number(m2[1]) / 100);
  if (/T0|登顶|断层/.test(text)) return 0.17;
  if (/T1|强势/.test(text)) return 0.14;
  return 0.1;
}

export function extractPickRate(text: string, engagement = 0): number {
  if (/热门|人手/.test(text)) return 0.1;
  if (engagement > 500) return 0.08;
  if (engagement > 100) return 0.05;
  return 0.03;
}

export function extractChampionNames(text: string, registry: MetaBundle): string[] {
  const names = registry.champions.map((c) => c.name).sort((a, b) => b.length - a.length);
  const found: string[] = [];
  let remaining = text;
  for (const name of names) {
    if (remaining.includes(name) && !found.includes(name)) {
      found.push(name);
      remaining = remaining.replaceAll(name, "");
    }
  }
  return found.slice(0, 10);
}

export function parsePostHint(post: RawPostHint, registry: MetaBundle): ParsedCompHint | null {
  const text = `${post.title}\n${post.body}`.trim();
  if (!isRelevantPost(text)) return null;

  const name = extractCompName(post.title, post.body);
  const tier = extractTier(text);
  const winRateHint = extractWinRate(text);
  const pickRateHint = extractPickRate(text, post.engagement ?? 0);
  const unitNames = extractChampionNames(text, registry);

  return {
    name,
    tier,
    winRateHint,
    pickRateHint,
    unitNames,
    notes: post.body.slice(0, 200) || post.title,
    source: { platform: post.platform, title: post.title || name, url: post.url },
  };
}

export function slugCompId(name: string, platform: string): string {
  return `${platform}-${name.replace(/\s+/g, "-").slice(0, 24)}`;
}
