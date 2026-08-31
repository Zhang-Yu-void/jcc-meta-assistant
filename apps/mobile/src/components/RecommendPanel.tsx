import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { MetaBundle } from "@jcc/meta-schema";
import type { MatchResult, SuggestResult, TraitProgress } from "@jcc/meta-match";

type Props = {
  bundle: MetaBundle;
  matches: MatchResult[];
  suggest: SuggestResult | null;
  traits: TraitProgress[];
};

function nameOf(bundle: MetaBundle, id: string): string {
  return bundle.champions.find((c) => c.id === id)?.name ?? id;
}

export function RecommendPanel({ bundle, matches, suggest, traits }: Props) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>阵容推荐</Text>
      {matches.map((m, i) => (
        <View key={m.composition.id} style={styles.card}>
          <Text style={styles.cardTitle}>
            #{i + 1} {m.composition.name}{" "}
            <Text style={styles.tier}>[{m.composition.tier}]</Text>
          </Text>
          <Text style={styles.meta}>
            匹配 {m.score.toFixed(1)} · 胜率提示 {(m.composition.winRateHint * 100).toFixed(1)}%
          </Text>
          <Text style={styles.line}>已有：{m.ownedIds.map((id) => nameOf(bundle, id)).join("、") || "无"}</Text>
          <Text style={styles.line}>缺失：{m.missingIds.map((id) => nameOf(bundle, id)).join("、") || "无"}</Text>
        </View>
      ))}

      {suggest && (
        <>
          <Text style={styles.subTitle}>下一步优先</Text>
          <Text style={styles.line}>
            {suggest.pickIds.map((id) => nameOf(bundle, id)).join("、") || "暂无"}
          </Text>
          <Text style={styles.subTitle}>可考虑卖掉</Text>
          <Text style={styles.line}>
            {suggest.sellIds.map((id) => nameOf(bundle, id)).join("、") || "暂无"}
          </Text>
        </>
      )}

      <Text style={styles.subTitle}>羁绊进度</Text>
      {traits
        .filter((t) => t.count > 0)
        .map((t) => (
          <Text key={t.traitId} style={styles.line}>
            {t.name} {t.count}
            {t.nextBreakpoint ? ` → 下一档 ${t.nextBreakpoint}` : "（已满）"}
          </Text>
        ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, gap: 10 },
  title: { fontSize: 20, fontWeight: "800", color: "#f8fafc" },
  subTitle: { fontSize: 16, fontWeight: "700", color: "#cbd5e1", marginTop: 4 },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: "#334155",
  },
  cardTitle: { color: "#f1f5f9", fontSize: 16, fontWeight: "700" },
  tier: { color: "#fbbf24" },
  meta: { color: "#94a3b8", fontSize: 13 },
  line: { color: "#e2e8f0", fontSize: 14, lineHeight: 20 },
});
