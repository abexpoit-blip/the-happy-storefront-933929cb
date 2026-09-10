#!/usr/bin/env bash
# VPS-এ .env আবার self-hosted Supabase (api.zoru.cc)-এ ফিরিয়ে আনে।
# git pull করলে Lovable-এর cloud .env দিয়ে overwrite হয়ে যায় — এটা সেটা ঠিক করে।
#
# গুরুত্বপূর্ণ: এখন থেকে app secret গুলো .env-এ নয়, আলাদা ফাইলে থাকে:
#   /etc/zoru/plisio.env      -> PLISIO_API_KEY
#   /etc/zoru/checkerccv.env  -> CHECKERCCV_API_KEY, CHECKERCCV_TOKEN
#   /etc/zoru/smtp.env, /etc/zoru/telegram.env
# পুরনো .env-এ ওই key থাকলে এখানে অটো migrate হয়ে যাবে।
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/zoru-cc}"
KEYS_FILE="${KEYS_FILE:-/opt/supabase/credentials.json}"
DOMAIN_API="${DOMAIN_API:-api.zoru.cc}"
SECRET_DIR="${SECRET_DIR:-/etc/zoru}"

command -v jq >/dev/null || { apt-get update -y && apt-get install -y jq; }

ANON_KEY=$(jq -r .ANON_KEY "$KEYS_FILE")
SERVICE_ROLE_KEY=$(jq -r .SERVICE_ROLE_KEY "$KEYS_FILE")
POSTGRES_PASSWORD=$(jq -r .POSTGRES_PASSWORD "$KEYS_FILE")

mkdir -p "$SECRET_DIR"; chmod 700 "$SECRET_DIR"

migrate() { # $1 = prefix, $2 = target file
  local prefix="$1" file="$2" lines
  [ -f "$APP_DIR/.env" ] || return 0
  lines=$(grep -E "^${prefix}[A-Z0-9_]+=" "$APP_DIR/.env" || true)
  [ -n "$lines" ] || return 0
  touch "$file"; chmod 600 "$file"
  while IFS= read -r kv; do
    [ -n "$kv" ] || continue
    local key="${kv%%=*}" tmp
    grep -q "^$key=" "$file" && continue
    tmp=$(mktemp); cat "$file" > "$tmp"; printf '%s\n' "$kv" >> "$tmp"
    mv "$tmp" "$file"; chmod 600 "$file"
    echo "migrated $key -> $file"
  done <<< "$lines"
}

[ -f "$APP_DIR/.env" ] && cp "$APP_DIR/.env" "$APP_DIR/.env.bak"
migrate PLISIO_ "$SECRET_DIR/plisio.env"
migrate CHECKERCCV_ "$SECRET_DIR/checkerccv.env"
migrate SMTP_ "$SECRET_DIR/smtp.env"
migrate TELEGRAM_ "$SECRET_DIR/telegram.env"

# .env-এ শুধু Supabase / self-host config থাকবে
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

cd "$APP_DIR"
git update-index --skip-worktree .env 2>/dev/null || true

echo "OK -> $(grep '^VITE_SUPABASE_URL' "$APP_DIR/.env")"
check() { # $1 = var, $2 = file
  if [ -f "$2" ] && grep -q "^$1=" "$2"; then echo "OK   -> $1 in $2";
  else echo "WARN -> $1 MISSING (set: bash selfhost/set-secrets.sh ${3} $1=VALUE)"; fi
}
check PLISIO_API_KEY "$SECRET_DIR/plisio.env" plisio
check CHECKERCCV_API_KEY "$SECRET_DIR/checkerccv.env" checkerccv
check CHECKERCCV_TOKEN "$SECRET_DIR/checkerccv.env" checkerccv
