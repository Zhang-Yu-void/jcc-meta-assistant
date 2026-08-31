#!/usr/bin/env node
import { runXhsLogin, defaultStorageStatePath } from "./adapters/xhs-playwright.js";
import { syncStatusToAliyun } from "./xhs-ops.js";
import { clearExpireEmailCooldown, readXhsStatus } from "./xhs-session.js";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const autoPush = (process.env.XHS_AUTO_PUSH ?? "1") !== "0";

async function main() {
  await runXhsLogin();
  const status = readXhsStatus();
  if (!status?.ok) {
    throw new Error("login saved but status not ok");
  }
  clearExpireEmailCooldown();
  syncStatusToAliyun(status, defaultStorageStatePath());

  if (autoPush) {
    console.log("\n[push] crawl + push Aliyun…");
    const r = spawnSync("bash", [path.join(ROOT, "scripts/crawl-and-push-aliyun.sh")], {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, XHS_MODE: "playwright" },
    });
    if (r.status !== 0) process.exit(r.status ?? 1);
  } else {
    console.log("跳过自动推送（XHS_AUTO_PUSH=0）。可手动: ./scripts/crawl-and-push-aliyun.sh");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
