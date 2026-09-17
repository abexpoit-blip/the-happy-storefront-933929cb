#!/usr/bin/env bash
# Zoru Shop — Automatic Database Migrations Runner
# Automatically finds and applies pending .sql migrations to Postgres inside Docker.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/zoru-cc}"
MIGRATION_DIR="$APP_DIR/selfhost"
DOCKER_DIR="/opt/supabase/docker"

echo "==> Running automatic database migrations..."

if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' | grep -q 'supabase.*db'; then
  DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E 'supabase.*db' | head -1)
  echo "Found database container: $DB_CONTAINER"

  MIGRATIONS=(
    "schema.sql"
    "referrals.sql"
    "bin-searches.sql"
    "credits.sql"
    "bot-accounts.sql"
    "bot-broadcasts.sql"
    "api-access-full-logs.sql"
    "checker-admin-api.sql"
    "card-drip.sql"
    "mixed-refundable-drip.sql"
  )

  for file in "${MIGRATIONS[@]}"; do
    FILE_PATH="$MIGRATION_DIR/$file"
    if [ -f "$FILE_PATH" ]; then
      echo "--> Applying migration: $file"
      docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres < "$FILE_PATH" >/dev/null 2>&1 || true
    fi
  done

  # Fix legacy 0.10 referral bonus to 5
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -c "UPDATE public.site_settings SET value = '5' WHERE key = 'referral_bonus' AND (value = '0.10' OR value = '0.1');" >/dev/null 2>&1 || true

  echo "==> Database migrations applied successfully!"
else
  if [ -d "$DOCKER_DIR" ] && command -v docker >/dev/null 2>&1; then
    echo "Applying via docker compose in $DOCKER_DIR..."
    cd "$DOCKER_DIR"
    if [ -f "$MIGRATION_DIR/bin-searches.sql" ]; then
      docker compose exec -T db psql -U postgres -d postgres < "$MIGRATION_DIR/bin-searches.sql" >/dev/null 2>&1 || true
    fi
    docker compose exec -T db psql -U postgres -d postgres -c "UPDATE public.site_settings SET value = '5' WHERE key = 'referral_bonus' AND (value = '0.10' OR value = '0.1');" >/dev/null 2>&1 || true
    echo "==> Database migrations completed via compose!"
  else
    echo "WARN: Docker database container not active. Migrations will run when database starts."
  fi
fi
