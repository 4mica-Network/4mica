#!/usr/bin/env bash
#
# The whole 4Mica stack, locally.
#
# This script owns only what 4mica-core does not. Core's own repo already has a
# careful bring-up (`make dev-up`: postgres, anvil, contracts, migrations, the
# facilitator's wallet role, core-service) that reads the chain id back off
# anvil and pre-checks the settlement solvency invariant. Re-deriving any of
# that here would only let the two drift, so this delegates and then adds:
#
#   1. the facilitator itself                                  (:8080)
#   2. 4Mica's own postgres, migrations and seed                (:5433)
#   3. the app env files, filled in from what core actually deployed
#
# Usage:
#   scripts/dev-stack.sh up       # everything
#   scripts/dev-stack.sh core     # just the core half (delegates to 4mica-core)
#   scripts/dev-stack.sh env      # regenerate app .env files from core's .env
#   scripts/dev-stack.sh down     # stop the facilitator and core
#   scripts/dev-stack.sh status   # what is running
#
# The Node apps are NOT started here — run them in their own terminals so you
# keep their logs and their reloaders:
#   pnpm --filter @4mica/be dev          # :4000
#   pnpm --filter @4mica/dashboard dev   # :4173
#   pnpm --filter @4mica/playground dev  # :3100

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Where the 4mica-core checkout lives. It must be on a revision whose crates
# match the workspace's `=2.0.0-alpha.4` pin in Cargo.toml, or /settle will
# fail on a protocol mismatch.
CORE_DIR="${FOURMICA_CORE_DIR:-$REPO_ROOT/../4mica-core}"

DEV_DIR="$REPO_ROOT/.dev"
FACILITATOR_LOG="$DEV_DIR/facilitator.log"
FACILITATOR_PID="$DEV_DIR/facilitator.pid"

CORE_PORT="${CORE_PORT:-3000}"
FACILITATOR_PORT="${FACILITATOR_PORT:-8080}"
CORE_URL="http://127.0.0.1:${CORE_PORT}"

# anvil account #11 — the wallet core's dev stack grants the facilitator role
# (`guarantee:issue`) and funds. It is both the facilitator's identity with core
# and the relayer that pays gas for the sponsored routes, as core prints it.
FACILITATOR_KEY="${X402_AUTH_WALLET_PRIVATE_KEY:-0x701b615bbdfb9de65240bc28bd21bbc0d996645a3dd57e7b12bc2bdf6f192c82}"
FACILITATOR_ADDRESS="${X402_AUTH_WALLET_ADDRESS:-0x71be63f3384f5fb98995898a86b02fb2426c5788}"
RELAYER_KEY="${X402_RELAYER_PRIVATE_KEY:-$FACILITATOR_KEY}"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m ✔\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m ! \033[0m%s\n' "$*"; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || die "$1 not found in PATH"; }
pid_alive() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null; }

require_core_dir() {
  [ -d "$CORE_DIR" ] || die "no 4mica-core checkout at $CORE_DIR
     Clone it beside this repo, or set FOURMICA_CORE_DIR."
  [ -f "$CORE_DIR/Makefile" ] || die "$CORE_DIR has no Makefile — is it on v2.0.0-alpha.5?
     git -C \"$CORE_DIR\" fetch --tags origin && git -C \"$CORE_DIR\" checkout v2.0.0-alpha.5"
}

# ---------------------------------------------------------------------------
# Core (delegated)
# ---------------------------------------------------------------------------
start_core() {
  require_core_dir
  need cargo
  need anvil
  need forge

  log "Starting 4mica-core (make dev-up in $CORE_DIR)…"
  make -C "$CORE_DIR" dev-up

  for _ in $(seq 1 60); do
    if curl -fsS "$CORE_URL/core/health" >/dev/null 2>&1; then
      ok "core ready ($CORE_URL)"
      return
    fi
    sleep 1
  done
  die "core did not become ready — check: make -C $CORE_DIR logs"
}

# ---------------------------------------------------------------------------
# Facilitator role (delegated)
# ---------------------------------------------------------------------------
# Core's `make dev-up` already seeds it; this is for a core brought up some
# other way, such as a forked chain.
grant_facilitator_role() {
  require_core_dir
  make -C "$CORE_DIR" roles
}

# ---------------------------------------------------------------------------
# Facilitator
# ---------------------------------------------------------------------------
start_facilitator() {
  need cargo

  if pid_alive "$FACILITATOR_PID"; then
    ok "facilitator already running (pid $(cat "$FACILITATOR_PID"))"
    return
  fi

  local chain_id
  chain_id="$(curl -fsS "$CORE_URL/core/public-params" \
    | sed -n 's/.*"chain_id"[: ]*\([0-9]*\).*/\1/p' | head -1)"
  chain_id="${chain_id:-84532}"

  log "Starting facilitator on :${FACILITATOR_PORT} (chain ${chain_id})…"
  mkdir -p "$DEV_DIR"

  (
    cd "$REPO_ROOT/apps/facilitator"
    HOST=0.0.0.0 \
    PORT="$FACILITATOR_PORT" \
    X402_NETWORKS="[{\"network\":\"eip155:${chain_id}\",\"coreApiUrl\":\"${CORE_URL}/\",\"authWalletPrivateKey\":\"${FACILITATOR_KEY}\"}]" \
    X402_RELAYER_PRIVATE_KEY="$RELAYER_KEY" \
    X402_RELAYER_RPC_URL="http://127.0.0.1:8545" \
      nohup cargo run >"$FACILITATOR_LOG" 2>&1 &
    echo $! >"$FACILITATOR_PID"
  )

  for _ in $(seq 1 180); do
    if curl -fsS "http://127.0.0.1:${FACILITATOR_PORT}/health" >/dev/null 2>&1; then
      ok "facilitator ready (http://127.0.0.1:${FACILITATOR_PORT})"
      curl -fsS "http://127.0.0.1:${FACILITATOR_PORT}/supported" || true
      echo
      return
    fi
    if ! pid_alive "$FACILITATOR_PID"; then
      tail -n 40 "$FACILITATOR_LOG" >&2
      die "facilitator exited during startup (see $FACILITATOR_LOG)"
    fi
    sleep 1
  done
  die "facilitator did not become ready (see $FACILITATOR_LOG)"
}

