# JCC Meta Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an Android tablet Expo app plus Node publisher that syncs sample meta JSON and locally matches manually selected champions to recommended high-win comps in under 50ms.

**Architecture:** pnpm monorepo with shared Zod schema (`packages/meta-schema`), pure match engine (`packages/meta-match`), Node HTTP publisher serving `/v1/meta`, and Expo Android client that caches meta and recomputes recommendations on every tap. Crawler adapters are stubs only.

**Tech Stack:** pnpm workspaces, TypeScript, Zod, Node `node:http` (or Hono), Vitest, Expo SDK 52+, React Native, AsyncStorage, React Navigation.

**Spec:** `docs/superpowers/specs/2026-08-31-jcc-meta-assistant-design.md`

## Global Constraints

- Platform: Android tablet APK only for v1 (Expo).
- No game overlay, OCR, memory reading, or anti-cheat evasion.
- No real TapTap / 小红书 / NGA scrapers in v1 — stub adapters + write-path docs only.
- Meta calculation must be local and target &lt; 50ms; network only for meta sync.
- `winRateHint` / `pickRateHint` are public-post hints (0–1), not official match APIs.
- UI copy must state: 学习/复盘工具，手动点选，非游戏内挂接.
- Future source priority (docs only): TapTap → 小红书 → NGA.
- Publisher env: `DATA_PATH`, `ADMIN_TOKEN`, `PORT`.

---

## File map (create)

```
jcc-meta-assistant/
  package.json                          # pnpm workspace root
  pnpm-workspace.yaml
  tsconfig.base.json
  .gitignore
  README.md                             # usage + deploy + boundaries
  data/sample/bundle.json               # sample meta
  data/live/.gitkeep
  packages/meta-schema/
    package.json
    src/index.ts                        # Zod schemas + types + parseMetaBundle
    src/index.test.ts
  packages/meta-match/
    package.json
    src/index.ts                        # scoreComps, suggestNext, traitProgress
    src/index.test.ts
  apps/publisher/
    package.json
    src/server.ts                       # HTTP server
    src/loadMeta.ts
    src/server.test.ts
    adapters/taptap.ts                  # stub
    adapters/xhs.ts                     # stub
    adapters/nga.ts                     # stub
    adapters/README.md
  apps/mobile/
    package.json                        # Expo app
    App.tsx
    app.json
    src/lib/metaStore.ts
    src/lib/sampleFallback.ts
    src/screens/PickScreen.tsx
    src/screens/CompsScreen.tsx
    src/screens/SettingsScreen.tsx
    src/components/ChampionGrid.tsx
    src/components/RecommendPanel.tsx
```

---

### Task 1: Monorepo scaffold + meta-schema

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`
- Create: `packages/meta-schema/package.json`, `packages/meta-schema/tsconfig.json`, `packages/meta-schema/src/index.ts`, `packages/meta-schema/src/index.test.ts`
- Create: `data/sample/bundle.json`, `data/live/.gitkeep`

**Interfaces:**
- Consumes: none
- Produces: `MetaBundle`, `Champion`, `Trait`, `Composition`, `parseMetaBundle(unknown): MetaBundle`, Zod schemas exported from `@jcc/meta-schema`

- [ ] **Step 1: Write root workspace files**

`pnpm-workspace.yaml`:
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Root `package.json`:
```json
{
  "name": "jcc-meta-assistant",
  "private": true,
  "scripts": {
    "test": "pnpm -r run test",
    "typecheck": "pnpm -r run typecheck"
  },
  "engines": { "node": ">=20" },
  "packageManager": "pnpm@9.15.0"
}
```

`.gitignore`: `node_modules/`, `dist/`, `.expo/`, `android/`, `ios/`, `*.log`, `.env`, `coverage/`

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

- [ ] **Step 2: Write failing schema test**

`packages/meta-schema/package.json`:
```json
{
  "name": "@jcc/meta-schema",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": { "zod": "^3.24.1" },
  "devDependencies": {
    "typescript": "^5.7.3",
    "vitest": "^3.0.5"
  }
}
```

`packages/meta-schema/src/index.test.ts`:
```ts
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
```

- [ ] **Step 3: Run test — expect fail**

Run: `cd /Users/mac/github/jcc-meta-assistant && pnpm install && pnpm --filter @jcc/meta-schema test`  
Expected: FAIL (module not found or `parseMetaBundle` undefined)

- [ ] **Step 4: Implement schema**

`packages/meta-schema/src/index.ts`:
```ts
import { z } from "zod";

