import {
  addErrorListener,
  addFrameListener,
  canDrawOverlays,
  isRecognizeAvailable,
  requestOverlayPermission,
  setOverlayAdvice,
  setRecognizeTemplates,
  startCapture,
  startOverlay,
  stopCapture,
} from "../../modules/jcc-screen-recognize";

type Template = { id: string; name: string; fingerprint: number[]; cost?: number };

let started = false;
let stopFrame: () => void = () => undefined;
let stopErr: () => void = () => undefined;

export function isSessionStarted(): boolean {
  return started;
}

export async function ensureOverlayPermission(): Promise<boolean> {
  if (!isRecognizeAvailable()) return false;
  if (canDrawOverlays()) return true;
  return requestOverlayPermission();
}

export async function startRecognizeSession(templates: Template[]): Promise<{ ok: boolean; message: string }> {
  if (!isRecognizeAvailable()) {
    return { ok: false, message: "无原生录屏模块" };
  }
  if (!canDrawOverlays()) {
    return { ok: false, message: "需要悬浮窗权限，请允许后重试" };
  }
  setRecognizeTemplates(templates);
  if (started) {
    startOverlay();
    return { ok: true, message: "识别中 · 悬浮球已打开" };
  }
  const granted = await startCapture("full");
  if (!granted) {
    return { ok: false, message: "录屏未授权，已回退手动点选" };
  }
  startOverlay();
  started = true;
  return { ok: true, message: "识别中 · 请回金铲铲全屏，点悬浮球看结果" };
}

export async function stopRecognizeSession(): Promise<void> {
  stopFrame();
  stopErr();
  stopFrame = () => undefined;
  stopErr = () => undefined;
  started = false;
  await stopCapture();
}

export function attachRecognizeListeners(opts: {
  onFrame: (event: {
    slots: {
      region: "shop" | "board";
      index: number;
      fingerprint?: number[];
      id?: string;
      confidence?: number;
      costHint?: number | null;
    }[];
  }) => void;
  onError: (message: string) => void;
}): () => void {
  stopFrame();
  stopErr();
  stopFrame = addFrameListener(opts.onFrame);
  stopErr = addErrorListener(opts.onError);
  return () => {
    stopFrame();
    stopErr();
  };
}

export function pushOverlayAdvice(summary: string): void {
  setOverlayAdvice(summary);
}
