import { useEffect } from "react";
import { useMeta } from "../context/MetaContext";
import { getRecognizeEnabled } from "../lib/metaStore";
import { startRecognizeSession } from "../lib/recognizeSession";

export function RecognizeHost() {
  const { bundle } = useMeta();
  useEffect(() => {
    const templates = bundle.champions
      .filter((c) => c.fingerprint.length)
      .map((c) => ({ id: c.id, name: c.name, fingerprint: c.fingerprint, cost: c.cost }));
    void (async () => {
      if (!(await getRecognizeEnabled()) || !templates.length) return;
      await startRecognizeSession(templates);
    })();
  }, [bundle.champions]);
  return null;
}