export const SourceSchema = z.object({
  platform: z.string().min(1),
  title: z.string(),
  url: z.string(),
});

export const ChampionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  cost: z.number().int().min(1).max(5),
  traits: z.array(z.string()),
});

export const TraitSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  breakpoints: z.array(z.number().int().positive()),
});

export const CompositionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tier: z.enum(["S", "A", "B"]),
  winRateHint: z.number().min(0).max(1),
  pickRateHint: z.number().min(0).max(1),
  sources: z.array(SourceSchema),
  core: z.array(z.string()),
  units: z.array(z.string()).min(1),
  priority: z.array(z.string()),
  notes: z.string(),
});

export const MetaBundleSchema = z.object({
  version: z.string().min(1),
  updatedAt: z.string().min(1),
  setId: z.string().min(1),
  setName: z.string().min(1),
  champions: z.array(ChampionSchema),
  traits: z.array(TraitSchema),
  compositions: z.array(CompositionSchema),
});

export type MetaBundle = z.infer<typeof MetaBundleSchema>;
export type Champion = z.infer<typeof ChampionSchema>;
export type Trait = z.infer<typeof TraitSchema>;
export type Composition = z.infer<typeof CompositionSchema>;

export function parseMetaBundle(input: unknown): MetaBundle {
  return MetaBundleSchema.parse(input);
}
```

Also add `packages/meta-schema/tsconfig.json` extending base with `"include": ["src"]`.

- [ ] **Step 5: Write sample `data/sample/bundle.json`**

Include ≥8 champions (costs 1–5), ≥3 traits, ≥3 compositions with overlapping units so matching is demonstrable. Use Chinese display names. Example core idea: 法师主C / 枪手速攻 / 坦克前排 — ids like `ahri`, `jinx`, `garen` (sample set, not claiming live season accuracy).

- [ ] **Step 6: Re-run tests — expect pass**

Run: `pnpm --filter @jcc/meta-schema test`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore \
  packages/meta-schema data/sample/bundle.json data/live/.gitkeep pnpm-lock.yaml
git commit -m "feat: scaffold monorepo and meta-schema package"
```

---

### Task 2: meta-match engine

**Files:**
- Create: `packages/meta-match/package.json`, `packages/meta-match/tsconfig.json`, `packages/meta-match/src/index.ts`, `packages/meta-match/src/index.test.ts`

**Interfaces:**
- Consumes: `MetaBundle`, `Composition` from `@jcc/meta-schema`
- Produces:
  - `scoreComposition(owned: Set<string>, comp: Composition, champCost: Map<string, number>): number`
  - `rankCompositions(owned: string[], bundle: MetaBundle, limit?: number): MatchResult[]`
  - `suggestNext(owned: string[], match: MatchResult, champCost: Map<string, number>): SuggestResult`
  - `traitProgress(owned: string[], bundle: MetaBundle): TraitProgress[]`
  - Types: `MatchResult { composition, score, ownedIds, missingIds }`, `SuggestResult { pickIds, sellIds }`, `TraitProgress { traitId, name, count, nextBreakpoint }`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { parseMetaBundle } from "@jcc/meta-schema";
