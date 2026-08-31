import { useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { rankCompositions, suggestNext, traitProgress } from "@jcc/meta-match";
import { ChampionGrid } from "../components/ChampionGrid";
import { RecommendPanel } from "../components/RecommendPanel";
import { useMeta } from "../context/MetaContext";

const DISCLAIMER = "学习/复盘工具 · 手动点选 · 非游戏内挂接";

export function PickScreen() {
  const { bundle, loading } = useMeta();
  const [ownedIds, setOwnedIds] = useState<string[]>([]);
  const { width } = useWindowDimensions();
  const horizontal = width >= 768;

  const champCost = useMemo(
    () => new Map(bundle.champions.map((c) => [c.id, c.cost])),
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
    setOwnedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

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
  body: { flex: 1 },
  bodyRow: { flexDirection: "row" },
  bodyCol: { flexDirection: "column" },
  gridPane: { flex: 3 },
  panelPane: { flex: 2, borderLeftWidth: 1, borderLeftColor: "#334155" },
  fullPane: { flex: 1 },
});
