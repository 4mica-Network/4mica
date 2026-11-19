#!/usr/bin/env sh
set -eu

bind="${1:-}"

if ! printf '%s' "$bind" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}$'; then
  echo "::error::PLAYGROUND_BIND='$bind' is not an IPv4 address. Set it to this box's private-network address."
  exit 1
fi

case "$bind" in
127.0.0.1)
  echo "::warning::PLAYGROUND_BIND is 127.0.0.1, so the edge on Box A cannot reach this playground."
  ;;
10.* | 192.168.* | 172.1[6-9].* | 172.2[0-9].* | 172.3[01].*)
  if command -v ip >/dev/null 2>&1 &&
    ! ip -4 -o addr show | grep -q " inet $bind/"; then
    echo "::error::PLAYGROUND_BIND=$bind is not assigned to any interface on this box."
    exit 1
  fi
  echo "PLAYGROUND_BIND=$bind is a private address on this box."
  ;;
*)
  echo "::error::PLAYGROUND_BIND=$bind is not a private address (10/8, 172.16/12, 192.168/16). Refusing to publish the playground on it."
  exit 1
  ;;
esac
