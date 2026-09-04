export type RgbImage = {
  width: number;
  height: number;
  data: Uint8Array;
};

export type Layout = {
  shop: { top: number; bottom: number; left: number; right: number; slots: number };
  board: { top: number; bottom: number; left: number; right: number; rows: number; cols: number };
};

export type RecognizeSlot = {
  region: "shop" | "board";
  index: number;
  id: string | null;
  confidence: number;
};

export type SlotFingerprint = {
  region: "shop" | "board";
  index: number;
  fingerprint: number[];
  costHint?: number | null;
};

export type ChampionTemplate = {
  id: string;
  fingerprint: number[];
  cost?: number;
  name?: string;
};

export const FP_SIZE = 24;
export const FP_LEN = FP_SIZE * FP_SIZE * 3;
export const HSV_BINS = 16;
export const MATCH_THRESHOLD = 0.72;
export const MATCH_MARGIN = 0.08;
export const EMPTY_VARIANCE = 140;
export const NCC_WEIGHT = 0.75;
export const HSV_WEIGHT = 0.25;
export const SHOP_FACE_PAD = { top: 0.22, bottom: 0.28, side: 0.16 };
export const BOARD_PAD = 0.28;

export const DEFAULT_LAYOUT: Layout = {
  shop: { top: 0.8, bottom: 0.97, left: 0.14, right: 0.86, slots: 5 },
  board: { top: 0.24, bottom: 0.74, left: 0.1, right: 0.9, rows: 4, cols: 7 },
};

function rgbAt(img: RgbImage, x: number, y: number): [number, number, number] {
  const xi = Math.min(img.width - 1, Math.max(0, Math.floor(x)));
  const yi = Math.min(img.height - 1, Math.max(0, Math.floor(y)));
  const i = (yi * img.width + xi) * 3;
  return [img.data[i] ?? 0, img.data[i + 1] ?? 0, img.data[i + 2] ?? 0];
}

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return [h, s, max];
}

export function costFromRgb(r: number, g: number, b: number): number | null {
  const [h, s] = rgbToHsv(r, g, b);
  if (s < 0.18) return 1;
  if (h >= 25 && h <= 55) return 5;
  if (h >= 260 && h <= 310) return 4;
  if (h >= 195 && h <= 250) return 3;
  if (h >= 80 && h <= 160) return 2;
  return null;
}

export function buildFingerprint(img: RgbImage): number[] {
  const fp: number[] = [];
  for (let y = 0; y < FP_SIZE; y++) {
    for (let x = 0; x < FP_SIZE; x++) {
      const px = ((x + 0.5) / FP_SIZE) * img.width;
      const py = ((y + 0.5) / FP_SIZE) * img.height;
      fp.push(...rgbAt(img, px, py));
    }
  }
  return fp;
}

export function fingerprintVariance(fp: number[]): number {
  if (!fp.length) return 0;
  const mean = fp.reduce((s, x) => s + x, 0) / fp.length;
  let acc = 0;
  for (const x of fp) acc += (x - mean) ** 2;
  return acc / fp.length;
}

export function hsvHistogram(fp: number[]): number[] {
  const bins = new Array<number>(HSV_BINS).fill(0);
  let weight = 0;
  for (let i = 0; i + 2 < fp.length; i += 3) {
    const [h, s] = rgbToHsv(fp[i] ?? 0, fp[i + 1] ?? 0, fp[i + 2] ?? 0);
    if (s < 0.08) continue;
    const idx = Math.min(HSV_BINS - 1, Math.floor((h / 360) * HSV_BINS));
    bins[idx] += s;
    weight += s;
  }
  if (weight <= 0) return bins;
  return bins.map((x) => x / weight);
}

function histogramIntersection(a: number[], b: number[]): number {
  let acc = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) acc += Math.min(a[i] ?? 0, b[i] ?? 0);
  return acc;
}

