#!/usr/bin/env bash
# 登录小红书 → 同步会话到阿里云 → 抓取并推送阵容
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
exec pnpm --filter @jcc/crawler exec tsx src/xhs-login-sync.ts
