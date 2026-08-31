import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseMetaBundle } from "@jcc/meta-schema";
import { loadRegistry } from "./champions.js";
import { crawlTapTap } from "./adapters/taptap.js";
import { crawlNga } from "./adapters/nga.js";
import { crawlXhs } from "./adapters/xhs.js";
import { mergeHintsIntoBundle } from "./merge.js";
import { parsePostHint } from "./parse.js";
import type { AdapterResult, CrawlContext } from "./types.js";

export type CrawlRunOptions = {
  registryPath?: string;
  outputPath?: string;
  reloadUrl?: string;
  adminToken?: string;
  skipPlatforms?: string[];
};

export type CrawlRunReport = {
  outputPath: string;
  compositionCount: number;
  byPlatform: Record<string, number>;
  errors: string[];
  version: string;
};

function defaultContext(registryPath?: string): CrawlContext {
  loadRegistry(registryPath);
  return {
    registry: loadRegistry(registryPath),
    userAgent: process.env.CRAWLER_USER_AGENT ?? "",
    taptapGroupId: process.env.TAPTAP_GROUP_ID ?? "213275",
    ngaFid: process.env.NGA_FID ?? "510461",
    xhsKeyword: process.env.XHS_KEYWORD ?? "金铲铲之战 阵容",
    ngaCookie: process.env.NGA_COOKIE,
    xhsCookie: process.env.XHS_COOKIE,
    rateLimitMs: Number(process.env.CRAWLER_RATE_MS ?? 800),
  };
}

export async function runCrawl(opts: CrawlRunOptions = {}): Promise<CrawlRunReport> {
  const ctx = defaultContext(opts.registryPath);
  const skip = new Set((opts.skipPlatforms ?? []).map((s) => s.toLowerCase()));
  const results: AdapterResult[] = [];

  if (!skip.has("taptap")) results.push(await crawlTapTap(ctx));
  if (!skip.has("nga")) results.push(await crawlNga(ctx));
  if (!skip.has("xhs")) results.push(await crawlXhs(ctx));

  const hints = results.flatMap((r) => r.hints);
  const errors = results.flatMap((r) => r.errors);
  const parsed = hints
    .map((h) => parsePostHint(h, ctx.registry))
    .filter((x): x is NonNullable<typeof x> => x != null);

  const bundle = mergeHintsIntoBundle(ctx.registry, parsed);
  parseMetaBundle(bundle);

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const outputPath = opts.outputPath ?? path.join(root, "data/live/bundle.json");
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(bundle, null, 2), "utf-8");

  const byPlatform: Record<string, number> = {};
  for (const h of hints) byPlatform[h.platform] = (byPlatform[h.platform] ?? 0) + 1;

  const reloadUrl = opts.reloadUrl ?? process.env.PUBLISHER_RELOAD_URL;
  const adminToken = opts.adminToken ?? process.env.ADMIN_TOKEN;
  if (reloadUrl && adminToken) {
    try {
      const res = await fetch(reloadUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!res.ok) errors.push(`reload failed: HTTP ${res.status}`);
    } catch (e) {
      errors.push(`reload failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    outputPath,
    compositionCount: bundle.compositions.length,
    byPlatform,
    errors,
    version: bundle.version,
  };
}
