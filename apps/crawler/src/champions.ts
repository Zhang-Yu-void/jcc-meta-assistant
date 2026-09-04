import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseMetaBundle, type Champion, type MetaBundle } from "@jcc/meta-schema";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export function loadRegistry(customPath?: string): MetaBundle {
  const registryPath =
    customPath ?? path.join(root, "data/champions-registry.json");
  const raw = readFileSync(registryPath, "utf-8");
  return parseMetaBundle(JSON.parse(raw));
}

export function championByName(registry: MetaBundle, name: string): Champion | undefined {
  return registry.champions.find((c) => c.name === name);
}

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fff-]/gi, "")
    .slice(0, 32) || "unknown";
}

export function ensureChampion(registry: MetaBundle, name: string): Champion {
  const existing = championByName(registry, name);
  if (existing) return existing;
  const id = slugify(name);
  const champ: Champion = { id, name, cost: 3, traits: [], apiName: "", portrait: "", fingerprint: [] };
  registry.champions.push(champ);
  return champ;
}

export function namesToIds(registry: MetaBundle, names: string[]): string[] {
  return names.map((n) => ensureChampion(registry, n).id);
}
