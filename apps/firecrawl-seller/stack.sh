#!/usr/bin/env bash
#
# The Firecrawl seller on a local stack: everything but Firecrawl itself.
#
# Core and the facilitator come up through scripts/dev-stack.sh. On top of
# that this:
#
#   1. starts Valkey (container 4mica-valkey) and gives the proxy its own
#      database in core's postgres (4mica-pg)
#   2. runs the proxy on :8090 (the facilitator has :8080), with one seller
#      token and one Firecrawl account and credential
#   3. gives the buyer and the seller USDC collateral, once
#   4. runs the seller on :3020
#
# Usage:
#   FIRECRAWL_API_KEY=fc-... apps/firecrawl-seller/stack.sh up
#   FUND_SELLER=0 SELLER_KEY=0x... ...stack.sh up   # a seller with no deposit
#   apps/firecrawl-seller/stack.sh buyer    # scrape, crawl, poll until the refund
#   apps/firecrawl-seller/stack.sh logs     # tail the proxy and the seller
#   apps/firecrawl-seller/stack.sh down     # stop the proxy, the seller and Valkey

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$APP_DIR/../.." && pwd)"
DEV_STACK="$REPO_ROOT/scripts/dev-stack.sh"
CORE_DIR="${FOURMICA_CORE_DIR:-$REPO_ROOT/../4mica-core}"
DEV_DIR="$REPO_ROOT/.dev"
ENV_FILE="$DEV_DIR/firecrawl-stack.env"

CORE_URL="http://127.0.0.1:${CORE_PORT:-3000}"
FACILITATOR_URL="http://127.0.0.1:${FACILITATOR_PORT:-8080}"
PROXY_PORT="${PROXY_PORT:-8090}"
SELLER_PORT="${SELLER_PORT:-3020}"
ANVIL_RPC="${ANVIL_RPC_URL:-http://127.0.0.1:8545}"
DATABASE_URL="postgres://postgres:${POSTGRES_PASSWORD:-qwerty123456}@localhost:5432/proxy"
COLLATERAL=100000000 # 100 USDC

# anvil accounts 7 (buyer) and 8 (seller); 2-4 are the x402 e2e's, 10-11 core's.
BUYER_KEY=0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356
SELLER_KEY="${SELLER_KEY:-0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97}"
# 0 leaves the seller without collateral, so its refunds can only be backed by what buyers paid it.
FUND_SELLER="${FUND_SELLER:-1}"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m ✔\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "$1 not found in PATH"; }
pid_alive() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null; }
psql_proxy() { docker exec -i 4mica-pg psql -U postgres -d proxy -v ON_ERROR_STOP=1 -q "$@"; }

wait_for() {
  local name="$1" url="$2" pid_file="$3" log_file="$4"
  for _ in $(seq 1 60); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      ok "$name ready"
      return
    fi
    if ! pid_alive "$pid_file"; then
      tail -n 30 "$log_file" >&2
      die "$name exited during startup (see $log_file)"
    fi
    sleep 1
  done
  die "$name did not become ready (see $log_file)"
}

start_core() {
  if curl -fsS "$CORE_URL/core/health" >/dev/null 2>&1; then
    ok "core already running"
  else
    "$DEV_STACK" core
  fi
  "$DEV_STACK" facilitator
}

start_storage() {
  if ! docker start 4mica-valkey >/dev/null 2>&1; then
    log "Starting Valkey…"
    docker run -d --name 4mica-valkey -p 6379:6379 valkey/valkey:8-alpine >/dev/null
  fi
  ok "Valkey on :6379"
  if ! docker exec 4mica-pg psql -U postgres -tAc \
    "select 1 from pg_database where datname = 'proxy'" | grep -q 1; then
    docker exec 4mica-pg psql -U postgres -qc "create database proxy"
  fi
  ok "proxy database in 4mica-pg"
}

start_proxy() {
  local pid_file="$DEV_DIR/proxy.pid" log_file="$DEV_DIR/proxy.log"
  if pid_alive "$pid_file"; then
    ok "proxy already running (pid $(cat "$pid_file"))"
    return
  fi
  log "Building the proxy…"
  (cd "$REPO_ROOT" && cargo build -q -p proxy-4mica)
  HOST=127.0.0.1 PORT="$PROXY_PORT" DATABASE_URL="$DATABASE_URL" \
    VALKEY_URL=redis://127.0.0.1:6379 FIRECRAWL_KEY_1="$FIRECRAWL_API_KEY" \
    nohup "$REPO_ROOT/target/debug/proxy-4mica" >"$log_file" 2>&1 &
  echo $! >"$pid_file"
  wait_for proxy "http://127.0.0.1:$PROXY_PORT/health" "$pid_file" "$log_file"
}