import { rankCompositions, suggestNext, traitProgress } from "./index.js";
import sample from "../../../data/sample/bundle.json";

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
```

- [ ] **Step 2: Run tests — expect fail**

Run: `pnpm --filter @jcc/meta-match test`  
Expected: FAIL (package / exports missing)

- [ ] **Step 3: Implement scoring**

Scoring rules (exact weights — keep constants named at top of file):

```ts
const W_UNIT = 10;
const W_CORE = 25;
const W_TIER: Record<"S" | "A" | "B", number> = { S: 8, A: 4, B: 0 };
const W_WR = 20; // * winRateHint
const MISS_CORE_COST = 6; // * champion cost
const MISS_PRI_COST = 3;
```

```ts
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
```

`rankCompositions`: build `Set` + cost map, map comps → `MatchResult`, sort desc by score, slice `limit` (default 3).

`suggestNext`: `pickIds` = missing from `priority` then `core` then `units`, sorted by cost asc, max 5. `sellIds` = owned not in `comp.units`, max 5.

`traitProgress`: map trait name → count from owned champions’ `traits` arrays; match `bundle.traits` by `name`; `nextBreakpoint` = smallest breakpoint &gt; count, or null if maxed.

- [ ] **Step 4: Run tests — expect pass**

Run: `pnpm --filter @jcc/meta-match test`  
Expected: PASS

- [ ] **Step 5: Optional micro-bench in test**

```ts
it("ranks under 50ms for sample bundle", () => {
  const owned = bundle.champions.slice(0, 6).map((c) => c.id);
  const t0 = performance.now();
  for (let i = 0; i < 100; i++) rankCompositions(owned, bundle, 3);
  const avg = (performance.now() - t0) / 100;
  expect(avg).toBeLessThan(50);
});
```

- [ ] **Step 6: Commit**

```bash
git add packages/meta-match
git commit -m "feat: add local composition match engine"
```

---

### Task 3: Publisher HTTP service

**Files:**
- Create: `apps/publisher/package.json`, `apps/publisher/tsconfig.json`, `apps/publisher/src/loadMeta.ts`, `apps/publisher/src/server.ts`, `apps/publisher/src/server.test.ts`, `apps/publisher/adapters/{taptap,xhs,nga}.ts`, `apps/publisher/adapters/README.md`

**Interfaces:**
- Consumes: `parseMetaBundle` from `@jcc/meta-schema`
- Produces: `createServer({ dataPath, adminToken, port })` → `{ server, reload(): void }`; routes `GET /health`, `GET /v1/meta`, `POST /v1/admin/reload`

- [ ] **Step 1: Write failing HTTP tests** (use Node `fetch` against ephemeral port)

```ts
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublisher } from "./server.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dataPath = path.join(root, "data/sample/bundle.json");

