#!/usr/bin/env node
import { runXhsCheck } from "./xhs-ops.js";

const args = new Set(process.argv.slice(2));
const notify = !args.has("--no-notify");
const sync = !args.has("--no-sync");

runXhsCheck({ notify, sync })
  .then((s) => process.exit(s.ok ? 0 : 2))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
