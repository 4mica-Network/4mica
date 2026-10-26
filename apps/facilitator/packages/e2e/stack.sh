#!/usr/bin/env bash
#
# The stack the x402 packages' end-to-end tests run against, and the runner for
# those tests. Shared by `typescript/x402` and `python/x402`: both read the env
# file this writes, so neither hardcodes an address, key or URL.
#
# Core and the facilitator come up through scripts/dev-stack.sh, which in turn
# delegates core to 4mica-core's `make dev-up`. On top of that this:
#
#   1. runs core with a low uncheckpointed-payment limit (E2E_MAX_UNCHECKPOINTED,
#      default 3), so a test reaches CHECKPOINT_REQUIRED in a handful of
#      payments rather than core's default 64. A core-service this script did
#      not start with that limit is restarted; the chain is left alone.
#   2. gives each package's payer native ETH collateral, once.
#   3. writes .dev/x402-e2e.env with what the tests read.
#
# Each package pays from its own anvil account, so the two suites never share a
# payer's uncheckpointed count and can run side by side.
#
# Usage:
#   apps/facilitator/packages/e2e/stack.sh up        # core, facilitator, payers, env file
#   apps/facilitator/packages/e2e/stack.sh test      # up, then both packages' e2e tests
#   apps/facilitator/packages/e2e/stack.sh test ts   # ...or one of them: ts | py
#   apps/facilitator/packages/e2e/stack.sh down      # stop the facilitator and core

set -euo pipefail

PACKAGES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$PACKAGES_DIR/../../.." && pwd)"
DEV_STACK="$REPO_ROOT/scripts/dev-stack.sh"
CORE_DIR="${FOURMICA_CORE_DIR:-$REPO_ROOT/../4mica-core}"

CORE_URL="http://127.0.0.1:${CORE_PORT:-3000}"
FACILITATOR_URL="http://127.0.0.1:${FACILITATOR_PORT:-8080}"
ANVIL_RPC="${ANVIL_RPC_URL:-http://127.0.0.1:8545}"
ENV_FILE="$REPO_ROOT/.dev/x402-e2e.env"
# "<core-service pid> <limit>" for the core-service this script last started.
CORE_MARK="$REPO_ROOT/.dev/x402-e2e.core"
CORE_PID_FILE="$CORE_DIR/.dev/core.pid"
MAX_UNCHECKPOINTED="${E2E_MAX_UNCHECKPOINTED:-3}"

# Payments are in native ETH: core accepts it as collateral, and anvil accounts
# hold plenty, so funding a payer is one deposit with nothing to mint.
NATIVE_ASSET=0x0000000000000000000000000000000000000000
COLLATERAL=1ether

# anvil accounts 2 (paid), 3 (TypeScript payer) and 4 (Python payer).
PAY_TO_KEY=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
TS_PAYER_KEY=0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6
PY_PAYER_KEY=0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m ✔\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "$1 not found in PATH"; }

core_pid() { cat "$CORE_PID_FILE" 2>/dev/null || true; }

# Core only reports its limit to an authenticated caller, so rather than ask,
# remember which core-service this script started and with what limit.
start_core() {
  if ! curl -fsS "$CORE_URL/core/health" >/dev/null 2>&1; then
    GUARANTEE_MAX_UNCHECKPOINTED="$MAX_UNCHECKPOINTED" "$DEV_STACK" core
  elif [ "$(cat "$CORE_MARK" 2>/dev/null || true)" != "$(core_pid) $MAX_UNCHECKPOINTED" ]; then
    log "Restarting core-service with ${MAX_UNCHECKPOINTED} uncheckpointed payments allowed…"
    "$CORE_DIR/deployment/dev_stack.sh" core-stop
    GUARANTEE_MAX_UNCHECKPOINTED="$MAX_UNCHECKPOINTED" "$CORE_DIR/deployment/dev_stack.sh" core-start
  fi
  mkdir -p "$(dirname "$CORE_MARK")"
  echo "$(core_pid) $MAX_UNCHECKPOINTED" >"$CORE_MARK"
  ok "core allows ${MAX_UNCHECKPOINTED} uncheckpointed payments"
}

