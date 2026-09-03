#!/usr/bin/env bash
# .env থেকে সব ভ্যারিয়েবল process env-এ লোড করে অ্যাপ (re)start করে।
# PM2 নিজে .env পড়ে না — তাই server-side SUPABASE_URL / PLISIO_API_KEY missing দেখায়।
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/zoru-cc}"
APP_NAME="${APP_NAME:-zoru-cc}"
PORT="${PORT:-3002}"

cd "$APP_DIR"

set -a
# shellcheck disable=SC1091
. ./.env
set +a
export PORT

for v in SUPABASE_URL SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY; do
  if [ -z "${!v:-}" ]; then
    echo "MISSING $v in $APP_DIR/.env — run: bash selfhost/fix-env.sh" >&2
    exit 1
  fi
done

if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$APP_NAME" --update-env
else
  pm2 start .output/server/index.mjs --name "$APP_NAME" --update-env
fi
pm2 save

echo "OK: $APP_NAME restarted on port $PORT with env from .env"
