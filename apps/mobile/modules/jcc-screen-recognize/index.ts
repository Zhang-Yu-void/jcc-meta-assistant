type NativeSlot = {
  region: "shop" | "board";
  index: number;
  fingerprint?: number[];
  id?: string;
  name?: string;
  confidence?: number;
  costHint?: number | null;
};

type FrameEvent = { slots: NativeSlot[] };

type NativeHandle = {
  startCapture: () => Promise<boolean>;
  stopCapture: () => Promise<void>;
  isAvailable: () => boolean;
  setLayout?: (pane: string) => void;
  canDrawOverlays?: () => boolean;
  requestOverlayPermission?: () => Promise<boolean>;
  startOverlay?: () => void;
  stopOverlay?: () => void;
  setTemplates?: (rows: { id: string; name: string; fingerprint: number[]; cost?: number }[]) => void;
  setAdvice?: (summary: string) => void;
  addListener: (event: string, cb: (payload: unknown) => void) => { remove: () => void };
};

let native: NativeHandle | null = null;
try {
  const mod = require("expo-modules-core") as { requireNativeModule: (name: string) => NativeHandle };
  native = mod.requireNativeModule("JccScreenRecognize");
} catch {
  native = null;
}

export type { NativeSlot };

export function isRecognizeAvailable(): boolean {
  try {
    return native?.isAvailable() === true;
  } catch {
    return false;
  }
}

export function canDrawOverlays(): boolean {
  try {
    return native?.canDrawOverlays?.() === true;
  } catch {
    return false;
  }
}

export async function requestOverlayPermission(): Promise<boolean> {
  if (!native?.requestOverlayPermission) return false;
  try {
    return (await native.requestOverlayPermission()) === true;
  } catch {
    return false;
  }
}

export function setRecognizeTemplates(
  rows: { id: string; name: string; fingerprint: number[]; cost?: number }[],
): void {
  native?.setTemplates?.(rows);
}

export function setOverlayAdvice(summary: string): void {
  native?.setAdvice?.(summary);
}

export function startOverlay(): void {
  native?.startOverlay?.();
}

export function stopOverlay(): void {
  native?.stopOverlay?.();
}

export async function startCapture(pane: "left" | "right" | "full" = "full"): Promise<boolean> {
  if (!native) return false;
  try {
    native.setLayout?.(pane);
  } catch {
    // older native builds ignore layout
  }
  return native.startCapture();
}

export async function stopCapture(): Promise<void> {
  stopOverlay();
  await native?.stopCapture();
}

export function addFrameListener(cb: (event: FrameEvent) => void): () => void {
  if (!native) return () => undefined;
  const sub = native.addListener("onFrame", (payload) => cb(payload as FrameEvent));
  return () => sub.remove();
}

export function addErrorListener(cb: (message: string) => void): () => void {
  if (!native) return () => undefined;
  const sub = native.addListener("onError", (payload) => {
    const msg = (payload as { message?: string })?.message ?? "recognize error";
    cb(msg);
  });
  return () => sub.remove();
}
