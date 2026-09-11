#!/usr/bin/env bash
# Install/update the complete Zoru Telegram bot integration on the VPS.
# It applies dependencies in order, rebuilds/restarts the website so it loads
# BOT_ADMIN_SECRET, verifies account creation, then starts the polling bot.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/zoru-cc}"
SECRET_FILE="${SECRET_FILE:-/etc/zoru/telegram.env}"

cd "$APP_DIR"

if [ ! -f "$SECRET_FILE" ]; then
  echo "FAIL: $SECRET_FILE is missing" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$SECRET_FILE"
set +a

: "${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN is missing in $SECRET_FILE}"
: "${TELEGRAM_ADMIN_IDS:?TELEGRAM_ADMIN_IDS is missing in $SECRET_FILE}"
export BOT_ADMIN_SECRET="${BOT_ADMIN_SECRET:-${TELEGRAM_BOT_ADMIN_SECRET:-}}"
: "${BOT_ADMIN_SECRET:?BOT_ADMIN_SECRET is missing in $SECRET_FILE}"

DB_CONTAINER="${DB_CONTAINER:-}"
if [ -z "$DB_CONTAINER" ]; then
  DB_CONTAINER=$(docker ps --format '{{.Names}} {{.Image}}' \
    | awk 'tolower($0) ~ /postgres|supabase.*db/ {print $1; exit}')
fi
if [ -z "$DB_CONTAINER" ]; then
  echo "FAIL: running PostgreSQL Docker container was not found" >&2
  exit 1
fi

echo "Using database container: $DB_CONTAINER"
for migration in \
  selfhost/referrals.sql \
  selfhost/credits.sql \
  selfhost/self-checker.sql \
  selfhost/checker-admin-api.sql \
  selfhost/api-access-full-logs.sql \
  selfhost/api-usd-billing.sql \
  selfhost/bot-accounts.sql
do
  echo "Applying $migration"
  docker exec -i "$DB_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < "$migration"
done

echo "Building website"
npm install --no-audit --no-fund
npm run build

# Reload all /etc/zoru/*.env files into the website process first. The bridge
# cannot authenticate the bot until the site has the same BOT_ADMIN_SECRET.
bash selfhost/pm2-start.sh
bash selfhost/bot-start.sh

echo "--- final status"
pm2 status zoru-cc zoru-bot
echo "OK: Telegram bot, website bridge and admin account are connected."