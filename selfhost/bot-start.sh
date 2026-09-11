#!/usr/bin/env bash
# Telegram checker bot PM2 দিয়ে চালু/রিস্টার্ট করে।
#
#   bash selfhost/set-secrets.sh telegram TELEGRAM_BOT_TOKEN=xxxx TELEGRAM_ADMIN_IDS=123456 TELEGRAM_BOT_ADMIN_SECRET=yyyy
#   bash selfhost/bot-start.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/zoru-cc}"
SECRET_FILE="${SECRET_FILE:-/etc/zoru/telegram.env}"

if [ -f "$SECRET_FILE" ]; then
  set -a; . "$SECRET_FILE"; set +a
else
  echo "missing $SECRET_FILE — run selfhost/set-secrets.sh telegram TELEGRAM_BOT_TOKEN=..." >&2
  exit 1
fi

: "${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN not set in $SECRET_FILE}"

export API_BASE="${API_BASE:-https://zoru.cc}"
export TELEGRAM_ADMIN_IDS="${TELEGRAM_ADMIN_IDS:-}"
# The site reads BOT_ADMIN_SECRET; keep the same value on both sides.
export BOT_ADMIN_SECRET="${TELEGRAM_BOT_ADMIN_SECRET:-${BOT_ADMIN_SECRET:-}}"
export BOT_DATA_FILE="${BOT_DATA_FILE:-/var/lib/zoru-bot/users.json}"

mkdir -p "$(dirname "$BOT_DATA_FILE")"
chmod 700 "$(dirname "$BOT_DATA_FILE")"

cd "$APP_DIR"
pm2 delete zoru-bot >/dev/null 2>&1 || true
pm2 start bot/checker-bot.mjs --name zoru-bot --update-env
pm2 save

echo "--- bot logs"
pm2 logs zoru-bot --lines 20 --nostream
