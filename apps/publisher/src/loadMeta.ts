import { readFileSync } from "node:fs";
import { parseMetaBundle, type MetaBundle } from "@jcc/meta-schema";

export type MetaState = {
  bundle: MetaBundle;
  etag: string;
  raw: string;
};

let state: MetaState | null = null;
let currentPath: string | null = null;

function computeEtag(version: string): string {
  return `W/"${version}"`;
}

export function loadMeta(dataPath: string): MetaState {
  const raw = readFileSync(dataPath, "utf-8");
  const bundle = parseMetaBundle(JSON.parse(raw));
  const etag = computeEtag(bundle.version);
  state = { bundle, etag, raw };
  currentPath = dataPath;
  return state;
}

export function reloadMeta(): MetaState {
  if (!currentPath) {
    throw new Error("loadMeta not initialized");
  }
  return loadMeta(currentPath);
}

export function getMeta(): MetaState {
  if (!state) {
    throw new Error("loadMeta not initialized");
  }
  return state;
}
