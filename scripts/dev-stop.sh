#!/usr/bin/env bash
set -uo pipefail
if [ -f /tmp/vertex-dev.pid ]; then
  PID="$(cat /tmp/vertex-dev.pid)"
  pkill -P "$PID" 2>/dev/null || true
  kill "$PID" 2>/dev/null || true
  rm -f /tmp/vertex-dev.pid
  echo "stopped $PID"
else
  echo "not running"
fi
