import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYOUT,
  FP_LEN,
  FP_SIZE,
  HSV_BINS,
  MATCH_MARGIN,
  MATCH_THRESHOLD,
  buildFingerprint,
  costFromRgb,
  cropSlots,
  hsvHistogram,
  matchFingerprint,
  matchNcc,
  matchSlots,
  slotsFromNative,
  voteBoardOwnedIds,
  type RgbImage,
} from "./index.js";

function solid(width: number, height: number, r: number, g: number, b: number): RgbImage {
  const data = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    data[i * 3] = r;
    data[i * 3 + 1] = g;
    data[i * 3 + 2] = b;
  }
  return { width, height, data };
}

function splitFace(width: number, height: number, left: [number, number, number], right: [number, number, number]): RgbImage {
  const data = new Uint8Array(width * height * 3);
  const mid = Math.floor(width / 2);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const c = x < mid ? left : right;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
    }
  }
  return { width, height, data };
}

describe("fingerprint size", () => {
  it("uses 24x24 RGB fingerprints", () => {
    expect(FP_SIZE).toBe(24);
    expect(FP_LEN).toBe(24 * 24 * 3);
    const fp = buildFingerprint(solid(48, 48, 10, 20, 30));
    expect(fp).toHaveLength(FP_LEN);
  });
});

describe("matchNcc / matchFingerprint", () => {
  it("gives near-1 to identical spatial patterns", () => {
    const a = buildFingerprint(splitFace(32, 32, [200, 40, 40], [40, 40, 200]));
    const b = buildFingerprint(splitFace(32, 32, [200, 40, 40], [40, 40, 200]));
    expect(matchNcc(a, b)).toBeGreaterThan(0.95);
    expect(matchFingerprint(a, b)).toBeGreaterThan(0.9);
  });

  it("separates same-palette mirrored faces with margin >= 0.08", () => {
    const leftRed = buildFingerprint(splitFace(32, 32, [210, 50, 40], [40, 50, 210]));
    const rightRed = buildFingerprint(splitFace(32, 32, [40, 50, 210], [210, 50, 40]));
    const self = matchFingerprint(leftRed, leftRed);
    const other = matchFingerprint(leftRed, rightRed);
    expect(self - other).toBeGreaterThanOrEqual(MATCH_MARGIN);
  });
});

describe("hsvHistogram", () => {
  it("has 16 bins and differs for red vs green", () => {
    const red = hsvHistogram(buildFingerprint(solid(16, 16, 220, 20, 20)));
    const green = hsvHistogram(buildFingerprint(solid(16, 16, 20, 200, 30)));
    expect(red).toHaveLength(HSV_BINS);
    expect(green).toHaveLength(HSV_BINS);
    const peakRed = red.indexOf(Math.max(...red));
    const peakGreen = green.indexOf(Math.max(...green));
    expect(peakRed).not.toBe(peakGreen);
  });
});

describe("costFromRgb", () => {
  it("maps shop border colors to 1-5 cost", () => {
    expect(costFromRgb(180, 180, 185)).toBe(1);
    expect(costFromRgb(40, 180, 70)).toBe(2);
    expect(costFromRgb(50, 90, 210)).toBe(3);
    expect(costFromRgb(160, 50, 200)).toBe(4);
    expect(costFromRgb(220, 180, 50)).toBe(5);
  });
});

