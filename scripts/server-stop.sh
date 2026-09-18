#!/usr/bin/env bash
#
# Stop whatever is serving on port 3000.
#
# Tracking a pid is not enough: a build that replaces .next leaves the old
# server running and serving 500s, and a stale pid file means the usual stop
# does nothing. Freeing the port is the thing that actually matters, so find the
# listener and kill it however this machine allows.
set -uo pipefail
PORT="${1:-3000}"

killed=""
for f in /tmp/vertex-demo.pid /tmp/vertex-dev.pid; do
  if [ -f "$f" ]; then
    PID="$(cat "$f" 2>/dev/null || true)"
    if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
      pkill -P "$PID" 2>/dev/null || true
      kill "$PID" 2>/dev/null || true
      killed="$killed $PID"
    fi
    rm -f "$f"
  fi
done

sleep 1

# Whatever still holds the port, by whichever tool exists here.
if command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
elif command -v lsof >/dev/null 2>&1; then
  lsof -ti ":${PORT}" 2>/dev/null | xargs -r kill -9 2>/dev/null || true
else
  # No port tool: fall back to matching the server process, never the shell.
  pgrep -f "next-server|next start|next dev" 2>/dev/null | xargs -r kill 2>/dev/null || true
fi

for _ in $(seq 1 15); do
  if ! curl -fsS -o /dev/null "http://localhost:${PORT}/login" 2>/dev/null; then
    echo "port ${PORT} free${killed:+ (stopped$killed)}"; exit 0
  fi
  sleep 1
done
echo "port ${PORT} still answering"; exit 1
