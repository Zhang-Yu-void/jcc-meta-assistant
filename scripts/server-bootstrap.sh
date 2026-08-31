#!/usr/bin/env bash
# One-shot bootstrap for Aliyun web console (root shell).
# Usage: bash scripts/server-bootstrap.sh
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/jcc-meta-assistant}"
REPO="${REPO:-https://github.com/Zhang-Yu-void/jcc-meta-assistant.git}"
ENV_FILE="${ENV_FILE:-/etc/jcc-meta.env}"
PORT="${PORT:-8787}"

echo "==> Install dir: $INSTALL_DIR"

# --- Node 20 + pnpm + pm2 ---
if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'process.version.slice(1).split(".")[0]')" -lt 20 ]]; then
  echo "==> Installing Node 20..."
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  else
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    yum install -y nodejs || dnf install -y nodejs
  fi
fi

command -v pnpm >/dev/null 2>&1 || npm install -g pnpm@9
command -v pm2 >/dev/null 2>&1 || npm install -g pm2

# --- Clone or pull ---
if [[ -d "$INSTALL_DIR/.git" ]]; then
  echo "==> Pulling latest..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  echo "==> Cloning repo..."
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone "$REPO" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
pnpm install

mkdir -p data/live

# --- Env file (skip if exists) ---
if [[ ! -f "$ENV_FILE" ]]; then
  ADMIN_TOKEN="$(openssl rand -hex 16 2>/dev/null || head -c 16 /dev/urandom | xxd -p)"
  cat >"$ENV_FILE" <<EOF
DATA_PATH=$INSTALL_DIR/data/live/bundle.json
ADMIN_TOKEN=$ADMIN_TOKEN
PORT=$PORT
TAPTAP_GROUP_ID=213275
NGA_FID=510461
XHS_KEYWORD="金铲铲之战 阵容"
PUBLISHER_RELOAD_URL=http://127.0.0.1:$PORT/v1/admin/reload
CRAWLER_RATE_MS=1000
# NGA_COOKIE=
# XHS_COOKIE=
EOF
  echo "==> Created $ENV_FILE (ADMIN_TOKEN=$ADMIN_TOKEN)"
else
  echo "==> Using existing $ENV_FILE"
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# --- First crawl (TapTap works without cookie) ---
echo "==> Running first crawl..."
pnpm crawl || echo "WARN: crawl failed — publisher will use sample data until fixed"

# --- PM2 ---
pm2 delete jcc-publisher 2>/dev/null || true
pm2 start "pnpm --filter @jcc/publisher start" --name jcc-publisher --cwd "$INSTALL_DIR"
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo ""
echo "==> Done. Verify:"
echo "  curl -s http://127.0.0.1:$PORT/health"
echo "  curl -s http://127.0.0.1:$PORT/v1/meta | head -c 200"
echo ""
echo "Tablet Meta URL (after exposing port or nginx):"
echo "  http://8.141.20.44:$PORT/v1/meta"
echo "  or https://your-domain/v1/meta"
echo ""
echo "Cron (optional, every 30 min):"
echo "  */30 * * * * cd $INSTALL_DIR && set -a && . $ENV_FILE && set +a && ./scripts/crawl-and-publish.sh >> /var/log/jcc-crawl.log 2>&1"