# The Treasury core settles against, read from core's generated .env.
treasury_address() {
  sed -n 's/^ETHEREUM_CONTRACT_ADDRESS="\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' "$CORE_DIR/.env"
}

fund_payer() {
  local key="$1" treasury payer assets
  treasury="$(treasury_address)"
  [ -n "$treasury" ] || die "no ETHEREUM_CONTRACT_ADDRESS in $CORE_DIR/.env"
  payer="$(cast wallet address --private-key "$key")"

  assets="$(cast call "$treasury" "getUserAllAssets(address)((address,uint256,uint256,uint256)[])" \
    "$payer" --rpc-url "$ANVIL_RPC")"
  if printf '%s' "$assets" | grep -q "($NATIVE_ASSET, [1-9]"; then
    ok "$payer already holds ETH collateral"
    return
  fi

  log "Depositing ${COLLATERAL} of collateral for ${payer}…"
  cast send "$treasury" "deposit()" --value "$COLLATERAL" \
    --private-key "$key" --rpc-url "$ANVIL_RPC" >/dev/null
  # Core counts a deposit once it is past confirmation depth, and anvil only
  # mines on demand; its scanner then needs a poll to pick the deposit up.
  cast rpc anvil_mine 5 --rpc-url "$ANVIL_RPC" >/dev/null
  sleep 3
  ok "$payer funded"
}

write_env() {
  local chain_id
  chain_id="$(curl -fsS "$CORE_URL/core/public-params" \
    | sed -n 's/.*"chain_id"[: ]*\([0-9]*\).*/\1/p' | head -1)"
  [ -n "$chain_id" ] || die "could not read core's chain id from $CORE_URL/core/public-params"

  mkdir -p "$(dirname "$ENV_FILE")"
  cat >"$ENV_FILE" <<EOF
# Generated by apps/facilitator/packages/e2e/stack.sh — do not hand-edit.
E2E_CORE_URL=$CORE_URL
E2E_FACILITATOR_URL=$FACILITATOR_URL
E2E_NETWORK=eip155:$chain_id
E2E_ASSET=$NATIVE_ASSET
E2E_PAY_TO=$(cast wallet address --private-key "$PAY_TO_KEY")
E2E_MAX_UNCHECKPOINTED=$MAX_UNCHECKPOINTED
E2E_TS_PAYER_KEY=$TS_PAYER_KEY
E2E_PY_PAYER_KEY=$PY_PAYER_KEY
EOF
  ok "wrote $ENV_FILE"
}

cmd_up() {
  need cast
  need curl
  start_core
  "$DEV_STACK" facilitator
  fund_payer "$TS_PAYER_KEY"
  fund_payer "$PY_PAYER_KEY"
  write_env
}

test_ts() {
  log "TypeScript e2e…"
  (
    cd "$REPO_ROOT"
    pnpm turbo run build --filter=@4mica/x402 --output-logs=errors-only
    pnpm --filter @4mica/x402 test:e2e
  )
}

test_py() {
  need uv
  log "Python e2e…"
  (
    cd "$PACKAGES_DIR/python/x402"
    # A venv rather than `uv run`, which would write a uv.lock the package does not keep.
    [ -x .venv/bin/python ] || uv venv -q --python 3.12
    uv pip install -q -e "$REPO_ROOT/packages/sdk-python" -e ".[all,dev]"
    .venv/bin/python -m pytest e2e
  )
}

cmd_test() {
  cmd_up
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  case "${1:-all}" in
    ts) test_ts ;;
    py) test_py ;;
    all) test_ts; test_py ;;
    *) die "unknown suite: $1 (use ts | py)" ;;
  esac
}

case "${1:-up}" in
  up)   cmd_up ;;
  test) shift; cmd_test "${1:-all}" ;;
  env)  write_env ;;
  down) "$DEV_STACK" down ;;
  *) die "unknown command: $1 (use up | test [ts|py] | env | down)" ;;
esac
