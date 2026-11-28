#!/usr/bin/env sh
set -eu

TAG="4mica-be-egress"
CHAIN="DOCKER-USER"
CONTAINER="${EGRESS_CONTAINER:-4mica-be}"
HTTPS_PORTS="${EGRESS_HTTPS_PORTS:-443}"
ALLOW="${EGRESS_ALLOW:-}"
BLOCKED="0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 192.0.0.0/24 192.0.2.0/24 192.168.0.0/16 198.18.0.0/15 198.51.100.0/24 203.0.113.0/24 224.0.0.0/4 240.0.0.0/4"

usage() {
  echo "usage: $0 [--check | --remove | --print]" >&2
  echo "env:   EGRESS_CONTAINER (default 4mica-be)" >&2
  echo "       EGRESS_ALLOW='<cidr>:<port> ...' private destinations to allow" >&2
  echo "       EGRESS_HTTPS_PORTS='443 ...' public ports to allow" >&2
  exit 2
}

container_ips() {
  docker inspect -f \
    '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' \
    "$CONTAINER"
}

container_subnets() {
  for network in $(docker inspect -f \
    '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}} {{end}}' \
    "$CONTAINER"); do
    docker network inspect -f \
      '{{range .IPAM.Config}}{{.Subnet}} {{end}}' "$network"
  done
}

valid_allow() {
  printf '%s' "$1" |
    grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}(/[0-9]{1,2})?:[0-9]{1,5}$'
}

valid_port() {
  printf '%s' "$1" | grep -Eq '^[0-9]{1,5}$'
}

rule() {
  printf '%s -m comment --comment %s -j %s\n' "$1" "$TAG" "$2"
}

rules() {
  for ip in $(container_ips); do
    rule "-s $ip -m conntrack --ctstate ESTABLISHED,RELATED" RETURN
    for subnet in $(container_subnets); do
      case "$subnet" in
      *:*) ;;
      *) rule "-s $ip -d $subnet" RETURN ;;
      esac
    done
    for entry in $ALLOW; do
      rule "-s $ip -d ${entry%:*} -p tcp --dport ${entry##*:}" RETURN
    done
    for range in $BLOCKED; do
      rule "-s $ip -d $range" DROP
    done
    for port in $HTTPS_PORTS; do
      rule "-s $ip -p tcp --dport $port" RETURN
    done
    rule "-s $ip" DROP
  done
}

validate_env() {
  for entry in $ALLOW; do
    valid_allow "$entry" || usage
  done
  for port in $HTTPS_PORTS; do
    valid_port "$port" || usage
  done
}

ensure_chain() {
  if ! iptables -n -L "$CHAIN" >/dev/null 2>&1; then
    echo "$CHAIN does not exist. Start Docker first; it creates the chain." >&2
    exit 1
  fi
}

ensure_container() {
  if [ -z "$(container_ips | tr -d ' ')" ]; then
    echo "$CONTAINER is not running or has no IPv4 address." >&2
    exit 1
  fi
}

remove_rules() {
  iptables -S "$CHAIN" | grep -F -- "--comment $TAG" |
    sed 's/^-A /-D /' |
    while read -r spec; do
      eval "iptables $spec"
    done
}

apply_rules() {
  remove_rules
  rules | tac | while read -r spec; do
    eval "iptables -I $CHAIN 1 $spec"
  done
}

check_rules() {
  expected=$(rules | grep -c .)
  actual=$(iptables -S "$CHAIN" | grep -cF -- "--comment $TAG" || true)
  missing=$(rules | while read -r spec; do
    eval "iptables -C $CHAIN $spec" 2>/dev/null || echo "  $spec"
  done)
  if [ -z "$missing" ] && [ "$expected" -eq "$actual" ]; then
    echo "ok: $CONTAINER egress is restricted ($expected rules)"
    return 0
  fi
  echo "drift: expected $expected $TAG rules, found $actual" >&2
  [ -z "$missing" ] || printf 'missing:\n%s\n' "$missing" >&2
  return 1
}

validate_env

case "${1:-}" in
"")
  ensure_chain
  ensure_container
  apply_rules
  check_rules
  ;;
--check)
  ensure_chain
  ensure_container
  check_rules
  ;;
--print)
  ensure_container
  rules
  ;;
--remove)
  ensure_chain
  remove_rules
  echo "removed $TAG rules from $CHAIN"
  ;;
*)
  usage
  ;;
esac