export function matchNcc(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  const meanA = a.reduce((s, x) => s + x, 0) / a.length;
  const meanB = b.reduce((s, x) => s + x, 0) / b.length;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    dot += da * db;
    na += da * da;
    nb += db * db;
  }
  const eps = 1e-6;
  if (na < eps && nb < eps) {
    const meanDiff = Math.abs(meanA - meanB) / 255;
    return meanDiff < 0.08 ? 1 : 0;
  }
  if (na < eps || nb < eps) return 0;
  return Math.max(0, dot / Math.sqrt(na * nb));
}

export function matchFingerprint(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  const ncc = matchNcc(a, b);
  const hsv = histogramIntersection(hsvHistogram(a), hsvHistogram(b));
  return NCC_WEIGHT * ncc + HSV_WEIGHT * hsv;
}

export function matchSlots(
  slots: SlotFingerprint[],
  templates: ChampionTemplate[],
  threshold = MATCH_THRESHOLD,
): RecognizeSlot[] {
  const usable = templates.filter((t) => t.fingerprint.length === FP_LEN);
  return slots.map((slot) => {
    if (fingerprintVariance(slot.fingerprint) < EMPTY_VARIANCE) {
      return { region: slot.region, index: slot.index, id: null, confidence: 0 };
    }
    const hinted = slot.costHint && slot.costHint >= 1 && slot.costHint <= 5 ? slot.costHint : null;
    const candidates =
      hinted == null ? usable : usable.filter((t) => t.cost == null || t.cost === hinted);
    const pool = candidates.length ? candidates : usable;
    let bestId: string | null = null;
    let best = -1;
    let second = -1;
    for (const t of pool) {
      const score = matchFingerprint(slot.fingerprint, t.fingerprint);
      if (score > best) {
        second = best;
        best = score;
        bestId = t.id;
      } else if (score > second) {
        second = score;
      }
    }
    const ok = best >= threshold && best - Math.max(0, second) >= MATCH_MARGIN;
    return {
      region: slot.region,
      index: slot.index,
      id: ok ? bestId : null,
      confidence: Math.max(0, best),
    };
  });
}

function cropRect(img: RgbImage, left: number, top: number, right: number, bottom: number): RgbImage {
  const x0 = Math.max(0, Math.floor(left));
  const y0 = Math.max(0, Math.floor(top));
  const x1 = Math.min(img.width, Math.ceil(right));
  const y1 = Math.min(img.height, Math.ceil(bottom));
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const data = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = ((y0 + y) * img.width + (x0 + x)) * 3;
      const dst = (y * w + x) * 3;
      data[dst] = img.data[src] ?? 0;
      data[dst + 1] = img.data[src + 1] ?? 0;
      data[dst + 2] = img.data[src + 2] ?? 0;
    }
  }
  return { width: w, height: h, data };
}

function meanRgb(img: RgbImage): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  const n = img.width * img.height;
  for (let i = 0; i < n; i++) {
    r += img.data[i * 3] ?? 0;
    g += img.data[i * 3 + 1] ?? 0;
    b += img.data[i * 3 + 2] ?? 0;
  }
  return [r / n, g / n, b / n];
}

export function cropSlots(img: RgbImage, layout: Layout = DEFAULT_LAYOUT): SlotFingerprint[] {
  const slots: SlotFingerprint[] = [];
  const shopW = (layout.shop.right - layout.shop.left) * img.width;
  const shopSlotW = shopW / layout.shop.slots;
  const shopTop = layout.shop.top * img.height;
  const shopBottom = layout.shop.bottom * img.height;
  const shopH = shopBottom - shopTop;
  for (let i = 0; i < layout.shop.slots; i++) {
    const left = layout.shop.left * img.width + i * shopSlotW;
    const banner = cropRect(img, left, shopTop, left + shopSlotW, shopTop + shopH * 0.12);
    const [br, bg, bb] = meanRgb(banner);
    const face = cropRect(
      img,
      left + shopSlotW * SHOP_FACE_PAD.side,
      shopTop + shopH * SHOP_FACE_PAD.top,
      left + shopSlotW * (1 - SHOP_FACE_PAD.side),
      shopBottom - shopH * SHOP_FACE_PAD.bottom,
    );
    slots.push({
      region: "shop",
      index: i,
      fingerprint: buildFingerprint(face),
      costHint: costFromRgb(br, bg, bb),
    });
  }
  const cellW = ((layout.board.right - layout.board.left) * img.width) / layout.board.cols;
  const cellH = ((layout.board.bottom - layout.board.top) * img.height) / layout.board.rows;
  let index = 0;
  for (let r = 0; r < layout.board.rows; r++) {
    const rowOffset = r % 2 === 1 ? cellW * 0.5 : 0;
    for (let c = 0; c < layout.board.cols; c++) {
      const left = layout.board.left * img.width + c * cellW + rowOffset;
      const top = layout.board.top * img.height + r * cellH;
      const crop = cropRect(
        img,
        left + cellW * BOARD_PAD,
        top + cellH * BOARD_PAD,
        left + cellW * (1 - BOARD_PAD),
        top + cellH * (1 - BOARD_PAD),
      );
      slots.push({ region: "board", index, fingerprint: buildFingerprint(crop) });
      index += 1;
    }
  }
  return slots;
}

