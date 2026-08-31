import type { RawPostHint } from "../types.js";
import { isRelevantPost } from "../parse.js";
import type { XhsSearchNotesResponse } from "./xhs.js";
import { parseXhsSearchNotesJson } from "./xhs.js";

/** Extract note description text from various XHS detail JSON shapes. */
export function extractNoteDescFromJson(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;

  const tryNote = (note: unknown): string | null => {
    if (!note || typeof note !== "object") return null;
    const n = note as Record<string, unknown>;
    for (const key of ["desc", "description", "content"]) {
      const v = n[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
    return null;
  };

  // feed API: data.items[].note_card / note_list
  const dataNode = root.data as Record<string, unknown> | undefined;
  if (dataNode) {
    const items = (dataNode.items ?? dataNode.notes ?? dataNode.note_list) as unknown[] | undefined;
    if (Array.isArray(items)) {
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const it = item as Record<string, unknown>;
        const desc =
          tryNote(it.note_card) ??
          tryNote(it.note) ??
          tryNote(it) ??
          tryNote((it.note_card as Record<string, unknown> | undefined)?.note_card);
        if (desc) return desc;
      }
    }
    const direct = tryNote(dataNode.note) ?? tryNote(dataNode.note_card);
    if (direct) return direct;
  }

  // INITIAL_STATE-like: note.noteDetailMap[id].note.desc
  const noteStore = root.note as Record<string, unknown> | undefined;
  const map = noteStore?.noteDetailMap as Record<string, unknown> | undefined;
  if (map) {
    for (const entry of Object.values(map)) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      const desc = tryNote(e.note) ?? tryNote(e);
      if (desc) return desc;
    }
  }

  return null;
}

export function mergeDetailIntoHint(hint: RawPostHint, desc: string): RawPostHint {
  const body = [hint.body, desc].filter(Boolean).join("\n");
  return { ...hint, body };
}

export function rankHintsForDetail(hints: RawPostHint[], limit: number): RawPostHint[] {
  return [...hints]
    .sort((a, b) => (b.engagement ?? 0) - (a.engagement ?? 0))
    .slice(0, Math.max(0, limit));
}

export function parseSearchResponseOrThrow(json: XhsSearchNotesResponse): RawPostHint[] {
  if (json.success === false || (json.code != null && json.code !== 0)) {
    throw new Error(`XHS search rejected: code=${json.code} msg=${json.msg ?? ""}`);
  }
  const hints = parseXhsSearchNotesJson(json);
  return hints.filter((h) => isRelevantPost(h.title) || h.title.includes("阵"));
}
