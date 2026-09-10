#!/usr/bin/env bash
# প্রতিটি সার্ভিসের key আলাদা ফাইলে রাখে — PLISIO আর CHECKERCCV দুইটা আলাদা জিনিস।
#
#   /etc/zoru/plisio.env      -> PLISIO_API_KEY
#   /etc/zoru/checkerccv.env  -> CHECKERCCV_API_KEY, CHECKERCCV_TOKEN
#
# ব্যবহার:
#   bash selfhost/set-secrets.sh plisio PLISIO_API_KEY=xxxx
#   bash selfhost/set-secrets.sh checkerccv CHECKERCCV_API_KEY=CheckerCCV-xxx CHECKERCCV_TOKEN=yyy
#   bash selfhost/set-secrets.sh list
set -euo pipefail

SECRET_DIR="${SECRET_DIR:-/etc/zoru}"
mkdir -p "$SECRET_DIR"
chmod 700 "$SECRET_DIR"

service="${1:-list}"
shift || true

case "$service" in
  plisio) FILE="$SECRET_DIR/plisio.env"; PREFIX="PLISIO_" ;;
  checkerccv) FILE="$SECRET_DIR/checkerccv.env"; PREFIX="CHECKERCCV_" ;;
  smtp) FILE="$SECRET_DIR/smtp.env"; PREFIX="SMTP_" ;;
  telegram) FILE="$SECRET_DIR/telegram.env"; PREFIX="TELEGRAM_" ;;
  list)
    for f in "$SECRET_DIR"/*.env; do
      [ -e "$f" ] || continue
      echo "== $f"
      sed -E 's/=(.{0,4}).*/=\1********/' "$f"
    done
    exit 0
    ;;
  *) echo "usage: set-secrets.sh {plisio|checkerccv|smtp|telegram|list} KEY=VALUE..." >&2; exit 1 ;;
esac

touch "$FILE"
chmod 600 "$FILE"

for kv in "$@"; do
  key="${kv%%=*}"; val="${kv#*=}"
  case "$key" in
    "$PREFIX"*) : ;;
    *) echo "skip $key (must start with $PREFIX)" >&2; continue ;;
  esac
  tmp=$(mktemp)
  grep -v "^$key=" "$FILE" > "$tmp" || true
  # These files are sourced by Bash. %q prevents spaces, #, $, backticks, or
  # other shell characters in a provider key from changing its value.
  printf '%s=%q\n' "$key" "$val" >> "$tmp"
  mv "$tmp" "$FILE"
  chmod 600 "$FILE"
  echo "saved $key -> $FILE"
done

echo "--- $FILE"
sed -E 's/=(.{0,4}).*/=\1********/' "$FILE"
