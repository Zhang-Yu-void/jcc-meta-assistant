import { describe, expect, it } from "vitest";
import { parseMetaBundle } from "@jcc/meta-schema";
import { rankCompositions, suggestNext, traitProgress } from "./index.js";
import sample from "../../../data/sample/bundle.json" with { type: "json" };

const bundle = parseMetaBundle(sample);

describe("rankCompositions", () => {
  it("ranks a near-complete core highest", () => {
    const core = bundle.compositions[0].core;
    const ranked = rankCompositions(core, bundle, 3);
    expect(ranked[0].composition.id).toBe(bundle.compositions[0].id);
    expect(ranked[0].score).toBeGreaterThan(ranked[1]?.score ?? -Infinity);
  });

  it("returns empty owned as low but valid scores", () => {
    const ranked = rankCompositions([], bundle, 3);
    expect(ranked).toHaveLength(3);
  });

  it("ranks under 50ms for sample bundle", () => {
    const owned = bundle.champions.slice(0, 6).map((c) => c.id);
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) rankCompositions(owned, bundle, 3);
    const avg = (performance.now() - t0) / 100;
    expect(avg).toBeLessThan(50);
  });
});

describe("suggestNext", () => {
  it("suggests missing priority units", () => {
    const ranked = rankCompositions([], bundle, 1)[0];
    const s = suggestNext([], ranked, new Map(bundle.champions.map((c) => [c.id, c.cost])));
    expect(s.pickIds.length).toBeGreaterThan(0);
    expect(s.pickIds.every((id) => ranked.missingIds.includes(id))).toBe(true);
  });
});

describe("traitProgress", () => {
  it("counts traits from owned champions", () => {
    const id = bundle.champions[0].id;
    const progress = traitProgress([id], bundle);
    expect(progress.some((p) => p.count >= 1)).toBe(true);
  });
});
