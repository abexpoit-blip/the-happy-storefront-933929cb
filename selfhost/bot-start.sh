#!/usr/bin/env bash
# Telegram checker bot PM2 দিয়ে চালু/রিস্টার্ট করে।
#
#   bash selfhost/set-secrets.sh telegram TELEGRAM_BOT_TOKEN=xxxx TELEGRAM_ADMIN_IDS=123456 BOT_ADMIN_SECRET=yyyy BOT_API_BASE=https://zoru.cc
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
: "${BOT_ADMIN_SECRET:?BOT_ADMIN_SECRET/TELEGRAM_BOT_ADMIN_SECRET not set in $SECRET_FILE}"

case "$BOT_API_BASE" in
  https://*) ;;
  *) echo "BOT_API_BASE must be an https:// URL (example: https://zoru.cc)" >&2; exit 1 ;;
esac

# Reject a bad/revoked token before PM2 enters a restart/error loop.
BOT_OK=$(curl -fsS --max-time 15 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe" 2>/dev/null || true)
if ! printf '%s' "$BOT_OK" | grep -q '"ok":true'; then
  echo "Telegram token validation failed. Re-copy the full token from @BotFather." >&2
  exit 1
fi

export BOT_API_BASE="${BOT_API_BASE:-${API_BASE:-https://zoru.cc}}"
export TELEGRAM_ADMIN_IDS="${TELEGRAM_ADMIN_IDS:-}"
# The site reads BOT_ADMIN_SECRET; keep the same value on both sides.
export BOT_ADMIN_SECRET="${TELEGRAM_BOT_ADMIN_SECRET:-${BOT_ADMIN_SECRET:-}}"
export BOT_DATA_FILE="${BOT_DATA_FILE:-/var/lib/zoru-bot/users.json}"

mkdir -p "$(dirname "$BOT_DATA_FILE")"
chmod 700 "$(dirname "$BOT_DATA_FILE")"

cd "$APP_DIR"
pm2 delete zoru-bot >/dev/null 2>&1 || true
pm2 start bot/checker-bot.mjs --name zoru-bot --update-env --time --restart-delay 3000 --max-restarts 10
pm2 save

echo "--- bot logs"
pm2 logs zoru-bot --lines 20 --nostream
