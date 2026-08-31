import { describe, expect, it } from "vitest";
import { loadRegistry } from "./champions.js";
import {
  extractCompName,
  extractTier,
  extractWinRate,
  extractChampionNames,
  isRelevantPost,
  parsePostHint,
} from "./parse.js";
import { mergeHintsIntoBundle } from "./merge.js";
import { parseTapFeedJson } from "./adapters/taptap.js";
import { parseNgaThreadList } from "./adapters/nga.js";
import { parseXhsSearchHtml } from "./adapters/xhs.js";
import fixture from "../fixtures/taptap-feed.json" with { type: "json" };

describe("parse", () => {
  const registry = loadRegistry();

  it("detects relevant posts", () => {
    expect(isRelevantPost("【森林月男】新晋T0阵容 胜率断层登顶！")).toBe(true);
    expect(isRelevantPost("今天天气不错")).toBe(false);
  });

  it("extracts comp metadata", () => {
    const title = "【森林月男】新晋T0阵容 胜率断层登顶！";
    expect(extractCompName(title, "")).toBe("森林月男");
    expect(extractTier(title)).toBe("S");
    expect(extractWinRate("胜率 18.5% 登顶")).toBeCloseTo(0.185);
  });

  it("parses post into comp hint", () => {
    const hint = parsePostHint(
      {
        platform: "taptap",
        title: "【法师九五】S级阵容 胜率15%",
        body: "核心 阿狸 辛德拉 拉克丝",
        url: "https://example.com",
      },
      registry,
    );
    expect(hint?.name).toBe("法师九五");
    expect(hint?.tier).toBe("S");
    expect(hint?.unitNames).toContain("阿狸");
  });
});

describe("merge", () => {
  it("merges hints into bundle", () => {
    const registry = loadRegistry();
    const hints = [
      parsePostHint(
        {
          platform: "taptap",
          title: "【测试阵】T0阵容",
          body: "阿狸 辛德拉",
          url: "u1",
        },
        registry,
      )!,
    ];
    const bundle = mergeHintsIntoBundle(registry, hints);
    expect(bundle.compositions.length).toBe(1);
    expect(bundle.compositions[0].sources[0].platform).toBe("taptap");
  });
});

describe("adapters", () => {
  it("parses taptap feed fixture", () => {
    const hints = parseTapFeedJson(fixture as never);
    expect(hints.length).toBeGreaterThan(0);
  });

  it("parses nga thread titles", () => {
    const html = `<a href="/read.php?tid=123">[阵容] 法师九五上分攻略</a>`;
    const hints = parseNgaThreadList(html, "510461");
    expect(hints[0].title).toContain("阵容");
  });

  it("parses xhs search titles from html", () => {
    const html = `<div>金铲铲之战 S级阵容 法师主C推荐</div>`;
    const hints = parseXhsSearchHtml(html);
    expect(hints.some((h) => h.title.includes("阵容"))).toBe(true);
  });
});
