import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { rankCompositions, suggestNext, traitProgress } from "@jcc/meta-match";
import { shopIdsFromSlots, slotsFromNative, voteBoardOwnedIds } from "@jcc/screen-match";
import { ChampionGrid } from "../components/ChampionGrid";
import { RecommendPanel } from "../components/RecommendPanel";
import { useMeta } from "../context/MetaContext";
import { getRecognizeEnabled } from "../lib/metaStore";
import { isRecognizeAvailable } from "../../modules/jcc-screen-recognize";
import { startRecognizeSession } from "../lib/recognizeSession";
import { addErrorListener, addFrameListener } from "../../modules/jcc-screen-recognize";

const DISCLAIMER = "学习/复盘工具 · 用户授权截屏 · 非外挂";

export function PickScreen() {
  const { bundle, loading } = useMeta();
  const [ownedIds, setOwnedIds] = useState<string[]>([]);
  const [shopIds, setShopIds] = useState<string[]>([]);
  const [status, setStatus] = useState("手动点选");
  const [followRecognize, setFollowRecognize] = useState(true);
  const [avgConf, setAvgConf] = useState<number | null>(null);
  const { width } = useWindowDimensions();
  const horizontal = width >= 768;
  const pauseUntil = useRef(0);
  const prevBoard = useRef<(string | null)[]>([]);

  const champCost = useMemo(
    () => new Map(bundle.champions.map((c) => [c.id, c.cost])),
    [bundle.champions],
  );
  const templates = useMemo(
    () =>
      bundle.champions
        .filter((c) => c.fingerprint.length)
        .map((c) => ({ id: c.id, name: c.name, fingerprint: c.fingerprint, cost: c.cost })),
    [bundle.champions],
  );

  const matches = useMemo(() => rankCompositions(ownedIds, bundle, 3), [ownedIds, bundle]);
  const top = matches[0] ?? null;
  const suggest = useMemo(
    () => (top ? suggestNext(ownedIds, top, champCost) : null),
    [ownedIds, top, champCost],
  );
  const traits = useMemo(() => traitProgress(ownedIds, bundle), [ownedIds, bundle]);

  const toggle = (id: string) => {
    pauseUntil.current = Date.now() + 8000;
    setFollowRecognize(false);
    setOwnedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  useEffect(() => {
    let stopFrame: () => void = () => undefined;
    let stopErr: () => void = () => undefined;
    let cancelled = false;
    (async () => {
      const enabled = await getRecognizeEnabled();
      if (!enabled || cancelled) return;
      if (!isRecognizeAvailable()) {
        setStatus("无原生录屏，已回退手动点选");
        return;
      }
      if (!templates.length) {
        setStatus("图鉴无头像指纹，请同步官方图鉴后识别；现可手动点选");
      }
      const result = await startRecognizeSession(templates);
      if (cancelled) return;
      setStatus(result.message);
      if (!result.ok) return;
      stopFrame = addFrameListener((event) => {
        const slots = slotsFromNative(event.slots, templates);
        const confs = slots.filter((s) => s.id).map((s) => s.confidence);
        setAvgConf(confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : null);
        setShopIds(shopIdsFromSlots(slots));
        if (Date.now() < pauseUntil.current) return;
        const voted = voteBoardOwnedIds(prevBoard.current, slots);
        prevBoard.current = voted.nextPrev;
        if (voted.ownedIds.length) setOwnedIds(voted.ownedIds);
      });
      stopErr = addErrorListener((message) => {
        setStatus(message || "识别出错，已回退手动");
      });
    })();
    return () => {
      cancelled = true;
      stopFrame();
      stopErr();
    };
  }, [templates]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#38bdf8" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Text style={styles.disclaimer}>{DISCLAIMER}</Text>
      <View style={styles.toolbar}>
        <Text style={styles.status}>
          {status}
          {avgConf != null ? ` · 置信 ${(avgConf * 100).toFixed(0)}%` : ""}
          {shopIds.length ? ` · 商店 ${shopIds.length}` : ""}
        </Text>
        <Pressable style={styles.toolBtn} onPress={() => setOwnedIds([])}>
          <Text style={styles.toolBtnText}>清空</Text>
        </Pressable>
        {!followRecognize ? (
          <Pressable
            style={styles.toolBtn}
            onPress={() => {
              pauseUntil.current = 0;
              setFollowRecognize(true);
            }}
          >
            <Text style={styles.toolBtnText}>跟随识别</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={[styles.body, horizontal ? styles.bodyRow : styles.bodyCol]}>
        <View style={horizontal ? styles.gridPane : styles.fullPane}>
          <ChampionGrid champions={bundle.champions} ownedIds={ownedIds} onToggle={toggle} />
        </View>
        <View style={horizontal ? styles.panelPane : styles.fullPane}>
          <RecommendPanel bundle={bundle} matches={matches} suggest={suggest} traits={traits} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0f172a" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0f172a" },
  disclaimer: {
    color: "#64748b",
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 6,
  },
  status: { color: "#94a3b8", fontSize: 12, flex: 1 },
  toolBtn: {
    backgroundColor: "#334155",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  toolBtnText: { color: "#e2e8f0", fontWeight: "700", fontSize: 12 },
  body: { flex: 1 },
  bodyRow: { flexDirection: "row" },
  bodyCol: { flexDirection: "column" },
  gridPane: { flex: 3 },
  panelPane: { flex: 2, borderLeftWidth: 1, borderLeftColor: "#334155" },
  fullPane: { flex: 1 },
});
