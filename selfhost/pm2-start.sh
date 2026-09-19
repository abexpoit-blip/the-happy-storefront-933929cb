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

# telegram.env is authoritative for the bridge secret. A legacy
# TELEGRAM_BOT_ADMIN_SECRET must override any stale BOT_ADMIN_SECRET in .env.
if [ -f "$SECRET_DIR/telegram.env" ]; then
  TELEGRAM_FILE_HAS_CANONICAL=$(grep -c '^BOT_ADMIN_SECRET=' "$SECRET_DIR/telegram.env" || true)
  if [ "$TELEGRAM_FILE_HAS_CANONICAL" -eq 0 ] && [ -n "${TELEGRAM_BOT_ADMIN_SECRET:-}" ]; then
    export BOT_ADMIN_SECRET="$TELEGRAM_BOT_ADMIN_SECRET"
  fi
fi
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
: "${BOT_ADMIN_SECRET:?BOT_ADMIN_SECRET is missing in $SECRET_DIR/telegram.env}"

# self-hosted guard: refuse to boot against hosted supabase.co
bash "$APP_DIR/selfhost/check-env.sh" "$APP_DIR/.env"

# Automatically apply any pending database table migrations
[ -f "$APP_DIR/selfhost/auto-migrate.sh" ] && bash "$APP_DIR/selfhost/auto-migrate.sh" || true


# Recreate instead of restart so removed/rotated values cannot survive in PM2.
pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
pm2 start .output/server/index.mjs --name "$APP_NAME" --update-env

# Start or restart the automated drip scheduler worker daemon (daily 10:00 AM Asia/Dhaka)
if [ -f "$APP_DIR/selfhost/drip-worker.mjs" ]; then
  pm2 delete "zoru-drip" >/dev/null 2>&1 || true
  pm2 start "$APP_DIR/selfhost/drip-worker.mjs" --name "zoru-drip" --update-env
fi

# Keep or start the checker bot daemon (zoru-bot) if TELEGRAM_BOT_TOKEN is configured
if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -f "$APP_DIR/bot/checker-bot.mjs" ]; then
  if pm2 describe "zoru-bot" >/dev/null 2>&1; then
    pm2 restart "zoru-bot" --update-env >/dev/null 2>&1 || true
  else
    pm2 start "$APP_DIR/bot/checker-bot.mjs" --name "zoru-bot" --update-env --restart-delay 3000 || true
  fi
fi

# Start or restart the dedicated update alert bot daemon (@Zorushopupdatebot)
if [ -f "$APP_DIR/bot/update-bot.mjs" ]; then
  pm2 delete "zoru-update-bot" >/dev/null 2>&1 || true
  pm2 start "$APP_DIR/bot/update-bot.mjs" --name "zoru-update-bot" --update-env
fi

pm2 save

echo "OK: zoru-cc, zoru-drip, zoru-bot (checker), and zoru-update-bot (updates) configured."

