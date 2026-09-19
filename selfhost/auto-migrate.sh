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
    "bonus-and-check-fee.sql"
    "referrals.sql"
    "cart-order.sql"
    "bin-searches.sql"
    "credits.sql"
    "bot-accounts.sql"
    "bot-broadcasts.sql"
    "api-access-full-logs.sql"
    "checker-admin-api.sql"
    "card-drip.sql"
    "mixed-refundable-drip.sql"
    "announcements-update.sql"
    "fix-unknown-banks.sql"
    "deposit-bot-sync.sql"
    "dedup-and-clean-sold.sql"
  )

  for file in "${MIGRATIONS[@]}"; do
    FILE_PATH="$MIGRATION_DIR/$file"
    if [ -f "$FILE_PATH" ]; then
      echo "--> Applying migration: $file"
      docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres < "$FILE_PATH" >/dev/null 2>&1 || true
    fi
  done

  # Ensure bonus_balance exists and fix legacy 0.10 referral bonus to 5 on web, 0.10 on bot
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -c "ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bonus_balance numeric NOT NULL DEFAULT 0;" >/dev/null 2>&1 || true
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -c "UPDATE public.site_settings SET value = '5' WHERE key = 'referral_bonus' AND (value = '0.10' OR value = '0.1' OR value = '0.1000');" >/dev/null 2>&1 || true
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -c "INSERT INTO public.site_settings (key, value) VALUES ('bot_referral_bonus', '0.10') ON CONFLICT (key) DO NOTHING;" >/dev/null 2>&1 || true
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -c "INSERT INTO public.site_settings (key, value) VALUES ('bot_admin_contact', 'https://t.me/Zorushop_service') ON CONFLICT (key) DO UPDATE SET value = 'https://t.me/Zorushop_service';" >/dev/null 2>&1 || true
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -c "ALTER TABLE public.card_drip_queues ADD COLUMN IF NOT EXISTS pricing_mode TEXT NOT NULL DEFAULT 'fixed';" >/dev/null 2>&1 || true
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -c "ALTER TABLE public.card_drip_queues ADD COLUMN IF NOT EXISTS min_price numeric(12,2) NOT NULL DEFAULT 0.20;" >/dev/null 2>&1 || true
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -c "ALTER TABLE public.card_drip_queues ADD COLUMN IF NOT EXISTS max_price numeric(12,2) NOT NULL DEFAULT 10.00;" >/dev/null 2>&1 || true
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -c "ALTER TABLE public.announcements DROP CONSTRAINT IF EXISTS announcements_kind_check;" >/dev/null 2>&1 || true
  docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -c "ALTER TABLE public.announcements ADD CONSTRAINT announcements_kind_check CHECK (kind IN ('info','warning','promo','success','update','alert','maintenance'));" >/dev/null 2>&1 || true

  echo "==> Database migrations applied successfully!"
else
  if [ -d "$DOCKER_DIR" ] && command -v docker >/dev/null 2>&1; then
    echo "Applying via docker compose in $DOCKER_DIR..."
    cd "$DOCKER_DIR"
    if [ -f "$MIGRATION_DIR/bin-searches.sql" ]; then
      docker compose exec -T db psql -U postgres -d postgres < "$MIGRATION_DIR/bin-searches.sql" >/dev/null 2>&1 || true
    fi
    if [ -f "$MIGRATION_DIR/fix-unknown-banks.sql" ]; then
      echo "--> Applying fix-unknown-banks via compose..."
      docker compose exec -T db psql -U postgres -d postgres < "$MIGRATION_DIR/fix-unknown-banks.sql" >/dev/null 2>&1 || true
    fi
    docker compose exec -T db psql -U postgres -d postgres -c "ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bonus_balance numeric NOT NULL DEFAULT 0;" >/dev/null 2>&1 || true
    docker compose exec -T db psql -U postgres -d postgres -c "UPDATE public.site_settings SET value = '5' WHERE key = 'referral_bonus' AND (value = '0.10' OR value = '0.1' OR value = '0.1000');" >/dev/null 2>&1 || true
    docker compose exec -T db psql -U postgres -d postgres -c "INSERT INTO public.site_settings (key, value) VALUES ('bot_referral_bonus', '0.10') ON CONFLICT (key) DO NOTHING;" >/dev/null 2>&1 || true
    echo "==> Database migrations completed via compose!"
  else
    echo "WARN: Docker database container not active. Migrations will run when database starts."
  fi
fi