describe("publisher", () => {
  let base: string;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const p = await createPublisher({ dataPath, adminToken: "secret", port: 0 });
    base = `http://127.0.0.1:${p.port}`;
    close = p.close;
  });
  afterAll(async () => { await close(); });

  it("GET /health", async () => {
    const r = await fetch(`${base}/health`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });

  it("GET /v1/meta returns version and ETag", async () => {
    const r = await fetch(`${base}/v1/meta`);
    expect(r.status).toBe(200);
    expect(r.headers.get("etag")).toBeTruthy();
    const body = await r.json();
    expect(body.version).toBeTruthy();
    expect(Array.isArray(body.compositions)).toBe(true);
  });

  it("supports If-None-Match 304", async () => {
    const r1 = await fetch(`${base}/v1/meta`);
    const etag = r1.headers.get("etag")!;
    const r2 = await fetch(`${base}/v1/meta`, { headers: { "If-None-Match": etag } });
    expect(r2.status).toBe(304);
  });

  it("reload requires bearer token", async () => {
    const bad = await fetch(`${base}/v1/admin/reload`, { method: "POST" });
    expect(bad.status).toBe(401);
    const ok = await fetch(`${base}/v1/admin/reload`, {
      method: "POST",
      headers: { Authorization: "Bearer secret" },
    });
    expect(ok.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `pnpm --filter @jcc/publisher test`  
Expected: FAIL

- [ ] **Step 3: Implement `loadMeta.ts` + `server.ts`**

`loadMeta.ts`: read file sync/async, `parseMetaBundle`, compute weak ETag as `"W/\"{version}\""`, hold in module state `{ bundle, etag, raw }`.

`server.ts`: use `node:http`. On `GET /v1/meta`, if `If-None-Match` matches etag → 304; else 200 JSON + `ETag` + `Cache-Control: public, max-age=60`. `POST /v1/admin/reload`: check `Authorization === Bearer ${adminToken}` else 401; reload from disk. Listen on `port` (`0` = ephemeral); return actual port.

CLI entry: if `import.meta.url === process.argv[1]` pattern or `src/cli.ts` reading `process.env.PORT || 8787`, `DATA_PATH`, `ADMIN_TOKEN`.

- [ ] **Step 4: Stub adapters**

Each adapter file:
```ts
/** Future crawler adapter — not implemented in v1. Output must be MetaBundle JSON. */
export async function fetchRaw(): Promise<never> {
  throw new Error("Adapter not implemented: taptap");
}
```
Vary error message per platform. `adapters/README.md`: document priority TapTap → 小红书 → NGA, output path `data/live/bundle.json`, then `POST /v1/admin/reload`; compliance warning.

- [ ] **Step 5: Tests pass + manual smoke**

Run: `pnpm --filter @jcc/publisher test`  
Run: `DATA_PATH=../../data/sample/bundle.json ADMIN_TOKEN=dev pnpm --filter @jcc/publisher start` then `curl -s localhost:8787/v1/meta | head`  
Expected: JSON with `version`

- [ ] **Step 6: Commit**

```bash
git add apps/publisher
git commit -m "feat: add meta publisher HTTP service"
```

---

### Task 4: Expo mobile app — data layer + navigation shell

**Files:**
- Create Expo app under `apps/mobile` via `pnpm create expo-app`
- Create: `apps/mobile/src/lib/metaStore.ts`, `apps/mobile/src/lib/sampleFallback.ts`, `apps/mobile/App.tsx` (tabs: 点选 / 阵容库 / 设置)

**Interfaces:**
- Consumes: `parseMetaBundle`, `MetaBundle`; `rankCompositions` etc. from `@jcc/meta-match`
- Produces: `loadCachedMeta(): Promise<MetaBundle | null>`, `saveMeta(bundle)`, `fetchMeta(url): Promise<MetaBundle>`, `getMetaUrl()/setMetaUrl(url)` via AsyncStorage keys `@jcc/meta`, `@jcc/metaUrl`

- [ ] **Step 1: Scaffold Expo app (Android)**

```bash
cd /Users/mac/github/jcc-meta-assistant
pnpm create expo-app apps/mobile --template blank-typescript
```

Add dependencies: `@react-native-async-storage/async-storage`, `@react-navigation/native`, `@react-navigation/bottom-tabs`, `react-native-screens`, `react-native-safe-area-context`, workspace deps `@jcc/meta-schema`, `@jcc/meta-match`.

Configure `metro.config.js` to watch monorepo packages (Expo monorepo docs: `watchFolders` + `nodeModulesPaths`).

- [ ] **Step 2: Implement metaStore**

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { parseMetaBundle, type MetaBundle } from "@jcc/meta-schema";
import sample from "../../../data/sample/bundle.json";

const META_KEY = "@jcc/meta";
const URL_KEY = "@jcc/metaUrl";

export function getSampleMeta(): MetaBundle {
  return parseMetaBundle(sample);
}

export async function loadCachedMeta(): Promise<MetaBundle | null> {
  const raw = await AsyncStorage.getItem(META_KEY);
  if (!raw) return null;
  try { return parseMetaBundle(JSON.parse(raw)); } catch { return null; }
}

export async function saveMeta(bundle: MetaBundle): Promise<void> {
  await AsyncStorage.setItem(META_KEY, JSON.stringify(bundle));
}

export async function fetchMeta(url: string): Promise<MetaBundle> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseMetaBundle(await res.json());
}

export async function resolveMeta(): Promise<{ bundle: MetaBundle; source: "cache" | "sample" }> {
  const cached = await loadCachedMeta();
  if (cached) return { bundle: cached, source: "cache" };
  return { bundle: getSampleMeta(), source: "sample" };
}
```

- [ ] **Step 3: App shell with 3 tabs**

Placeholder screens showing title + disclaimer text: `学习/复盘工具 · 手动点选 · 非游戏内挂接`.

- [ ] **Step 4: Manual verify**

Run: `pnpm --filter mobile start` (or `npx expo start --android`)  
Expected: app opens with 3 tabs and disclaimer visible.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile
git commit -m "feat: scaffold Expo app with meta cache layer"
```

---

### Task 5: Pick screen + live recommendations

**Files:**
- Create: `apps/mobile/src/components/ChampionGrid.tsx`, `apps/mobile/src/components/RecommendPanel.tsx`, `apps/mobile/src/screens/PickScreen.tsx`
- Modify: `App.tsx` to wire Pick tab

**Interfaces:**
- Consumes: `rankCompositions`, `suggestNext`, `traitProgress` from `@jcc/meta-match`; meta from store
- Produces: Pick UI state `ownedIds: string[]`; on each toggle, recompute Top3 + suggestions + traits

- [ ] **Step 1: ChampionGrid**

Props: `champions`, `ownedIds`, `onToggle(id)`. Group by `cost` 1–5. Selected chips visually distinct (border/background). Large touch targets (≥44pt) for tablet.

- [ ] **Step 2: RecommendPanel**

Props: `matches: MatchResult[]`, `suggest: SuggestResult | null`, `traits: TraitProgress[]`. Show for each match: name, tier, score (1 decimal), owned/missing names. Show `下一步优先` pick list and `可考虑卖掉` sell list. Empty owned → still show Top3 by tier/WR baseline.

- [ ] **Step 3: PickScreen**

On mount `resolveMeta()`. `useMemo` for rankings when `ownedIds` or `bundle` changes. Layout: tablet-friendly — grid left ~60%, panel right ~40%; on narrow width stack vertically.

- [ ] **Step 4: Manual verify**

Select 3–4 units that belong to sample comp 1 → Top1 should be that comp; missing list shrinks; picks update. Toggle off → scores change instantly (no spinner).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src
git commit -m "feat: add champion pick UI and live recommendations"
```

---

### Task 6: Comps library + Settings sync

**Files:**
- Create: `apps/mobile/src/screens/CompsScreen.tsx`, `apps/mobile/src/screens/SettingsScreen.tsx`
- Modify: navigation wiring

**Interfaces:**
- Settings: edit Meta URL (default empty or `http://<lan-ip>:8787/v1/meta`), button `立即更新`, show `version` / `updatedAt` / last sync / errors; on success `saveMeta` + update in-memory context
- Comps: FlatList of compositions; detail modal with core, units, sources, notes

- [ ] **Step 1: React context `MetaContext`**

Provide `{ bundle, setBundle, refreshFromUrl() }` so Pick/Comps/Settings share one bundle.

- [ ] **Step 2: CompsScreen**

List `tier` badge + name + winRateHint%. Detail shows sources platform labels.

- [ ] **Step 3: SettingsScreen**

- URL TextInput  
- `立即更新` → `fetchMeta` → validate → save → setBundle  
- On failure: Alert with message, keep previous cache  
- Startup background sync: if URL set, try fetch; ignore errors if cache exists  
- Disclaimer paragraph again  

- [ ] **Step 4: End-to-end manual test**

1. Start publisher with sample data on LAN.  
2. On tablet/emulator Settings → set `http://<host>:8787/v1/meta` → 立即更新 → version shows.  
3. Pick screen uses updated data.  
4. Airplane mode → app still opens from cache/sample.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile
git commit -m "feat: comps browser and meta URL sync settings"
```

---

### Task 7: README + Android build notes

**Files:**
- Create: `README.md`
- Modify: `apps/mobile/app.json` (name `金铲铲Meta助手`, android package `com.jcc.metaassistant`)

- [ ] **Step 1: Write README**

Sections:

1. 产品边界（学习/复盘；非外挂；手动点选）  
2. 仓库结构  
3. 本地开发：`pnpm install`、`pnpm --filter @jcc/publisher start`、`pnpm --filter mobile start`  
4. 数据格式指针 → design spec  
5. 阿里云部署：`DATA_PATH`、`ADMIN_TOKEN`、Nginx HTTPS、`pm2`  
6. 后续爬虫：adapters README + 源优先级  
7. 打 APK：`npx expo prebuild --platform android` / EAS Build 简述  

- [ ] **Step 2: Verify `pnpm test` at root passes**

Expected: meta-schema, meta-match, publisher all PASS

- [ ] **Step 3: Commit**

```bash
git add README.md apps/mobile/app.json
git commit -m "docs: add usage, deploy, and build instructions"
```

---

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| Expo Android client | 4–6 |
| Manual pick + local match &lt; 50ms | 2, 5 |
| Sample replaceable data | 1 |
| Publisher `/health` `/v1/meta` ETag reload | 3 |
| Settings URL + cache | 4, 6 |
| Comps browser | 6 |
| Adapter stubs TapTap/XHS/NGA | 3 |
| Disclaimer copy | 4–6, 7 |
| No crawlers / no overlay | enforced by scope |
| README / deploy | 7 |
| Shared schema | 1 |

## Type consistency notes

- Bundle type name: `MetaBundle` everywhere.
- Match output: `MatchResult` with `composition`, `score`, `ownedIds`, `missingIds`.
- Storage keys: `@jcc/meta`, `@jcc/metaUrl`.
- Publisher package name: `@jcc/publisher`; mobile package name: `mobile`.
