import { useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { Composition } from "@jcc/meta-schema";
import { useMeta } from "../context/MetaContext";

function nameOf(ids: string[], champions: { id: string; name: string }[]): string {
  return ids.map((id) => champions.find((c) => c.id === id)?.name ?? id).join("、");
}

export function CompsScreen() {
  const { bundle } = useMeta();
  const [selected, setSelected] = useState<Composition | null>(null);

  return (
    <View style={styles.root}>
      <Text style={styles.disclaimer}>学习/复盘工具 · 手动点选 · 非游戏内挂接</Text>
      <FlatList
        data={bundle.compositions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => setSelected(item)}>
            <Text style={styles.tier}>{item.tier}</Text>
            <View style={styles.rowBody}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.hint}>胜率提示 {(item.winRateHint * 100).toFixed(1)}%</Text>
            </View>
          </Pressable>
        )}
      />

      <Modal visible={selected != null} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {selected && (
              <>
                <Text style={styles.modalTitle}>
                  {selected.name} [{selected.tier}]
                </Text>
                <Text style={styles.modalLine}>核心：{nameOf(selected.core, bundle.champions)}</Text>
                <Text style={styles.modalLine}>阵容：{nameOf(selected.units, bundle.champions)}</Text>
                <Text style={styles.modalLine}>优先：{nameOf(selected.priority, bundle.champions)}</Text>
                <Text style={styles.modalLine}>备注：{selected.notes || "无"}</Text>
                <Text style={styles.modalSub}>来源</Text>
                {selected.sources.map((s, i) => (
                  <Text key={i} style={styles.modalLine}>
                    [{s.platform}] {s.title}
                  </Text>
                ))}
              </>
            )}
            <Pressable style={styles.closeBtn} onPress={() => setSelected(null)}>
              <Text style={styles.closeText}>关闭</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0f172a" },
  disclaimer: { color: "#64748b", fontSize: 12, textAlign: "center", padding: 8 },
  list: { padding: 12, gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#1e293b",
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#334155",
  },
  tier: { color: "#fbbf24", fontWeight: "800", fontSize: 18, width: 28 },
  rowBody: { flex: 1 },
  name: { color: "#f8fafc", fontSize: 16, fontWeight: "700" },
  hint: { color: "#94a3b8", fontSize: 13, marginTop: 2 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 20,
    gap: 8,
  },
  modalTitle: { color: "#f8fafc", fontSize: 20, fontWeight: "800" },
  modalSub: { color: "#cbd5e1", fontWeight: "700", marginTop: 8 },
  modalLine: { color: "#e2e8f0", fontSize: 14, lineHeight: 20 },
  closeBtn: {
    marginTop: 12,
    backgroundColor: "#334155",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  closeText: { color: "#f8fafc", fontWeight: "700" },
});
