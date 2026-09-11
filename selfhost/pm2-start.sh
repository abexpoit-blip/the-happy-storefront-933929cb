#!/usr/bin/env bash
# .env থেকে সব ভ্যারিয়েবল process env-এ লোড করে অ্যাপ (re)start করে।
# PM2 নিজে .env পড়ে না — তাই server-side SUPABASE_URL / PLISIO_API_KEY missing দেখায়।
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/zoru-cc}"
APP_NAME="${APP_NAME:-zoru-cc}"
PORT="${PORT:-3002}"

cd "$APP_DIR"

SECRET_DIR="${SECRET_DIR:-/etc/zoru}"

set -a
# shellcheck disable=SC1091
. ./.env
# প্রতিটি সার্ভিসের key আলাদা ফাইল থেকে লোড হয় (plisio / checkerccv / smtp / telegram)
for f in "$SECRET_DIR"/*.env; do
  # shellcheck disable=SC1090
  [ -e "$f" ] && . "$f"
done
set +a
export PORT

for v in PLISIO_API_KEY CHECKERCCV_API_KEY CHECKERCCV_TOKEN; do
  [ -n "${!v:-}" ] || echo "WARN: $v missing — bash selfhost/set-secrets.sh <service> $v=VALUE" >&2
done

for v in SUPABASE_URL SUPABASE_PUBLISHABLE_KEY SUPABASE_SERVICE_ROLE_KEY; do
  if [ -z "${!v:-}" ]; then
    echo "MISSING $v in $APP_DIR/.env — run: bash selfhost/fix-env.sh" >&2
    exit 1
  fi
done

# self-hosted guard: refuse to boot against hosted supabase.co
bash "$APP_DIR/selfhost/check-env.sh" "$APP_DIR/.env"


# Recreate instead of restart so removed/rotated values cannot survive in PM2.
pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
pm2 start .output/server/index.mjs --name "$APP_NAME" --update-env
pm2 save

echo "OK: $APP_NAME restarted on port $PORT with env from .env"
