#!/usr/bin/env bash
# Safe bridge/account smoke test. Never prints tokens or shared secrets.
set -euo pipefail

SECRET_FILE="${SECRET_FILE:-/etc/zoru/telegram.env}"
[ -f "$SECRET_FILE" ] || { echo "FAIL: $SECRET_FILE is missing" >&2; exit 1; }
unset TELEGRAM_BOT_TOKEN TELEGRAM_ADMIN_IDS BOT_API_BASE API_BASE BOT_ADMIN_SECRET TELEGRAM_BOT_ADMIN_SECRET || true
set -a
# shellcheck disable=SC1090
. "$SECRET_FILE"
set +a

BOT_API_BASE="${BOT_API_BASE:-${API_BASE:-https://zoru.cc}}"
BOT_ADMIN_SECRET="${BOT_ADMIN_SECRET:-${TELEGRAM_BOT_ADMIN_SECRET:-}}"
ADMIN_ID=$(printf '%s' "${TELEGRAM_ADMIN_IDS%%,*}" | tr -d '[:space:]')
: "${BOT_ADMIN_SECRET:?BOT_ADMIN_SECRET is missing}"
case "$ADMIN_ID" in ''|*[!0-9]*) echo "FAIL: TELEGRAM_ADMIN_IDS must start with a numeric ID" >&2; exit 1;; esac

call_bridge() {
  local action="$1" body="$2" file status message
  file=$(mktemp)
  status=$(curl -sS --max-time 30 -o "$file" -w '%{http_code}' \
    -X POST "${BOT_API_BASE%/}/api/public/bot/$action" \
    -H 'Content-Type: application/json' \
    -H "x-bot-secret: $BOT_ADMIN_SECRET" \
    -d "$body" 2>/dev/null || true)
  message=$(sed -n 's/.*"message":"\([^"]*\)".*/\1/p' "$file")
  if [ "$status" != "200" ] || ! grep -q '"status":"success"' "$file"; then
    rm -f "$file"
    echo "FAIL: $action returned HTTP ${status:-000}: ${message:-no JSON response}" >&2
    return 1
  fi
  rm -f "$file"
  echo "OK: $action"
}

BAD_STATUS=$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' \
  -X POST "${BOT_API_BASE%/}/api/public/bot/health" \
  -H 'Content-Type: application/json' -H 'x-bot-secret: deliberately-wrong' \
  -d '{"telegram_id":1}' 2>/dev/null || true)
[ "$BAD_STATUS" = "401" ] || { echo "FAIL: wrong secret was not rejected (HTTP $BAD_STATUS)" >&2; exit 1; }
echo "OK: wrong secret rejected"

call_bridge health '{"telegram_id":1}'
call_bridge session "{\"telegram_id\":$ADMIN_ID,\"username\":\"zoru_admin\"}"
echo "OK: protected bridge and admin account are ready"