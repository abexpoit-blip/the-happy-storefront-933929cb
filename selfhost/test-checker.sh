#!/usr/bin/env bash
# Zoru Shop — CheckerCCV Provider Diagnostic Test
set -euo pipefail

SECRET_DIR="${SECRET_DIR:-/etc/zoru}"
[ -f "$SECRET_DIR/checkerccv.env" ] && . "$SECRET_DIR/checkerccv.env" || true
[ -f .env ] && . .env || true

KEY="${CHECKERCCV_API_KEY:-}"
TOKEN="${CHECKERCCV_TOKEN:-}"

echo "============================================="
echo "🔍 CheckerCCV Provider Diagnostic Check"
echo "============================================="

# New CheckerCCV API: Bearer token only (API key optional legacy).
if [ -z "$TOKEN" ]; then
  echo "❌ FAILED: Missing CHECKERCCV_TOKEN!"
  echo "   Run: bash selfhost/set-secrets.sh checkerccv CHECKERCCV_TOKEN=your_token"
  exit 1
fi

[ -n "$KEY" ] && echo "✔ API Key configured: ${KEY:0:8}********"
echo "✔ Token configured:   ${TOKEN:0:8}********"

API_BASE="https://server.checkerccv.tv"

echo ""
echo "--> Testing network connection to $API_BASE..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_BASE" || echo "000")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "302" ]; then
  echo "✔ Provider server is REACHABLE (HTTP $HTTP_CODE)"
else
  echo "❌ Network error: Unable to reach $API_BASE (HTTP $HTTP_CODE)"
  exit 1
fi

echo ""
echo "--> Verifying Token and Credit Balance (GET /check_credit.php)..."
curl -s -X GET "$API_BASE/check_credit.php" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/json" || true
echo ""

echo ""
echo "--> Verifying Available Checker Gates (GET /auth/gates.php)..."
curl -s -X GET "$API_BASE/auth/gates.php" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/json" | head -c 300 || true
echo ""

echo ""
echo "============================================="
echo "✔ Diagnostic test completed!"
echo "============================================="
