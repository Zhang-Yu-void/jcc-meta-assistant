#!/usr/bin/env node
import { runXhsLogin } from "./adapters/xhs-playwright.js";

runXhsLogin().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
