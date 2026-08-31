import { describe, expect, it, beforeAll, afterAll } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublisher } from "./server.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dataPath = path.join(root, "data/sample/bundle.json");

describe("publisher", () => {
  let base: string;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const p = await createPublisher({ dataPath, adminToken: "secret", port: 0 });
    base = `http://127.0.0.1:${p.port}`;
    close = p.close;
  });
  afterAll(async () => {
    await close();
  });

  it("GET /health", async () => {
    const r = await fetch(`${base}/health`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });

  it("GET /v1/meta returns version and ETag", async () => {
    const r = await fetch(`${base}/v1/meta`);
    expect(r.status).toBe(200);
    expect(r.headers.get("etag")).toBeTruthy();
    const body = await r.json();
    expect(body.version).toBeTruthy();
    expect(Array.isArray(body.compositions)).toBe(true);
  });

  it("supports If-None-Match 304", async () => {
    const r1 = await fetch(`${base}/v1/meta`);
    const etag = r1.headers.get("etag")!;
    const r2 = await fetch(`${base}/v1/meta`, { headers: { "If-None-Match": etag } });
    expect(r2.status).toBe(304);
  });

  it("reload requires bearer token", async () => {
    const bad = await fetch(`${base}/v1/admin/reload`, { method: "POST" });
    expect(bad.status).toBe(401);
    const ok = await fetch(`${base}/v1/admin/reload`, {
      method: "POST",
      headers: { Authorization: "Bearer secret" },
    });
    expect(ok.status).toBe(200);
  });
});
