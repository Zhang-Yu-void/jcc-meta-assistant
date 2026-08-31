#!/usr/bin/env bash
# 定时巡检小红书登录态：过期则发邮件（经阿里云 SMTP），并把 status 同步到服务器
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# exit 2 = expired (still "success" for cron); other nonzero = tool error
set +e
pnpm --filter @jcc/crawler exec tsx src/xhs-check.ts
code=$?
set -e
if [[ "$code" -eq 0 || "$code" -eq 2 ]]; then
  exit 0
fi
exit "$code"
