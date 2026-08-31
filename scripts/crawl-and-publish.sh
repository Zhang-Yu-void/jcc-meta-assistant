#!/usr/bin/env bash
# Crawl meta from TapTap / XHS / NGA, write bundle, reload publisher.
# On Aliyun: prefer Mac Playwright push (./scripts/crawl-and-push-aliyun.sh).
# This script refuses to overwrite a richer live bundle unless FORCE_CRAWL=1.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export DATA_PATH="${DATA_PATH:-$ROOT/data/live/bundle.json}"
export ADMIN_TOKEN="${ADMIN_TOKEN:-dev}"
export PUBLISHER_RELOAD_URL="${PUBLISHER_RELOAD_URL:-http://127.0.0.1:8787/v1/admin/reload}"

# Optional: CRAWLER_SKIP=xhs  or  CRAWLER_SKIP=taptap,nga,xhs
SKIP_ARGS=()
if [[ -n "${CRAWLER_SKIP:-}" ]]; then
  SKIP_ARGS=(-- --skip "$CRAWLER_SKIP")
fi

BACKUP=""
if [[ -f "$DATA_PATH" ]]; then
  BACKUP="${DATA_PATH}.prev"
  cp "$DATA_PATH" "$BACKUP"
fi

echo "[1/2] Running crawler..."
pnpm --filter @jcc/crawler crawl "${SKIP_ARGS[@]}"

if [[ -n "$BACKUP" && -f "$BACKUP" && "${FORCE_CRAWL:-0}" != "1" ]]; then
  PREV_N="$(python3 -c "import json;print(len(json.load(open('$BACKUP')).get('compositions',[])))" 2>/dev/null || echo 0)"
  NEW_N="$(python3 -c "import json;print(len(json.load(open('$DATA_PATH')).get('compositions',[])))" 2>/dev/null || echo 0)"
  if [[ "$NEW_N" -lt "$PREV_N" ]]; then
    echo "WARN: new crawl has $NEW_N compositions < previous $PREV_N — restoring previous bundle (set FORCE_CRAWL=1 to override)"
    mv "$BACKUP" "$DATA_PATH"
  else
    rm -f "$BACKUP"
  fi
fi

echo "[2/2] Reload publisher (DATA_PATH=$DATA_PATH)..."
if [[ -n "${SKIP_RELOAD:-}" ]]; then
  echo "SKIP_RELOAD set — copy bundle and restart publisher manually"
  exit 0
fi

curl -sf -X POST "$PUBLISHER_RELOAD_URL" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  && echo "Reload OK" \
  || echo "Reload skipped (publisher not running?)"
