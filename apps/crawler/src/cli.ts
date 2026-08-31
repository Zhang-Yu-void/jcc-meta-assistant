#!/usr/bin/env node
import { runCrawl } from "./run.js";

const args = process.argv.slice(2);
const skipPlatforms = args.includes("--skip")
  ? args[args.indexOf("--skip") + 1]?.split(",") ?? []
  : [];

async function main() {
  console.log("JCC Meta Crawler — TapTap → 小红书 → NGA");
  const report = await runCrawl({ skipPlatforms });
  console.log(`\n✓ Wrote ${report.outputPath}`);
  console.log(`  version: ${report.version}`);
  console.log(`  compositions: ${report.compositionCount}`);
  console.log(`  raw posts:`, report.byPlatform);
  if (report.errors.length) {
    console.warn("\nWarnings:");
    for (const e of report.errors) console.warn(`  - ${e}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
