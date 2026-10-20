#!/usr/bin/env bash
set -euo pipefail

# Exercise deployment safeguards without touching a repository, network, or PM2.
SCRIPT="$(cd "$(dirname "$0")" && pwd)/deploy.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin" "$TMP/app/.git" "$TMP/app/selfhost"
printf '#!/usr/bin/env bash\nexit 0\n' > "$TMP/app/selfhost/pm2-start.sh"
cat > "$TMP/bin/git" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$CALLS"
case "$3" in
  status) if [ "${DIRTY:-0}" = 1 ]; then printf ' M source.ts\n'; fi ;;
  pull) exit "${PULL_EXIT:-0}" ;;
  *) exit 99 ;;
esac
MOCK
cat > "$TMP/bin/npm" <<'MOCK'
#!/usr/bin/env bash
printf 'npm %s\n' "$*" >> "$CALLS"
if [ "$1" = run ]; then exit "${BUILD_EXIT:-0}"; fi
MOCK
cat > "$TMP/bin/pm2" <<'MOCK'
#!/usr/bin/env bash
printf 'pm2 %s\n' "$*" >> "$CALLS"
MOCK
chmod +x "$TMP/bin/"*
export PATH="$TMP/bin:$PATH" APP_DIR="$TMP/app" CALLS="$TMP/calls"

: > "$CALLS"
if DIRTY=1 bash "$SCRIPT" > "$TMP/output" 2>&1; then
  echo 'FAIL: dirty worktree was accepted'; exit 1
fi
if grep -Eq 'pull|npm|pm2' "$CALLS"; then
  echo 'FAIL: dirty worktree reached deployment'; exit 1
fi
echo 'PASS: dirty worktree is refused without deployment'

: > "$CALLS"
if PULL_EXIT=1 bash "$SCRIPT" > "$TMP/output" 2>&1; then
  echo 'FAIL: failed pull was accepted'; exit 1
fi
grep -q 'pull --ff-only' "$CALLS"
if grep -Eq 'npm|pm2' "$CALLS"; then
  echo 'FAIL: failed pull reached deployment'; exit 1
fi
echo 'PASS: failed fast-forward stops deployment'

: > "$CALLS"
if BUILD_EXIT=1 bash "$SCRIPT" > "$TMP/output" 2>&1; then
  echo 'FAIL: failed build was accepted'; exit 1
fi
if grep -q 'pm2' "$CALLS"; then
  echo 'FAIL: failed build restarted services'; exit 1
fi
echo 'PASS: failed build stops before service restart'

: > "$CALLS"
bash "$SCRIPT" > "$TMP/output" 2>&1
grep -q 'npm run build' "$CALLS"
grep -q 'pm2 status' "$CALLS"
echo 'PASS: successful deployment reaches status checks'