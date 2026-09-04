import AsyncStorage from "@react-native-async-storage/async-storage";
import { parseMetaBundle, type MetaBundle } from "@jcc/meta-schema";
import sample from "../../../../data/sample/bundle.json";

const META_KEY = "@jcc/meta";
const URL_KEY = "@jcc/metaUrl";
const SYNC_KEY = "@jcc/lastSync";
const RECOGNIZE_KEY = "@jcc/recognizeEnabled";

export function getSampleMeta(): MetaBundle {
  return parseMetaBundle(sample);
}

export async function loadCachedMeta(): Promise<MetaBundle | null> {
  const raw = await AsyncStorage.getItem(META_KEY);
  if (!raw) return null;
  try {
    return parseMetaBundle(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveMeta(bundle: MetaBundle): Promise<void> {
  await AsyncStorage.setItem(META_KEY, JSON.stringify(bundle));
  await AsyncStorage.setItem(SYNC_KEY, new Date().toISOString());
}

export async function getMetaUrl(): Promise<string | null> {
  return AsyncStorage.getItem(URL_KEY);
}

export async function setMetaUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(URL_KEY, url.trim());
}

export async function getLastSync(): Promise<string | null> {
  return AsyncStorage.getItem(SYNC_KEY);
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

export async function getRecognizeEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(RECOGNIZE_KEY)) === "1";
}

export async function setRecognizeEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(RECOGNIZE_KEY, enabled ? "1" : "0");
}
