# XHS Playwright Crawl Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Mac Playwright login + search/detail crawl with note body, then one-shot push bundle to Aliyun.

**Architecture:** `xhs-playwright.ts` drives Chromium with `storageState`; intercepts `search/notes` and note feed JSON; feeds `RawPostHint` into existing parse/merge. Push script uses `scp` + reload.

**Tech Stack:** Playwright, existing `@jcc/crawler` tsx CLI, bash scp/ssh.

---

### Task 1: Playwright login + crawl adapter

**Files:**
- Create: `apps/crawler/src/adapters/xhs-playwright.ts`
- Create: `apps/crawler/src/xhs-login.ts`
- Modify: `apps/crawler/package.json`, `apps/crawler/src/run.ts`, `apps/crawler/src/types.ts`, `.gitignore`

**Steps:**
1. Add `playwright` dependency; `pnpm exec playwright install chromium`
2. Implement login CLI saving `data/xhs/storageState.json`
3. Implement crawl: search intercept → detail pages → body from JSON/DOM
4. Wire `XHS_MODE=playwright` in `run.ts` / `crawlXhs` dispatch
5. Unit-test JSON note-detail parser with fixture (no browser in CI)
6. Scripts: `xhs:login`, `xhs:crawl`

### Task 2: Push script + docs

**Files:**
- Create: `scripts/crawl-and-push-aliyun.sh`
- Modify: `docs/deploy-aliyun.md`, `.env.example`

**Steps:**
1. Script: crawl with playwright mode → scp → reload
2. Document Mac workflow; mark server signed-header path as fallback