describe("matchSlots", () => {
  it("labels a crop with the closest champion", () => {
    const face = buildFingerprint(splitFace(24, 24, [200, 40, 40], [40, 40, 200]));
    const other = buildFingerprint(splitFace(24, 24, [40, 180, 40], [20, 80, 20]));
    const result = matchSlots(
      [{ region: "shop", index: 0, fingerprint: face }],
      [
        { id: "ahri", fingerprint: face, cost: 4 },
        { id: "jinx", fingerprint: other, cost: 2 },
      ],
    );
    expect(result[0].id).toBe("ahri");
    expect(result[0].confidence).toBeGreaterThan(MATCH_THRESHOLD);
  });

  it("returns null below threshold", () => {
    const red = buildFingerprint(solid(24, 24, 220, 20, 20));
    const blue = buildFingerprint(solid(24, 24, 20, 20, 220));
    const result = matchSlots([{ region: "board", index: 0, fingerprint: red }], [
      { id: "jinx", fingerprint: blue, cost: 2 },
    ]);
    expect(result[0].id).toBeNull();
  });

  it("leaves empty low-variance slots unmatched", () => {
    const gray = buildFingerprint(solid(24, 24, 40, 40, 40));
    const red = buildFingerprint(solid(24, 24, 220, 20, 20));
    const result = matchSlots([{ region: "board", index: 0, fingerprint: gray }], [
      { id: "ahri", fingerprint: red, cost: 4 },
    ]);
    expect(result[0].id).toBeNull();
  });

  it("rejects near-ties even when best is above threshold", () => {
    const a = buildFingerprint(splitFace(24, 24, [180, 40, 40], [40, 40, 180]));
    const b = buildFingerprint(splitFace(24, 24, [176, 42, 42], [42, 42, 176]));
    const probe = buildFingerprint(splitFace(24, 24, [178, 41, 41], [41, 41, 178]));
    const result = matchSlots(
      [{ region: "board", index: 0, fingerprint: probe }],
      [
        { id: "ahri", fingerprint: a, cost: 4 },
        { id: "syndra", fingerprint: b, cost: 4 },
      ],
    );
    expect(result[0].id).toBeNull();
    expect(result[0].confidence).toBeGreaterThan(0.5);
  });

  it("uses costHint to drop cross-cost candidates", () => {
    const face = buildFingerprint(splitFace(24, 24, [200, 40, 40], [40, 40, 200]));
    const result = matchSlots(
      [{ region: "shop", index: 0, fingerprint: face, costHint: 1 }],
      [
        { id: "syndra", fingerprint: face, cost: 5 },
        { id: "garen", fingerprint: face, cost: 1 },
      ],
    );
    expect(result[0].id).toBe("garen");
  });
});

describe("cropSlots", () => {
  it("splits the shop row into 5 slots with 24x24 fingerprints", () => {
    const img = solid(100, 100, 10, 10, 10);
    const slots = cropSlots(img, DEFAULT_LAYOUT);
    expect(slots.filter((s) => s.region === "shop")).toHaveLength(5);
    expect(slots.filter((s) => s.region === "board")).toHaveLength(28);
    expect(slots[0].fingerprint).toHaveLength(FP_LEN);
  });
});

describe("slotsFromNative", () => {
  it("trusts native ids and skips rematch when fingerprints are omitted", () => {
    const slots = slotsFromNative(
      [{ region: "board", index: 0, id: "ahri", confidence: 0.91 }],
      [{ id: "jinx", fingerprint: buildFingerprint(solid(24, 24, 20, 200, 30)), cost: 2 }],
    );
    expect(slots[0].id).toBe("ahri");
    expect(slots[0].confidence).toBeCloseTo(0.91);
  });
});

describe("voteBoardOwnedIds", () => {
  it("requires the same id on two consecutive frames", () => {
    const slot = { region: "board" as const, index: 0, id: "ahri", confidence: 0.9 };
    const first = voteBoardOwnedIds([], [slot]);
    expect(first.ownedIds).toEqual([]);
    const second = voteBoardOwnedIds(first.nextPrev, [slot]);
    expect(second.ownedIds).toEqual(["ahri"]);
  });

  it("does not confirm a swapped id until it repeats", () => {
    const ahri = { region: "board" as const, index: 0, id: "ahri", confidence: 0.9 };
    const jinx = { region: "board" as const, index: 0, id: "jinx", confidence: 0.9 };
    const first = voteBoardOwnedIds([], [ahri]);
    const swapped = voteBoardOwnedIds(first.nextPrev, [jinx]);
    expect(swapped.ownedIds).toEqual([]);
    const confirmed = voteBoardOwnedIds(swapped.nextPrev, [jinx]);
    expect(confirmed.ownedIds).toEqual(["jinx"]);
  });
});
