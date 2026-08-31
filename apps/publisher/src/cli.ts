import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createPublisher } from "./server.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const liveBundle = path.join(root, "data/live/bundle.json");
const sampleBundle = path.join(root, "data/sample/bundle.json");

const port = Number(process.env.PORT ?? 8787);
const dataPath =
  process.env.DATA_PATH ??
  (existsSync(liveBundle) ? liveBundle : sampleBundle);
const adminToken = process.env.ADMIN_TOKEN ?? "dev";

const publisher = await createPublisher({ dataPath, adminToken, port });
console.log(`Publisher listening on http://127.0.0.1:${publisher.port}`);

process.on("SIGINT", async () => {
  await publisher.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await publisher.close();
  process.exit(0);
});
