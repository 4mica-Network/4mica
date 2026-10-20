#!/usr/bin/env bash
# The recording, in one command, written to be read at a glance: both wallets before,
# the three ways to pay from Apify's 402, one line for the connection, two paid
# `run-actor` calls through mcpc (a cap signed, the unused part refunded, the receipt
# on top of each result), and both wallets after with what changed and what the cycle
# will net.
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

BOLD=$'\033[1m'; DIM=$'\033[2m'; RESET=$'\033[0m'
# A numbered headline, and one dim line saying what to look for.
step() { printf '\n%s%s%s\n%s%s%s\n\n' "$BOLD" "$1" "$RESET" "$DIM" "$2" "$RESET"; }
# One JSON line per wallet: {wallet, address, collateral, locked, free}.
balance_json() { FORMAT=json WALLET=$1 pnpm --silent run balance; }
# "  buyer   0x5Ef6…6a88   locked 5.00 USDC   free 0.99 USDC"
show_balance() {
  jq -r '"  \(.wallet)\(if .wallet == "buyer" then "  " else " " end)  \(.address[0:6])…\(.address[-4:])   locked \(.locked) USDC   free \(.free) USDC"' <<<"$1"
}
# "  buyer   locked 5.00 → 5.02 USDC   (+0.02, two caps signed)"
show_change() {
  jq -rn --argjson a "$1" --argjson b "$2" --arg why "$3" '
    def r6: . * 1e6 | round / 1e6;
    (($b.locked | tonumber) - ($a.locked | tonumber)) | r6 as $d |
    "  \($a.wallet)\(if $a.wallet == "buyer" then "  " else " " end)  locked \($a.locked) → \($b.locked) USDC   (\(if $d >= 0 then "+" else "" end)\($d), \($why))"'
}

# Name what is missing before the first step, rather than letting `set -e` exit silently.
require_server() {
  if ! curl -sf -m 5 "$2/health" >/dev/null; then
    echo "$1 is not answering at $2. Start it with: $3" >&2
    exit 1
  fi
}
require_server "The actor server" "$ACTOR_URL" "pnpm run actor-server"
require_server "The MCP server" "$MCP_URL" "pnpm run mcp-server"
command -v "$MCPC" >/dev/null || { echo "mcpc not found; build the fork and put its bin on PATH, or set MCPC=<path>" >&2; exit 1; }
for tool in jq base64; do
  command -v "$tool" >/dev/null || { echo "$tool is needed to decode the 402" >&2; exit 1; }
done

step "1/6  Before" "Two wallets with collateral in 4mica core. Locked is what their open guarantees hold."
BUYER_BEFORE=$(balance_json buyer)
SELLER_BEFORE=$(balance_json seller)
show_balance "$BUYER_BEFORE"
show_balance "$SELLER_BEFORE"

step "2/6  The Actor's 402: three ways to pay" "Apify's own upto and exact, plus 4mica-credit: a collateral-backed guarantee, signed from the 402 alone."
curl -s -D - -o /dev/null -X POST "$RUN" \
  -H 'content-type: application/json' -d "{\"query\":\"$QUERY\"}" |
  grep -i '^payment-required:' | cut -d' ' -f2 | tr -d '\r' | base64 --decode |
  jq -r '.accepts[] |
    "  \((.scheme + "              ")[0:14]) \((.amount | tonumber) / 1e6) USDC cap   window \(.maxTimeoutSeconds)s" +
    (if .scheme == "4mica-credit" then "   ← paid with this" else "" end)'

step "3/6  Connect through mcpc, Apify's CLI" "The fork signs 4mica-credit only when asked for it, and signs afresh on every call."
"$MCPC" connect "$MCP_URL/mcp" @demo --x402 4mica-credit --json |
  jq -r '(if type == "array" then .[0] else . end) |
    "  connected to \(.serverInfo.name // "the demo")   tools: \((.toolNames // []) | join(", "))   paying with 4mica-credit"'

step "4/6  First run" "mcpc signs the cap. The seller verifies, runs, settles, then pays the unused part back as a guarantee."
"$MCPC" @demo tools-call run-actor query:="$QUERY"

step "5/6  Second run" "A fresh signature, never a reused one. Same cap, same refund."
"$MCPC" @demo tools-call run-actor query:="$QUERY, again"

step "6/6  After" "Each lock grew by what that wallet signed. Nothing moved on-chain."
BUYER_AFTER=$(balance_json buyer)
SELLER_AFTER=$(balance_json seller)
show_change "$BUYER_BEFORE" "$BUYER_AFTER" "two caps signed"
show_change "$SELLER_BEFORE" "$SELLER_AFTER" "two refunds signed"
jq -rn --argjson bb "$BUYER_BEFORE" --argjson ba "$BUYER_AFTER" --argjson sb "$SELLER_BEFORE" --argjson sa "$SELLER_AFTER" '
  def r6: . * 1e6 | round / 1e6;
  ((($ba.locked | tonumber) - ($bb.locked | tonumber)) - (($sa.locked | tonumber) - ($sb.locked | tonumber))) | r6 |
  "\n  When the cycle commits, core nets the four guarantees to \(.) USDC in one settlement: no refund transaction, no per-run transaction."'
echo "  Proof: the certificates in each result's structuredContent, signed by core's operator key."

"$MCPC" @demo close >/dev/null
