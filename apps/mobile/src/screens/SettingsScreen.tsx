import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { getMetaUrl, getRecognizeEnabled, setMetaUrl, setRecognizeEnabled } from "../lib/metaStore";
import { useMeta } from "../context/MetaContext";
import { ensureOverlayPermission, startRecognizeSession, stopRecognizeSession } from "../lib/recognizeSession";

export function SettingsScreen() {
  const { bundle, source, lastSync, refreshFromUrl } = useMeta();
  const [url, setUrl] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [recognize, setRecognize] = useState(false);

  useEffect(() => {
    getMetaUrl().then((saved) => {
      if (saved) setUrl(saved);
    });
    getRecognizeEnabled().then(setRecognize);
  }, []);

  const onSync = async () => {
    if (!url.trim()) {
      Alert.alert("提示", "请先填写 Meta URL");
      return;
    }
    setSyncing(true);
    try {
      await setMetaUrl(url.trim());
      await refreshFromUrl(url.trim());
      Alert.alert("更新成功", "阵容数据已同步");
    } catch (e) {
      Alert.alert("更新失败", e instanceof Error ? e.message : "未知错误");
    } finally {
      setSyncing(false);
    }
  };

  const onToggleRecognize = async (value: boolean) => {
    if (value) {
      const overlay = await ensureOverlayPermission();
      if (!overlay) {
        Alert.alert("需要悬浮窗权限", "请允许显示在其他应用上层后再开启识别");
        return;
      }
      await setRecognizeEnabled(true);
      setRecognize(true);
      const templates = bundle.champions
        .filter((c) => c.fingerprint.length)
        .map((c) => ({ id: c.id, name: c.name, fingerprint: c.fingerprint, cost: c.cost }));
      const result = await startRecognizeSession(templates);
      if (!result.ok) {
        await setRecognizeEnabled(false);
        setRecognize(false);
        Alert.alert("识别未开启", result.message);
        return;
      }
      Alert.alert("识别已开启", result.message);
      return;
    }
    await setRecognizeEnabled(false);
    setRecognize(false);
    await stopRecognizeSession();
  };

  return (
    <View style={styles.root}>
      <Text style={styles.disclaimer}>学习/复盘工具 · 用户授权截屏 · 非外挂</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Meta URL</Text>
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          placeholder="http://192.168.x.x:8787/v1/meta"
          placeholderTextColor="#64748b"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable style={styles.btn} onPress={onSync} disabled={syncing}>
          {syncing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>立即更新</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>对局识别</Text>
        <View style={styles.row}>
          <Text style={styles.line}>授权录屏 + 悬浮球</Text>
          <Switch value={recognize} onValueChange={(v) => void onToggleRecognize(v)} />
        </View>
        <Text style={styles.note}>
          金铲铲全屏对局，点右上角悬浮球看识别结果。抓帧前会短暂隐藏浮层。识别失败可继续手动点选。
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>当前数据</Text>
        <Text style={styles.line}>赛季：{bundle.setName}</Text>
        <Text style={styles.line}>版本：{bundle.version}</Text>
        <Text style={styles.line}>更新时间：{bundle.updatedAt}</Text>
        <Text style={styles.line}>来源：{source === "remote" ? "远程" : source === "cache" ? "本地缓存" : "内置示例"}</Text>
        <Text style={styles.line}>上次同步：{lastSync ?? "未同步"}</Text>
      </View>

      <Text style={styles.note}>
        配置阿里云发布服务地址后，客户端会自动拉取最新阵容数据。无网络时使用本地缓存或内置示例数据。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0f172a", padding: 16, gap: 12 },
  disclaimer: { color: "#64748b", fontSize: 12, textAlign: "center" },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: "#334155",
  },
  label: { color: "#cbd5e1", fontWeight: "700", fontSize: 15 },
  input: {
    borderWidth: 1,
    borderColor: "#475569",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#f8fafc",
    fontSize: 14,
  },
  btn: {
    backgroundColor: "#0284c7",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  line: { color: "#e2e8f0", fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  note: { color: "#64748b", fontSize: 13, lineHeight: 20 },
});
