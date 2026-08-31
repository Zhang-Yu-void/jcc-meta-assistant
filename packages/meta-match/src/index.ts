import type { Composition, MetaBundle } from "@jcc/meta-schema";

const W_UNIT = 10;
const W_CORE = 25;
const W_TIER: Record<"S" | "A" | "B", number> = { S: 8, A: 4, B: 0 };
const W_WR = 20;
const MISS_CORE_COST = 6;
const MISS_PRI_COST = 3;

export type MatchResult = {
  composition: Composition;
  score: number;
  ownedIds: string[];
  missingIds: string[];
};

export type SuggestResult = {
  pickIds: string[];
  sellIds: string[];
};

export type TraitProgress = {
  traitId: string;
  name: string;
  count: number;
  nextBreakpoint: number | null;
};

export function scoreComposition(
  owned: Set<string>,
  comp: Composition,
  champCost: Map<string, number>,
): number {
  let score = 0;
  for (const id of comp.units) if (owned.has(id)) score += W_UNIT;
  for (const id of comp.core) if (owned.has(id)) score += W_CORE;
  score += W_TIER[comp.tier];
  score += W_WR * comp.winRateHint;
  for (const id of comp.core) {
    if (!owned.has(id)) score -= MISS_CORE_COST * (champCost.get(id) ?? 3);
  }
  for (const id of comp.priority) {
    if (!owned.has(id) && !comp.core.includes(id)) {
      score -= MISS_PRI_COST * (champCost.get(id) ?? 3);
    }
  }
  return score;
}

export function rankCompositions(
  owned: string[],
  bundle: MetaBundle,
  limit = 3,
): MatchResult[] {
  const ownedSet = new Set(owned);
  const champCost = new Map(bundle.champions.map((c) => [c.id, c.cost]));

  return bundle.compositions
    .map((comp) => {
      const ownedIds = comp.units.filter((id) => ownedSet.has(id));
      const missingIds = comp.units.filter((id) => !ownedSet.has(id));
      return {
        composition: comp,
        score: scoreComposition(ownedSet, comp, champCost),
        ownedIds,
        missingIds,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function suggestNext(
  owned: string[],
  match: MatchResult,
  champCost: Map<string, number>,
): SuggestResult {
  const { composition: comp, missingIds } = match;
  const missingSet = new Set(missingIds);

  const ordered = [
    ...comp.priority.filter((id) => missingSet.has(id)),
    ...comp.core.filter((id) => missingSet.has(id) && !comp.priority.includes(id)),
    ...comp.units.filter(
      (id) =>
        missingSet.has(id) &&
        !comp.priority.includes(id) &&
        !comp.core.includes(id),
    ),
  ];

  const pickIds = [...new Set(ordered)]
    .sort((a, b) => (champCost.get(a) ?? 3) - (champCost.get(b) ?? 3))
    .slice(0, 5);

  const sellIds = owned
    .filter((id) => !comp.units.includes(id))
    .slice(0, 5);

  return { pickIds, sellIds };
}

export function traitProgress(owned: string[], bundle: MetaBundle): TraitProgress[] {
  const ownedSet = new Set(owned);
  const counts = new Map<string, number>();

  for (const champ of bundle.champions) {
    if (!ownedSet.has(champ.id)) continue;
    for (const traitName of champ.traits) {
      counts.set(traitName, (counts.get(traitName) ?? 0) + 1);
    }
  }

  return bundle.traits.map((trait) => {
    const count = counts.get(trait.name) ?? 0;
    const next = trait.breakpoints.find((bp) => bp > count) ?? null;
    return {
      traitId: trait.id,
      name: trait.name,
      count,
      nextBreakpoint: next,
    };
  });
}
