#!/usr/bin/env bash
# The recording, in one command: collateral before, Apify's 402 decoded, two paid
# `run-actor` calls through mcpc, collateral after.
#
# Needs both servers running (`pnpm run actor-server` and `pnpm run mcp-server`), the
# mcpc fork built and on PATH as `mcpc` (or MCPC=<path>), its wallet imported from the
# same PRIVATE_KEY the deposit used (`mcpc x402 import <key>`), and this package's .env
# for the balance script. `curl`, `jq` and `base64` do the decoding.
set -euo pipefail
cd "$(dirname "$0")"

ACTOR_URL=${ACTOR_URL:-http://localhost:3002}
MCP_URL=${MCP_URL:-http://localhost:3001}
MCPC=${MCPC:-mcpc}
QUERY=${QUERY:-"x402 isn't good (yet)"}
RUN="$ACTOR_URL/v2/acts/demo~scraper/run-sync-get-dataset-items"

step() { printf '\n\033[1m%s\033[0m\n' "$*"; }

step "1. Collateral before"
pnpm --silent run balance

step "2. Apify's 402, decoded: upto, exact, and 4mica-credit"
curl -s -D - -o /dev/null -X POST "$RUN" \
  -H 'content-type: application/json' -d "{\"query\":\"$QUERY\"}" |
  grep -i '^payment-required:' | cut -d' ' -f2 | tr -d '\r' | base64 --decode |
  jq '{x402Version, accepts: [.accepts[] | {scheme, amount, maxTimeoutSeconds, extra}]}'

step "3. Connect through mcpc, paying with 4mica-credit"
"$MCPC" connect "$MCP_URL/mcp" @demo --x402 4mica-credit

step "4. First run: a signed guarantee, verified, run, settled"
"$MCPC" @demo tools-call run-actor query:="$QUERY"

step "5. Second run: a fresh signature, never a reused one"
"$MCPC" @demo tools-call run-actor query:="$QUERY, again"

step "6. Collateral after: locked rose by two runs, and no transaction happened"
pnpm --silent run balance

"$MCPC" @demo close >/dev/null