# After the proxy has started, which runs its migrations.
seed_proxy() {
  local hash
  hash="$(printf %s "$PROXY_TOKEN" | shasum -a 256 | cut -d' ' -f1)"
  psql_proxy <<SQL
insert into sellers (name, token_hash) values ('firecrawl-seller', '$hash')
  on conflict (name) do update set token_hash = excluded.token_hash, enabled = true;
insert into accounts (provider, name, limits) values ('firecrawl', 'free', '{
  "rates": {
    "scrape": {"max": 10, "per_secs": 60}, "map": {"max": 10, "per_secs": 60},
    "search": {"max": 5, "per_secs": 60}, "crawl": {"max": 1, "per_secs": 60},
    "crawl_status": {"max": 1500, "per_secs": 60}
  },
  "concurrency": {"browser": 2},
  "monthly_quota": 500
}') on conflict (provider, name) do nothing;
insert into credentials (account_id, key_env)
  select id, 'FIRECRAWL_KEY_1' from accounts
  where provider = 'firecrawl' and name = 'free'
    and not exists (select 1 from credentials where key_env = 'FIRECRAWL_KEY_1');
SQL
  ok "proxy seeded: seller firecrawl-seller, Firecrawl free plan"
}

fund() {
  local key="$1" treasury="$2" usdc="$3" address
  address="$(cast wallet address --private-key "$key")"
  if cast call "$treasury" "getUserAllAssets(address)((address,uint256,uint256,uint256)[])" \
    "$address" --rpc-url "$ANVIL_RPC" | grep -qi "($usdc, [1-9]"; then
    ok "$address already holds USDC collateral"
    return
  fi
  log "Depositing 100 USDC of collateral for ${address}…"
  cast send "$usdc" "mint(address,uint256)" "$address" "$COLLATERAL" \
    --private-key "$key" --rpc-url "$ANVIL_RPC" >/dev/null
  cast send "$usdc" "approve(address,uint256)" "$treasury" "$COLLATERAL" \
    --private-key "$key" --rpc-url "$ANVIL_RPC" >/dev/null
  cast send "$treasury" "depositStablecoin(address,uint256)" "$usdc" "$COLLATERAL" \
    --private-key "$key" --rpc-url "$ANVIL_RPC" >/dev/null
  ok "$address funded"
}

fund_wallets() {
  local treasury usdc
  treasury="$(sed -n 's/^ETHEREUM_CONTRACT_ADDRESS="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' "$CORE_DIR/.env")"
  [ -n "$treasury" ] || die "no ETHEREUM_CONTRACT_ADDRESS in $CORE_DIR/.env"
  usdc="$(curl -fsS "$CORE_URL/core/tokens" | jq -r '.tokens[] | select(.symbol == "USDC") | .address')"
  [ -n "$usdc" ] || die "core lists no USDC"
  fund "$BUYER_KEY" "$treasury" "$usdc"
  [ "$FUND_SELLER" = 0 ] || fund "$SELLER_KEY" "$treasury" "$usdc"
  # Core counts a deposit once it is past confirmation depth, and anvil only mines on demand.
  cast rpc anvil_mine 5 --rpc-url "$ANVIL_RPC" >/dev/null
}

start_seller() {
  local pid_file="$DEV_DIR/firecrawl-seller.pid" log_file="$DEV_DIR/firecrawl-seller.log"
  if pid_alive "$pid_file"; then
    ok "seller already running (pid $(cat "$pid_file"))"
    return
  fi
  (
    cd "$APP_DIR"
    PORT="$SELLER_PORT" SELLER_PRIVATE_KEY="$SELLER_KEY" PROXY_TOKEN="$PROXY_TOKEN" \
      PROXY_URL="http://127.0.0.1:$PROXY_PORT" FACILITATOR_URL="$FACILITATOR_URL" \
      CORE_URL="$CORE_URL" nohup node_modules/.bin/tsx src/index.ts >"$log_file" 2>&1 &
    echo $! >"$pid_file"
  )
  wait_for seller "http://127.0.0.1:$SELLER_PORT/health" "$pid_file" "$log_file"
}

stop() {
  local pid_file="$DEV_DIR/$1.pid"
  if pid_alive "$pid_file"; then
    log "Stopping $1…"
    kill "$(cat "$pid_file")"
  fi
  rm -f "$pid_file"
}

cmd_up() {
  need cargo
  need cast
  need curl
  need docker
  need jq
  [ -n "${FIRECRAWL_API_KEY:-}" ] || die "set FIRECRAWL_API_KEY"
  mkdir -p "$DEV_DIR"
  # The seller's token with the proxy, kept so a rerun does not strand a running seller.
  [ -f "$ENV_FILE" ] || echo "PROXY_TOKEN=$(openssl rand -hex 24)" >"$ENV_FILE"
  # shellcheck disable=SC1090
  . "$ENV_FILE"

  start_core
  start_storage
  start_proxy
  seed_proxy
  fund_wallets
  start_seller
  echo
  ok "Seller on http://127.0.0.1:$SELLER_PORT/mcp. Try: $0 buyer"
}

cmd_buyer() {
  cd "$APP_DIR"
  BUYER_PRIVATE_KEY="$BUYER_KEY" CORE_URL="$CORE_URL" \
    SELLER_URL="http://127.0.0.1:$SELLER_PORT/mcp" node_modules/.bin/tsx src/buyer.ts
}

case "${1:-up}" in
  up)    cmd_up ;;
  buyer) cmd_buyer ;;
  logs)  tail -f "$DEV_DIR/proxy.log" "$DEV_DIR/firecrawl-seller.log" ;;
  down)
    stop firecrawl-seller
    stop proxy
    docker stop 4mica-valkey >/dev/null 2>&1 || true
    ok "stopped; core and the facilitator stay up (scripts/dev-stack.sh down)"
    ;;
  *) die "unknown command: $1 (use up | buyer | logs | down)" ;;
esac
