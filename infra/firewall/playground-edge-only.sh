#!/usr/bin/env sh
set -eu

TAG="4mica-playground-edge-only"
CHAIN="DOCKER-USER"

usage() {
  echo "usage: $0 <edge-ip> [port]" >&2
  echo "       $0 --check <edge-ip> [port]" >&2
  echo "       $0 --remove" >&2
  exit 2
}

valid_ipv4() {
  printf '%s' "$1" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}(/[0-9]{1,2})?$'
}

valid_port() {
  printf '%s' "$1" | grep -Eq '^[0-9]{1,5}$'
}

ensure_chain() {
  if ! iptables -n -L "$CHAIN" >/dev/null 2>&1; then
    echo "$CHAIN does not exist. Start Docker first; it creates the chain." >&2
    exit 1
  fi
}

remove_rules() {
  iptables -n -L "$CHAIN" --line-numbers |
    awk -v tag="$TAG" 'index($0, tag) { print $1 }' |
    sort -rn |
    while read -r line; do
      iptables -D "$CHAIN" "$line"
    done
}

apply_rules() {
  edge="$1"
  port="$2"

  remove_rules

  iptables -I "$CHAIN" 1 -p tcp -m conntrack --ctorigdstport "$port" \
    --ctdir ORIGINAL -m comment --comment "$TAG" -j DROP
  iptables -I "$CHAIN" 1 -p tcp -s "$edge" -m conntrack \
    --ctorigdstport "$port" --ctdir ORIGINAL -m comment --comment "$TAG" \
    -j RETURN
}

check_rules() {
  edge="$1"
  port="$2"
  rules=$(iptables -S "$CHAIN" | grep -F -- "--comment $TAG" || true)
  first=$(printf '%s\n' "$rules" | sed -n 1p)
  second=$(printf '%s\n' "$rules" | sed -n 2p)
  count=$(printf '%s' "$rules" | grep -c . || true)

  case "$edge" in
  */*) source="$edge" ;;
  *) source="$edge/32" ;;
  esac

  if [ "$count" -eq 2 ] &&
    printf '%s' "$first" | grep -Fq -- "-s $source " &&
    printf '%s' "$first" | grep -Fq -- "--ctorigdstport $port" &&
    printf '%s' "$first" | grep -Fq -- "-j RETURN" &&
    printf '%s' "$second" | grep -Fq -- "--ctorigdstport $port" &&
    printf '%s' "$second" | grep -Fq -- "-j DROP"; then
    echo "ok: port $port is reachable only from $edge"
    return 0
  fi

  echo "drift: expected port $port restricted to $edge; found:" >&2
  printf '%s\n' "${rules:-  (no rules)}" >&2
  return 1
}

[ "$#" -ge 1 ] || usage

case "$1" in
--check)
  [ "$#" -ge 2 ] || usage
  valid_ipv4 "$2" || usage
  port="${3:-8081}"
  valid_port "$port" || usage
  ensure_chain
  check_rules "$2" "$port"
  ;;
--remove)
  ensure_chain
  remove_rules
  echo "removed $TAG rules from $CHAIN"
  ;;
-*)
  usage
  ;;
*)
  valid_ipv4 "$1" || usage
  port="${2:-8081}"
  valid_port "$port" || usage
  ensure_chain
  apply_rules "$1" "$port"
  check_rules "$1" "$port"
  ;;
esac
