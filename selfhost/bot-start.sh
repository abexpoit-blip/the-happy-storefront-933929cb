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
: "${TELEGRAM_ADMIN_IDS:?TELEGRAM_ADMIN_IDS not set in $SECRET_FILE}"

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

EXPECTED_TAG=$(printf 'zoru-bot:%s' "$BOT_ADMIN_SECRET" | sha256sum | cut -c1-12)
BRIDGE_BODY='{"telegram_id":1}'
BRIDGE_FILE=$(mktemp)
trap 'rm -f "$BRIDGE_FILE" "${SESSION_FILE:-}"' EXIT
BRIDGE_STATUS=$(curl -sS --max-time 20 -o "$BRIDGE_FILE" -w '%{http_code}' -X POST "${BOT_API_BASE}/api/public/bot/health" \
  -H 'Content-Type: application/json' \
  -H "x-bot-secret: ${BOT_ADMIN_SECRET}" \
  -d "$BRIDGE_BODY" 2>/dev/null || true)
BRIDGE_OK=$(cat "$BRIDGE_FILE")
if [ "$BRIDGE_STATUS" = "401" ]; then
  echo "Website rejected BOT_ADMIN_SECRET (HTTP 401). The website and bot loaded different values." >&2
  echo "Run selfhost/bot-install.sh after saving one matching BOT_ADMIN_SECRET." >&2
  exit 1
fi
if [ "$BRIDGE_STATUS" != "200" ] || ! printf '%s' "$BRIDGE_OK" | grep -q '"status":"success"'; then
  SAFE_MESSAGE=$(printf '%s' "$BRIDGE_OK" | sed -n 's/.*"message":"\([^"]*\)".*/\1/p')
  echo "Website bot bridge failed (HTTP ${BRIDGE_STATUS:-000}): ${SAFE_MESSAGE:-no JSON response}" >&2
  echo "Deploy the latest website build and apply all migrations with selfhost/bot-install.sh." >&2
  exit 1
fi
if ! printf '%s' "$BRIDGE_OK" | grep -q "\"auth_tag\":\"$EXPECTED_TAG\""; then
  echo "Website bridge loaded a different BOT_ADMIN_SECRET fingerprint." >&2
  exit 1
fi

ADMIN_ID=$(printf '%s' "${TELEGRAM_ADMIN_IDS%%,*}" | tr -d '[:space:]')
case "$ADMIN_ID" in
  ''|*[!0-9]*) echo "TELEGRAM_ADMIN_IDS must start with a numeric Telegram ID" >&2; exit 1 ;;
esac
if [ -n "$ADMIN_ID" ]; then
  SESSION_BODY=$(printf '{"telegram_id":%s,"username":"zoru_admin"}' "$ADMIN_ID")
  SESSION_FILE=$(mktemp)
  SESSION_STATUS=$(curl -sS --max-time 30 -o "$SESSION_FILE" -w '%{http_code}' -X POST "${BOT_API_BASE}/api/public/bot/session" \
    -H 'Content-Type: application/json' \
    -H "x-bot-secret: ${BOT_ADMIN_SECRET}" \
    -d "$SESSION_BODY" 2>/dev/null || true)
  SESSION_OK=$(cat "$SESSION_FILE")
  if [ "$SESSION_STATUS" != "200" ] || ! printf '%s' "$SESSION_OK" | grep -q '"status":"success"'; then
    SAFE_MESSAGE=$(printf '%s' "$SESSION_OK" | sed -n 's/.*"message":"\([^"]*\)".*/\1/p')
    echo "Bot account creation test failed (HTTP ${SESSION_STATUS:-000}): ${SAFE_MESSAGE:-no JSON response}" >&2
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
