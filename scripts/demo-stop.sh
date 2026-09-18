#!/usr/bin/env bash
set -uo pipefail
if [ -f /tmp/vertex-demo.pid ]; then
  PID="$(cat /tmp/vertex-demo.pid)"
  pkill -P "$PID" 2>/dev/null || true
  kill "$PID" 2>/dev/null || true
  rm -f /tmp/vertex-demo.pid
  echo "stopped $PID"
else
  echo "not running"
fi
