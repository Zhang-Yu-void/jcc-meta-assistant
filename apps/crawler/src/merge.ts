import type { Composition, MetaBundle } from "@jcc/meta-schema";
import type { ParsedCompHint } from "./types.js";
import { namesToIds, slugify } from "./champions.js";
import { slugCompId } from "./parse.js";

function normalizeName(name: string): string {
  return name.replace(/\s+/g, "").toLowerCase();
}

const TIER_RANK: Record<"S" | "A" | "B", number> = { S: 3, A: 2, B: 1 };

function toComposition(registry: MetaBundle, hint: ParsedCompHint): Composition | null {
  const unitIds = namesToIds(registry, hint.unitNames);
  if (!unitIds.length) return null;
  const core = unitIds.slice(0, Math.min(2, unitIds.length));
  const priority = unitIds.slice(0, Math.min(5, unitIds.length));

  return {
    id: slugCompId(slugify(hint.name), hint.source.platform),
    name: hint.name,
    tier: hint.tier,
    winRateHint: hint.winRateHint,
    pickRateHint: hint.pickRateHint,
    sources: [hint.source],
    core,
    units: unitIds,
    priority,
    notes: hint.notes,
  };
}

function mergeTwo(a: Composition, b: Composition): Composition {
  const tier = TIER_RANK[a.tier] >= TIER_RANK[b.tier] ? a.tier : b.tier;
  const units = [...new Set([...a.units, ...b.units])];
  const core = [...new Set([...a.core, ...b.core])].slice(0, 3);
  const priority = [...new Set([...a.priority, ...b.priority])].slice(0, 6);
  const sources = [...a.sources, ...b.sources].filter(
    (s, i, arr) => arr.findIndex((x) => x.url === s.url && x.platform === s.platform) === i,
  );

  return {
    ...a,
    tier,
    winRateHint: Math.max(a.winRateHint, b.winRateHint),
    pickRateHint: Math.max(a.pickRateHint, b.pickRateHint),
    units: units.length ? units : a.units,
    core: core.length ? core : a.core,
    priority: priority.length ? priority : a.priority,
    sources,
    notes: a.notes.length >= b.notes.length ? a.notes : b.notes,
  };
}

export function mergeHintsIntoBundle(registry: MetaBundle, hints: ParsedCompHint[]): MetaBundle {
  const map = new Map<string, Composition>();

  for (const hint of hints) {
    const comp = toComposition(registry, hint);
    if (!comp) continue;
    const key = normalizeName(comp.name);
    const prev = map.get(key);
    map.set(key, prev ? mergeTwo(prev, comp) : comp);
  }

  const now = new Date();
  const version = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}.${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

  return {
    ...registry,
    version,
    updatedAt: now.toISOString(),
    setId: registry.setId || "live-set",
    setName: registry.setName || "实时爬取",
    compositions: [...map.values()].sort((a, b) => b.winRateHint - a.winRateHint),
  };
}
