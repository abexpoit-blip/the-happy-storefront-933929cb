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

export BOT_API_BASE="${BOT_API_BASE:-${API_BASE:-https://zoru.cc}}"
export TELEGRAM_ADMIN_IDS="${TELEGRAM_ADMIN_IDS:-}"
# The site reads BOT_ADMIN_SECRET; accept the older Telegram-prefixed name too.
export BOT_ADMIN_SECRET="${BOT_ADMIN_SECRET:-${TELEGRAM_BOT_ADMIN_SECRET:-}}"
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

BRIDGE_BODY='{"telegram_id":1}'
BRIDGE_OK=$(curl -fsS --max-time 20 -X POST "${BOT_API_BASE}/api/public/bot/health" \
  -H 'Content-Type: application/json' \
  -H "x-bot-secret: ${BOT_ADMIN_SECRET}" \
  -d "$BRIDGE_BODY" 2>/dev/null || true)
if ! printf '%s' "$BRIDGE_OK" | grep -q '"status":"success"'; then
  echo "Website bot bridge is not ready at ${BOT_API_BASE}." >&2
  echo "Check BOT_ADMIN_SECRET, deploy the latest website build, and apply selfhost/bot-accounts.sql." >&2
  exit 1
fi

ADMIN_ID="${TELEGRAM_ADMIN_IDS%%,*}"
if [ -n "$ADMIN_ID" ]; then
  case "$ADMIN_ID" in
    *[!0-9]*) echo "TELEGRAM_ADMIN_IDS must contain numeric Telegram IDs" >&2; exit 1 ;;
  esac
  SESSION_BODY=$(printf '{"telegram_id":%s,"username":"zoru_admin"}' "$ADMIN_ID")
  SESSION_OK=$(curl -fsS --max-time 30 -X POST "${BOT_API_BASE}/api/public/bot/session" \
    -H 'Content-Type: application/json' \
    -H "x-bot-secret: ${BOT_ADMIN_SECRET}" \
    -d "$SESSION_BODY" 2>/dev/null || true)
  if ! printf '%s' "$SESSION_OK" | grep -q '"status":"success"'; then
    echo "Bot account creation test failed for the configured Telegram admin." >&2
    echo "Check website logs and confirm the bot database migration was applied." >&2
    exit 1
  fi
fi

export BOT_DATA_FILE="${BOT_DATA_FILE:-/var/lib/zoru-bot/users.json}"

mkdir -p "$(dirname "$BOT_DATA_FILE")"
chmod 700 "$(dirname "$BOT_DATA_FILE")"

cd "$APP_DIR"
pm2 delete zoru-bot >/dev/null 2>&1 || true
pm2 start bot/checker-bot.mjs --name zoru-bot --update-env --time --restart-delay 3000 --max-restarts 10
pm2 save

echo "--- bot logs"
pm2 logs zoru-bot --lines 20 --nostream
