/** Future crawler adapter — not implemented in v1. Output must be MetaBundle JSON. */
export async function fetchRaw(): Promise<never> {
  throw new Error("Adapter not implemented: taptap");
}
