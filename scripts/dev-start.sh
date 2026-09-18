#!/usr/bin/env bash
# Start the dev server detached and record its PID, so it can be stopped
# without pkill patterns that also match the calling shell.
set -euo pipefail
cd "$(dirname "$0")/.."
./scripts/server-stop.sh 3000 >/dev/null 2>&1 || true
nohup npm run dev > /tmp/dev.log 2>&1 &
echo $! > /tmp/vertex-dev.pid
for _ in $(seq 1 40); do
  if curl -fsS -o /dev/null http://localhost:3000/login 2>/dev/null; then
    echo "ready pid=$(cat /tmp/vertex-dev.pid)"; exit 0
  fi
  sleep 1
done
echo "did not become ready"; tail -20 /tmp/dev.log; exit 1
