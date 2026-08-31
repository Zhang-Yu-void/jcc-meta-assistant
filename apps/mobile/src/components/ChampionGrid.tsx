import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Champion } from "@jcc/meta-schema";

type Props = {
  champions: Champion[];
  ownedIds: string[];
  onToggle: (id: string) => void;
};

const COST_COLORS: Record<number, string> = {
  1: "#94a3b8",
  2: "#22c55e",
  3: "#3b82f6",
  4: "#a855f7",
  5: "#f59e0b",
};

export function ChampionGrid({ champions, ownedIds, onToggle }: Props) {
  const owned = new Set(ownedIds);
  const byCost = [1, 2, 3, 4, 5].map((cost) => ({
    cost,
    items: champions.filter((c) => c.cost === cost),
  }));

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {byCost.map(({ cost, items }) =>
        items.length === 0 ? null : (
          <View key={cost} style={styles.section}>
            <Text style={[styles.costLabel, { color: COST_COLORS[cost] }]}>{cost} 费</Text>
            <View style={styles.row}>
              {items.map((champ) => {
                const selected = owned.has(champ.id);
                return (
                  <Pressable
                    key={champ.id}
                    onPress={() => onToggle(champ.id)}
                    style={[styles.chip, selected && styles.chipSelected]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{champ.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ),
      )}
      <Text style={styles.count}>已选 {ownedIds.length} 个棋子</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, gap: 12 },
  section: { gap: 8 },
  costLabel: { fontSize: 16, fontWeight: "700" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 44,
    minWidth: 72,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#334155",
    backgroundColor: "#1e293b",
    alignItems: "center",
    justifyContent: "center",
  },
  chipSelected: {
    borderColor: "#38bdf8",
    backgroundColor: "#0c4a6e",
  },
  chipText: { color: "#e2e8f0", fontSize: 15, fontWeight: "600" },
  chipTextSelected: { color: "#fff" },
  count: { color: "#94a3b8", marginTop: 8, fontSize: 14 },
});
