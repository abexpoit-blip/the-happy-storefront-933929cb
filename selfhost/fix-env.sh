#!/usr/bin/env bash
# VPS-এ .env আবার self-hosted Supabase (api.zoru.cc)-এ ফিরিয়ে আনে
# git pull করলে Lovable-এর cloud .env দিয়ে overwrite হয়ে যায় — এটা সেটা ঠিক করে।
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/zoru-cc}"
KEYS_FILE="${KEYS_FILE:-/opt/supabase/credentials.json}"
DOMAIN_API="${DOMAIN_API:-api.zoru.cc}"

command -v jq >/dev/null || { apt-get update -y && apt-get install -y jq; }

ANON_KEY=$(jq -r .ANON_KEY "$KEYS_FILE")
SERVICE_ROLE_KEY=$(jq -r .SERVICE_ROLE_KEY "$KEYS_FILE")
POSTGRES_PASSWORD=$(jq -r .POSTGRES_PASSWORD "$KEYS_FILE")

cat > "$APP_DIR/.env" <<APPENV
VITE_SUPABASE_URL=https://$DOMAIN_API
VITE_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
VITE_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_URL=https://$DOMAIN_API
SUPABASE_PUBLISHABLE_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
SUPABASE_DB_URL=postgresql://postgres:$POSTGRES_PASSWORD@127.0.0.1:5432/postgres
APPENV
chmod 600 "$APP_DIR/.env"

# ভবিষ্যতে git pull যেন .env আর overwrite না করে
cd "$APP_DIR"
git update-index --skip-worktree .env 2>/dev/null || true

echo "OK -> $(grep '^VITE_SUPABASE_URL' "$APP_DIR/.env")"
