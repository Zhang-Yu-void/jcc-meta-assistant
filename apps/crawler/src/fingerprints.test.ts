import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { parseMetaBundle } from "@jcc/meta-schema";
import { FP_LEN } from "@jcc/screen-match";
import { applyPortraitFingerprints } from "./fingerprints.js";

function solidPng(r: number, g: number, b: number): Buffer {
  const png = new PNG({ width: 8, height: 8 });
  for (let i = 0; i < 64; i++) {
    png.data[i * 4] = r;
    png.data[i * 4 + 1] = g;
    png.data[i * 4 + 2] = b;
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

describe("applyPortraitFingerprints", () => {
  it("attaches 24x24 fingerprints from portrait pngs", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "jcc-fp-"));
    writeFileSync(path.join(dir, "ahri.png"), solidPng(220, 40, 40));
    const bundle = parseMetaBundle({
      version: "1",
      updatedAt: "2026-09-04T00:00:00Z",
      setId: "s",
      setName: "s",
      champions: [{ id: "ahri", name: "阿狸", cost: 4, traits: ["法师"] }],
      traits: [{ id: "mage", name: "法师", breakpoints: [3] }],
      compositions: [
        {
          id: "c1",
          name: "x",
          tier: "S",
          winRateHint: 0.1,
          pickRateHint: 0.1,
          sources: [],
          core: ["ahri"],
          units: ["ahri"],
          priority: ["ahri"],
          notes: "",
        },
      ],
    });
    const n = applyPortraitFingerprints(bundle, dir);
    expect(n).toBe(1);
    expect(bundle.champions[0].fingerprint).toHaveLength(FP_LEN);
  });

  it("no-ops when portrait dir is missing", () => {
    const bundle = parseMetaBundle({
      version: "1",
      updatedAt: "2026-09-04T00:00:00Z",
      setId: "s",
      setName: "s",
      champions: [{ id: "ahri", name: "阿狸", cost: 4, traits: ["法师"] }],
      traits: [{ id: "mage", name: "法师", breakpoints: [3] }],
      compositions: [
        {
          id: "c1",
          name: "x",
          tier: "S",
          winRateHint: 0.1,
          pickRateHint: 0.1,
          sources: [],
          core: ["ahri"],
          units: ["ahri"],
          priority: ["ahri"],
          notes: "",
        },
      ],
    });
    expect(applyPortraitFingerprints(bundle, "/tmp/jcc-missing-portraits")).toBe(0);
    expect(bundle.champions[0].fingerprint).toEqual([]);
  });
});
