import { describe, expect, it } from "vitest";
import { parseMetaBundle } from "./index.js";

describe("parseMetaBundle", () => {
  it("accepts a minimal valid bundle", () => {
    const bundle = parseMetaBundle({
      version: "2026.08.31.1",
      updatedAt: "2026-08-31T02:00:00Z",
      setId: "sample-set",
      setName: "示例赛季",
      champions: [{ id: "ahri", name: "阿狸", cost: 4, traits: ["法师"] }],
      traits: [{ id: "mage", name: "法师", breakpoints: [3, 5, 7] }],
      compositions: [
        {
          id: "c1",
          name: "法师示例",
          tier: "S",
          winRateHint: 0.18,
          pickRateHint: 0.06,
          sources: [{ platform: "sample", title: "示例", url: "" }],
          core: ["ahri"],
          units: ["ahri"],
          priority: ["ahri"],
          notes: "demo",
        },
      ],
    });
    expect(bundle.version).toBe("2026.08.31.1");
    expect(bundle.compositions[0].tier).toBe("S");
  });

  it("rejects invalid tier", () => {
    expect(() =>
      parseMetaBundle({
        version: "1",
        updatedAt: "2026-08-31T02:00:00Z",
        setId: "s",
        setName: "s",
        champions: [],
        traits: [],
        compositions: [
          {
            id: "c1",
            name: "x",
            tier: "Z",
            winRateHint: 0.1,
            pickRateHint: 0.1,
            sources: [],
            core: [],
            units: [],
            priority: [],
            notes: "",
          },
        ],
      }),
    ).toThrow();
  });
});