# ---------------------------------------------------------------------------
# 4Mica's own database
# ---------------------------------------------------------------------------
start_app_db() {
  log "Starting 4Mica postgres (:5433) and applying migrations…"
  pnpm db:up >/dev/null
  pnpm --filter @4mica/db exec prisma migrate deploy
  pnpm db:seed
  ok "app database ready"
}

# ---------------------------------------------------------------------------
# App env
# ---------------------------------------------------------------------------
# Read back what core actually deployed rather than restating it: the contract
# address changes on every redeploy, and a stale copy here would be worse than
# no copy at all.
write_env() {
  require_core_dir
  local core_env="$CORE_DIR/.env"
  [ -f "$core_env" ] || die "no $core_env — run 'scripts/dev-stack.sh core' first"

  local tokens
  tokens="$(curl -fsS "$CORE_URL/core/tokens" || echo '{}')"

  mkdir -p "$DEV_DIR"
  cat >"$DEV_DIR/stack.env" <<EOF
# Generated by scripts/dev-stack.sh — do not hand-edit.
CORE_URL=$CORE_URL
FACILITATOR_URL=http://127.0.0.1:${FACILITATOR_PORT}
FACILITATOR_ADDRESS=$FACILITATOR_ADDRESS
$(grep -E '^(ETHEREUM_CHAIN_ID|ETHEREUM_CONTRACT_ADDRESS|ETHEREUM_CLEARING_HOUSE_ADDRESS|DEV_STABLECOINS)=' "$core_env" || true)
EOF

  ok "wrote $DEV_DIR/stack.env"
  echo
  echo "  Tokens core accepts (use one as ASSET, or omit for the native asset):"
  echo "    $tokens"
  echo
  echo "  For examples/example-{seller,buyer}-live/.env:"
  echo "    4MICA_RPC_URL=$CORE_URL"
  echo "    4MICA_FACILITATOR_URL=http://127.0.0.1:${FACILITATOR_PORT}"
  echo "    NETWORK=eip155:$(grep -E '^ETHEREUM_CHAIN_ID=' "$core_env" | cut -d= -f2 | tr -d '\"')"
  echo
}

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------
cmd_up() {
  mkdir -p "$DEV_DIR"
  start_core
  start_facilitator
  start_app_db
  write_env

  echo
  ok "Stack is up. Start the Node apps in their own terminals:"
  echo "    pnpm --filter @4mica/be dev          # :4000"
  echo "    pnpm --filter @4mica/dashboard dev   # :4173"
  echo "    pnpm --filter @4mica/playground dev  # :3100"
  echo
  echo "  Then walk through docs/LOCAL_STACK.md."
}

cmd_down() {
  if pid_alive "$FACILITATOR_PID"; then
    log "Stopping facilitator…"
    kill "$(cat "$FACILITATOR_PID")" 2>/dev/null || true
    rm -f "$FACILITATOR_PID"
  fi
  pkill -f "facilitator-4mica" 2>/dev/null || true

  if [ -d "$CORE_DIR" ] && [ -f "$CORE_DIR/Makefile" ]; then
    log "Stopping core…"
    make -C "$CORE_DIR" dev-down || true
  fi

  warn "postgres containers left running (4mica-pg, 4mica-be-postgres)"
}

cmd_status() {
  curl -fsS "$CORE_URL/core/health" >/dev/null 2>&1 \
    && ok "core:        $CORE_URL" || warn "core:        stopped"
  curl -fsS "http://127.0.0.1:${FACILITATOR_PORT}/health" >/dev/null 2>&1 \
    && ok "facilitator: http://127.0.0.1:${FACILITATOR_PORT}" \
    || warn "facilitator: stopped"
  docker ps --filter name=4mica --format '  {{.Names}}\t{{.Status}}' 2>/dev/null || true
}

case "${1:-up}" in
  up)      cmd_up ;;
  core)    start_core ;;
  role)    grant_facilitator_role ;;
  facilitator) start_facilitator ;;
  db)      start_app_db ;;
  env)     write_env ;;
  down)    cmd_down ;;
  status)  cmd_status ;;
  logs)    tail -f "$FACILITATOR_LOG" ;;
  *) die "unknown command: $1 (use up|core|role|facilitator|db|env|down|status|logs)" ;;
esac
