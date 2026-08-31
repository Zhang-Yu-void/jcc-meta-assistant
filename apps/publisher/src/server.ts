import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { loadMeta, reloadMeta, getMeta } from "./loadMeta.js";

export type CreatePublisherOptions = {
  dataPath: string;
  adminToken: string;
  port: number;
};

export type Publisher = {
  port: number;
  reload: () => void;
  close: () => Promise<void>;
};

export async function createPublisher(opts: CreatePublisherOptions): Promise<Publisher> {
  loadMeta(opts.dataPath);

  const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/v1/meta") {
      const { bundle, etag } = getMeta();
      const ifNoneMatch = req.headers["if-none-match"];
      if (ifNoneMatch === etag) {
        res.writeHead(304, { ETag: etag });
        res.end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": "application/json",
        ETag: etag,
        "Cache-Control": "public, max-age=60",
      });
      res.end(JSON.stringify(bundle));
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/admin/reload") {
      const auth = req.headers.authorization;
      if (auth !== `Bearer ${opts.adminToken}`) {
        res.writeHead(401);
        res.end();
        return;
      }
      reloadMeta();
      res.writeHead(200);
      res.end();
      return;
    }

    res.writeHead(404);
    res.end();
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(opts.port, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : opts.port;
      resolve({
        port,
        reload: () => {
          reloadMeta();
        },
        close: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}
