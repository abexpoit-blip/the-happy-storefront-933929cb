#!/usr/bin/env bash
# ============= Zoru Shop one-command deploy =============
# Usage:
#   bash selfhost/deploy.sh "<tarball-url>"   # download latest code, then build + restart
#   bash selfhost/deploy.sh                   # code already on VPS (git repo) — build + restart
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/zoru-cc}"
SRC_URL="${1:-}"

echo "==> Deploy target: $APP_DIR"

if [ -n "$SRC_URL" ]; then
  echo "==> Downloading latest code..."
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  curl -fSL --retry 3 -o "$tmp/code.tar.gz" "$SRC_URL"
  rm -rf "$tmp/src" && mkdir -p "$tmp/src"
  tar -xzf "$tmp/code.tar.gz" --strip-components=1 -C "$tmp/src"
  rsync -a --delete \
    --exclude='.env' --exclude='node_modules' --exclude='.output' \
    --exclude='.git' --exclude='selfhost/*.env' \
    "$tmp/src/" "$APP_DIR/"
  echo "==> Code updated."
elif [ -d "$APP_DIR/.git" ]; then
  echo "==> Pulling latest code from git..."
  git -C "$APP_DIR" fetch origin || true
  git -C "$APP_DIR" reset --hard origin/main
else
  echo "==> No URL given and no git repo — using the code already in $APP_DIR"
fi

cd "$APP_DIR"
chmod +x selfhost/*.sh

echo "==> Installing dependencies..."
if command -v npm >/dev/null 2>&1; then
  npm install --no-audit --no-fund
else
  bun install
fi

echo "==> Building..."
npm run build 2>/dev/null || bun run build

echo "==> Restarting services (zoru-cc, zoru-drip, bots)..."
bash selfhost/pm2-start.sh

echo
echo "==> Status:"
pm2 status
echo
echo "==> Last 30 log lines:"
pm2 logs zoru-cc --lines 30 --nostream
echo
echo "OK: deploy complete. Check https://zoru.cc"
