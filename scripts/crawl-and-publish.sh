#!/usr/bin/env bash
# Crawl meta from TapTap / XHS / NGA, write bundle, reload publisher.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export DATA_PATH="${DATA_PATH:-$ROOT/data/live/bundle.json}"
export ADMIN_TOKEN="${ADMIN_TOKEN:-dev}"
export PUBLISHER_RELOAD_URL="${PUBLISHER_RELOAD_URL:-http://127.0.0.1:8787/v1/admin/reload}"

echo "[1/2] Running crawler..."
pnpm --filter @jcc/crawler crawl

echo "[2/2] Reload publisher (DATA_PATH=$DATA_PATH)..."
if [[ -n "${SKIP_RELOAD:-}" ]]; then
  echo "SKIP_RELOAD set — copy bundle and restart publisher manually"
  exit 0
fi

curl -sf -X POST "$PUBLISHER_RELOAD_URL" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  && echo "Reload OK" \
  || echo "Reload skipped (publisher not running?)"
