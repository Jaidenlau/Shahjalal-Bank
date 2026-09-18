#!/usr/bin/env bash
#
# Everything, in the right order, managing the server itself.
#
# Building replaces .next underneath a running server, so the order matters:
# typecheck, build, THEN start, then run everything that needs a live app.
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
run() {
  local label="$1"; shift
  printf '\n\033[1m── %s\033[0m\n' "$label"
  if "$@"; then :; else fail=1; printf '\033[31m   %s FAILED\033[0m\n' "$label"; fi
}

printf '\n\033[1mVertex ERP — full check\033[0m\n'

run "typecheck"            npx tsc --noEmit -p tsconfig.typecheck.json
run "production build"     npx next build

# Restart against the build we just made.
./scripts/server-stop.sh 3000 || { echo "could not free port 3000"; exit 1; }
./scripts/demo-start.sh || { echo "server did not start"; exit 1; }

run "reset demo data"      npm run --silent reset
run "warm routes"          node scripts/warm.mjs
run "control assertions"   npx tsx scripts/verify-controls.ts
run "navigation sweep"     node scripts/click-every-link.mjs
run "full demo thread"     node scripts/full-thread.mjs
run "offline"              node scripts/offline-check.mjs
run "projector"            node scripts/projector-check.mjs

# Leave the demo in its start state, not whatever the thread test left behind.
npm run --silent reset >/dev/null

if [ "$fail" -eq 0 ]; then
  printf '\n\033[32m✓ everything passed — demo data reset to its start state\033[0m\n\n'
else
  printf '\n\033[31m✗ something failed, see above\033[0m\n\n'
fi
exit "$fail"
