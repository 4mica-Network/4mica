#!/usr/bin/env bash
set -euo pipefail

host="$(printf '%s' "${1:-}" | tr -d '[:space:]')"
port="${2:-8081}"

if [ -z "$host" ]; then
  echo "usage: $0 <public-host> [port]" >&2
  exit 2
fi

if ! command -v timeout >/dev/null 2>&1; then
  echo "::error::timeout is not installed, so the port probe cannot run." >&2
  exit 2
fi

if timeout 5 bash -c "exec 3<>/dev/tcp/$host/$port" 2>/dev/null; then
  echo "::error::Port $port on the application box accepts connections from the public internet. Check PLAYGROUND_BIND and run infra/firewall/playground-edge-only.sh on the box."
  exit 1
fi

echo "Port $port is not reachable from here."
