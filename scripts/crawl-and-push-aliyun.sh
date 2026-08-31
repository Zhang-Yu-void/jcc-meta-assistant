#!/usr/bin/env bash
# Mac: Playwright crawl (XHS) + push live bundle to Aliyun publisher.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export XHS_MODE="${XHS_MODE:-playwright}"
export DATA_PATH="${DATA_PATH:-$ROOT/data/live/bundle.json}"
ALIYUN_HOST="${ALIYUN_HOST:-aliyun}"
ALIYUN_DATA_PATH="${ALIYUN_DATA_PATH:-/opt/jcc-meta-assistant/data/live/bundle.json}"
ALIYUN_ENV="${ALIYUN_ENV:-/etc/jcc-meta.env}"

echo "[1/3] Crawl (XHS_MODE=$XHS_MODE)..."
pnpm --filter @jcc/crawler crawl

if [[ ! -f "$DATA_PATH" ]]; then
  echo "ERROR: missing $DATA_PATH"
  exit 1
fi

echo "[2/3] Upload bundle → $ALIYUN_HOST:$ALIYUN_DATA_PATH"
scp "$DATA_PATH" "$ALIYUN_HOST:$ALIYUN_DATA_PATH"

echo "[3/3] Reload publisher"
ssh "$ALIYUN_HOST" "set -a; source '$ALIYUN_ENV'; set +a; curl -sf -X POST \"\${PUBLISHER_RELOAD_URL:-http://127.0.0.1:8787/v1/admin/reload}\" -H \"Authorization: Bearer \$ADMIN_TOKEN\" && echo OK"

echo "Done. Meta URL: http://8.141.20.44:8084/jcc/v1/meta"
