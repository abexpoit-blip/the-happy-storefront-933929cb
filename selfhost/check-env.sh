#!/usr/bin/env bash
# Guard: production must never point at hosted supabase.co.
# Usage: bash selfhost/check-env.sh [/var/www/zoru-cc/.env]
set -euo pipefail
ENV_FILE="${1:-/var/www/zoru-cc/.env}"

if [ ! -f "$ENV_FILE" ]; then
  echo "FAIL: $ENV_FILE not found" >&2
  exit 1
fi

if grep -Eq '^(VITE_)?SUPABASE_URL=.*supabase\.co' "$ENV_FILE"; then
  echo "FAIL: $ENV_FILE points at hosted supabase.co — run: bash selfhost/fix-env.sh" >&2
  grep -E '^(VITE_)?SUPABASE_URL=' "$ENV_FILE" >&2
  exit 1
fi

echo "OK -> self-hosted backend: $(grep -E '^VITE_SUPABASE_URL=' "$ENV_FILE" || echo 'VITE_SUPABASE_URL missing')"
