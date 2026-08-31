import type { MetaBundle } from "@jcc/meta-schema";

export type CrawlSource = "taptap" | "xhs" | "nga";

export type RawPostHint = {
  platform: CrawlSource;
  title: string;
  body: string;
  url: string;
  publishedAt?: string;
  engagement?: number;
};

export type ParsedCompHint = {
  name: string;
  tier: "S" | "A" | "B";
  winRateHint: number;
  pickRateHint: number;
  unitNames: string[];
  notes: string;
  source: { platform: string; title: string; url: string };
};

export type CrawlContext = {
  registry: MetaBundle;
  userAgent: string;
  taptapGroupId: string;
  ngaFid: string;
  xhsKeyword: string;
  ngaCookie?: string;
  xhsCookie?: string;
  rateLimitMs: number;
};

export type AdapterResult = {
  platform: CrawlSource;
  hints: RawPostHint[];
  errors: string[];
};

export type CrawlAdapter = {
  name: CrawlSource;
  crawl(ctx: CrawlContext): Promise<AdapterResult>;
};
