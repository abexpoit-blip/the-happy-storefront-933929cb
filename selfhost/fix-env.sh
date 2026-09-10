#!/usr/bin/env bash
# VPS-এ .env আবার self-hosted Supabase (api.zoru.cc)-এ ফিরিয়ে আনে
# git pull করলে Lovable-এর cloud .env দিয়ে overwrite হয়ে যায় — এটা সেটা ঠিক করে।
# গুরুত্বপূর্ণ: PLISIO / CHECKERCCV ইত্যাদি extra key গুলো মুছে যায় না, রেখে দেওয়া হয়।
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/zoru-cc}"
KEYS_FILE="${KEYS_FILE:-/opt/supabase/credentials.json}"
DOMAIN_API="${DOMAIN_API:-api.zoru.cc}"

command -v jq >/dev/null || { apt-get update -y && apt-get install -y jq; }

ANON_KEY=$(jq -r .ANON_KEY "$KEYS_FILE")
SERVICE_ROLE_KEY=$(jq -r .SERVICE_ROLE_KEY "$KEYS_FILE")
POSTGRES_PASSWORD=$(jq -r .POSTGRES_PASSWORD "$KEYS_FILE")

# পুরনো .env থেকে app-specific secret গুলো সংরক্ষণ করি
EXTRA=""
if [ -f "$APP_DIR/.env" ]; then
  EXTRA=$(grep -E '^(PLISIO_|CHECKERCCV_|SMTP_|TELEGRAM_)[A-Z0-9_]+=' "$APP_DIR/.env" || true)
  cp "$APP_DIR/.env" "$APP_DIR/.env.bak"
fi

cat > "$APP_DIR/.env" <<APPENV
VITE_SUPABASE_URL=https://$DOMAIN_API
VITE_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
VITE_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_URL=https://$DOMAIN_API
SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
SUPABASE_DB_URL=postgresql://postgres:$POSTGRES_PASSWORD@127.0.0.1:5432/postgres
APPENV

if [ -n "$EXTRA" ]; then
  printf '%s\n' "$EXTRA" >> "$APP_DIR/.env"
fi

chmod 600 "$APP_DIR/.env"

# ভবিষ্যতে git pull যেন .env আর overwrite না করে
cd "$APP_DIR"
git update-index --skip-worktree .env 2>/dev/null || true

echo "OK -> $(grep '^VITE_SUPABASE_URL' "$APP_DIR/.env")"
for v in PLISIO_API_KEY CHECKERCCV_API_KEY CHECKERCCV_TOKEN; do
  if grep -q "^$v=" "$APP_DIR/.env"; then echo "OK   -> $v present"; else echo "WARN -> $v MISSING in .env"; fi
done
