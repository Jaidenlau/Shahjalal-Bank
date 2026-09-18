#!/usr/bin/env bash
# Start the demo the way it should be run on the day: production mode, so no
# page pauses to compile the first time it is opened.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f /tmp/vertex-demo.pid ] && kill -0 "$(cat /tmp/vertex-demo.pid)" 2>/dev/null; then
  echo "already running: $(cat /tmp/vertex-demo.pid)"; exit 0
fi
nohup npx next start -p 3000 > /tmp/demo.log 2>&1 &
echo $! > /tmp/vertex-demo.pid
for _ in $(seq 1 40); do
  if curl -fsS -o /dev/null http://localhost:3000/login 2>/dev/null; then
    echo "ready pid=$(cat /tmp/vertex-demo.pid)"; exit 0
  fi
  sleep 1
done
echo "did not become ready"; tail -20 /tmp/demo.log; exit 1
