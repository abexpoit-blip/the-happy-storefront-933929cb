#!/usr/bin/env bash
# ==============================================================================
# Zoru Shop — Telegram Base Alert Diagnostic Script
# Verifies TELEGRAM_BOT_TOKEN, channel membership, admin rights, and sends a test alert.
# ==============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/zoru-cc}"
SECRET_FILE="${SECRET_FILE:-/etc/zoru/telegram.env}"

echo "============================================="
echo " ZORU TELEGRAM ALERT DIAGNOSTIC TEST"
echo "============================================="

# 1. Load environment variables
if [ -f "$APP_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$APP_DIR/.env"
  set +a
fi

if [ -f "$SECRET_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$SECRET_FILE"
  set +a
fi

TOKEN="${TELEGRAM_BOT_TOKEN:-}"
CHANNEL="${TELEGRAM_CHANNEL_ID:-@zorushop}"

if [ -z "$TOKEN" ]; then
  echo "❌ FAIL: TELEGRAM_BOT_TOKEN is not set in $SECRET_FILE or $APP_DIR/.env"
  echo "--> Run: bash selfhost/set-secrets.sh telegram TELEGRAM_BOT_TOKEN=your_token_here"
  exit 1
fi

echo "✔ Token found: ${TOKEN:0:9}..."
echo "✔ Target channel: $CHANNEL"
echo ""

# 2. Check Bot Identity (getMe)
echo "--> Step 1: Checking Bot Identity (getMe)..."
ME_RES=$(curl -fsS --max-time 10 "https://api.telegram.org/bot${TOKEN}/getMe" 2>&1 || true)
IS_OK=$(echo "$ME_RES" | grep -o '"ok":true' || true)

if [ -z "$IS_OK" ]; then
  echo "❌ FAIL: Telegram API rejected the token!"
  echo "Response: $ME_RES"
  exit 1
fi

BOT_NAME=$(echo "$ME_RES" | grep -o '"username":"[^"]*' | cut -d'"' -f4 || echo "unknown_bot")
BOT_ID=$(echo "$ME_RES" | grep -o '"id":[0-9]*' | cut -d':' -f2 || echo "0")
echo "✔ Bot verified: @$BOT_NAME (ID: $BOT_ID)"
echo ""

# 3. Check Channel Access (getChat)
echo "--> Step 2: Checking Channel Access ($CHANNEL)..."
CHAT_RES=$(curl -fsS --max-time 10 "https://api.telegram.org/bot${TOKEN}/getChat?chat_id=${CHANNEL}" 2>&1 || true)
CHAT_OK=$(echo "$CHAT_RES" | grep -o '"ok":true' || true)

if [ -z "$CHAT_OK" ]; then
  echo "❌ FAIL: Bot cannot find channel $CHANNEL"
  echo "Response: $CHAT_RES"
  echo "--> Hint: Make sure the channel username is correct and public, or bot has been added."
  exit 1
fi

CHAT_TITLE=$(echo "$CHAT_RES" | grep -o '"title":"[^"]*' | cut -d'"' -f4 || echo "$CHANNEL")
echo "✔ Channel found: '$CHAT_TITLE' ($CHANNEL)"
echo ""

# 4. Check Admin Rights (getChatMember)
echo "--> Step 3: Checking Bot Admin Permissions in $CHANNEL..."
MEMBER_RES=$(curl -fsS --max-time 10 "https://api.telegram.org/bot${TOKEN}/getChatMember?chat_id=${CHANNEL}&user_id=${BOT_ID}" 2>&1 || true)
MEMBER_STATUS=$(echo "$MEMBER_RES" | grep -o '"status":"[^"]*' | cut -d'"' -f4 || echo "unknown")

echo "✔ Bot status in channel: $MEMBER_STATUS"

if [ "$MEMBER_STATUS" != "administrator" ] && [ "$MEMBER_STATUS" != "creator" ]; then
  echo "⚠️ WARNING: Bot @$BOT_NAME is '$MEMBER_STATUS' in $CHANNEL, NOT an administrator!"
  echo "--> To send base alerts, you MUST add @$BOT_NAME to $CHANNEL as an ADMINISTRATOR with 'Post Messages' permission!"
fi
echo ""

# 5. Send Test Alert Message
echo "--> Step 4: Sending live test base update alert to $CHANNEL..."
TEST_PAYLOAD=$(cat <<EOF
{
  "chat_id": "${CHANNEL}",
  "text": "⚡ <b>ZORU SHOP — BASE ALERT SYSTEM VERIFIED</b> ⚡\n━━━━━━━━━━━━━━━━━━━━━━\n📦 <b>Base:</b> <code>DIAGNOSTIC_VERIFY_OK</code>\n🏷 <b>Brand:</b> VISA/MC\n🌍 <b>Country:</b> ALL\n⚡ <b>Delivery:</b> Instant Automated Delivery\n\n✅ <i>Live Telegram alert channel connection verified successfully!</i>\n\n🛒 <b>Shop Now:</b> <a href=\"https://zoru.cc/shop\">zoru.cc/shop</a>\n🤖 <b>Checker Bot:</b> <a href=\"https://t.me/ZoruCheckerbot\">@ZoruCheckerbot</a>\n📢 <b>Official Channel:</b> ${CHANNEL}\n💬 <b>Support:</b> @Zorushop_service\n━━━━━━━━━━━━━━━━━━━━━━",
  "parse_mode": "HTML",
  "disable_web_page_preview": true,
  "reply_markup": {
    "inline_keyboard": [
      [
        { "text": "🛒 Buy Cards Now", "url": "https://zoru.cc/shop" },
        { "text": "🤖 Telegram Checker Bot", "url": "https://t.me/ZoruCheckerbot" }
      ],
      [
        { "text": "💬 Support", "url": "https://t.me/Zorushop_service" },
        { "text": "📢 Official Channel", "url": "https://t.me/zorushop" }
      ]
    ]
  }
}
EOF
)

SEND_RES=$(curl -fsS --max-time 10 \
  -H "Content-Type: application/json" \
  -X POST "https://api.telegram.org/bot${TOKEN}/sendMessage" \
  -d "$TEST_PAYLOAD" 2>&1 || true)

SEND_OK=$(echo "$SEND_RES" | grep -o '"ok":true' || true)

if [ -n "$SEND_OK" ]; then
  MSG_ID=$(echo "$SEND_RES" | grep -o '"message_id":[0-9]*' | cut -d':' -f2 || echo "sent")
  echo "============================================="
  echo "✔ SUCCESS! Test alert posted to $CHANNEL (Message ID: $MSG_ID)"
  echo "Telegram group/channel alert is 100% WORKING properly!"
  echo "============================================="
else
  echo "============================================="
  echo "❌ FAIL: Could not send message to $CHANNEL"
  echo "Response: $SEND_RES"
  echo ""
  echo "Action Required:"
  echo "1. Open Telegram and go to channel $CHANNEL"
  echo "2. Go to Channel Settings -> Administrators -> Add Administrator"
  echo "3. Search for @$BOT_NAME and add it"
  echo "4. Grant permission: 'Post Messages' (or 'Send Messages')"
  echo "5. Save and rerun this test script."
  echo "============================================="
  exit 1
fi
