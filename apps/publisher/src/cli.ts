import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPublisher } from "./server.js";

const port = Number(process.env.PORT ?? 8787);
const dataPath =
  process.env.DATA_PATH ??
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../data/sample/bundle.json");
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