export function ownedIdsFromSlots(slots: RecognizeSlot[]): string[] {
  const ids: string[] = [];
  for (const s of slots) {
    if (s.region !== "board" || !s.id) continue;
    if (!ids.includes(s.id)) ids.push(s.id);
  }
  return ids;
}

export function shopIdsFromSlots(slots: RecognizeSlot[]): string[] {
  return slots.filter((s) => s.region === "shop" && s.id).map((s) => s.id as string);
}

export function voteBoardOwnedIds(
  prev: (string | null)[],
  current: RecognizeSlot[],
): { ownedIds: string[]; nextPrev: (string | null)[] } {
  const nextPrev = prev.slice();
  const ownedIds: string[] = [];
  for (const s of current) {
    if (s.region !== "board") continue;
    while (nextPrev.length <= s.index) nextPrev.push(null);
    const id = s.id;
    if (id && prev[s.index] === id && !ownedIds.includes(id)) ownedIds.push(id);
    nextPrev[s.index] = id;
  }
  return { ownedIds, nextPrev };
}

export function slotsFromNative(
  native: Array<{
    region: "shop" | "board";
    index: number;
    id?: string;
    confidence?: number;
    fingerprint?: number[];
    costHint?: number | null;
  }>,
  templates: ChampionTemplate[],
): RecognizeSlot[] {
  const hasFp = native.some((s) => (s.fingerprint?.length ?? 0) === FP_LEN);
  const hasIdField = native.some((s) => s.id !== undefined);
  if (hasIdField && !hasFp) {
    return native.map((s) => ({
      region: s.region,
      index: s.index,
      id: s.id && s.id.length ? s.id : null,
      confidence: s.confidence ?? 0,
    }));
  }
  if (hasFp) {
    return matchSlots(
      native.map((s) => ({
        region: s.region,
        index: s.index,
        fingerprint: s.fingerprint ?? [],
        costHint: s.costHint,
      })),
      templates,
    );
  }
  return native.map((s) => ({
    region: s.region,
    index: s.index,
    id: s.id && s.id.length ? s.id : null,
    confidence: s.confidence ?? 0,
  }));
}

export function fingerprintFromRgba(width: number, height: number, rgba: Uint8Array): number[] {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = rgba[(y * width + x) * 4 + 3] ?? 0;
      if (a < 128) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) {
    minX = 0;
    minY = 0;
    maxX = width - 1;
    maxY = height - 1;
  }
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const padX = Math.floor(bw * 0.15);
  const padY = Math.floor(bh * 0.15);
  const x0 = minX + padX;
  const y0 = minY + padY;
  const x1 = maxX - padX;
  const y1 = maxY - padY;
  const cw = Math.max(1, x1 - x0 + 1);
  const ch = Math.max(1, y1 - y0 + 1);
  const data = new Uint8Array(cw * ch * 3);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const src = ((y0 + y) * width + (x0 + x)) * 4;
      const dst = (y * cw + x) * 3;
      data[dst] = rgba[src] ?? 0;
      data[dst + 1] = rgba[src + 1] ?? 0;
      data[dst + 2] = rgba[src + 2] ?? 0;
    }
  }
  return buildFingerprint({ width: cw, height: ch, data });
}
