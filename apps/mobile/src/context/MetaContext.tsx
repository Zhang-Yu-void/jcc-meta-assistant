import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { MetaBundle } from "@jcc/meta-schema";
import {
  fetchMeta,
  getLastSync,
  getMetaUrl,
  getSampleMeta,
  loadCachedMeta,
  resolveMeta,
  saveMeta,
} from "../lib/metaStore";

type MetaContextValue = {
  bundle: MetaBundle;
  source: "cache" | "sample" | "remote";
  lastSync: string | null;
  loading: boolean;
  setBundle: (bundle: MetaBundle, source?: "cache" | "sample" | "remote") => void;
  refreshFromUrl: (url?: string) => Promise<void>;
};

const MetaContext = createContext<MetaContextValue | null>(null);

export function MetaProvider({ children }: { children: React.ReactNode }) {
  const [bundle, setBundleState] = useState<MetaBundle>(getSampleMeta());
  const [source, setSource] = useState<"cache" | "sample" | "remote">("sample");
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const setBundle = useCallback((next: MetaBundle, nextSource: "cache" | "sample" | "remote" = "cache") => {
    setBundleState(next);
    setSource(nextSource);
  }, []);

  const refreshFromUrl = useCallback(async (urlOverride?: string) => {
    const url = urlOverride ?? (await getMetaUrl());
    if (!url) throw new Error("未配置 Meta URL");
    const remote = await fetchMeta(url);
    await saveMeta(remote);
    setBundle(remote, "remote");
    setLastSync(new Date().toISOString());
  }, [setBundle]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resolved = await resolveMeta();
        const sync = await getLastSync();
        if (!cancelled) {
          setBundleState(resolved.bundle);
          setSource(resolved.source);
          setLastSync(sync);
        }
        const url = await getMetaUrl();
        if (url && !cancelled) {
          try {
            await refreshFromUrl(url);
          } catch {
            const cached = await loadCachedMeta();
            if (cached && !cancelled) {
              setBundleState(cached);
              setSource("cache");
            }
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshFromUrl]);

  const value = useMemo(
    () => ({ bundle, source, lastSync, loading, setBundle, refreshFromUrl }),
    [bundle, source, lastSync, loading, setBundle, refreshFromUrl],
  );

  return <MetaContext.Provider value={value}>{children}</MetaContext.Provider>;
}

export function useMeta(): MetaContextValue {
  const ctx = useContext(MetaContext);
  if (!ctx) throw new Error("useMeta must be used within MetaProvider");
  return ctx;
}
