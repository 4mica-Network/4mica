#!/usr/bin/env bash
# Refresh the vendored contract ABIs from the 4mica-core repo's forge output.
#
#   CORE_REPO=~/4mica-core ./scripts/refresh-abis.sh
#
# Run `forge build` in $CORE_REPO/contracts first. This is the single entry
# point for every SDK:
#
#   contracts/abi/*.json                             source of truth (+ SOURCE)
#   packages/sdk-python/fourmica_sdk/contract/abi/   Python package data
#   packages/sdk/src/abi/*.ts                        TypeScript `as const` ABIs
#
# The Rust SDK declares its interface by hand in `sol!` blocks
# (packages/sdk-rust/src/contract/mod.rs) and is not touched here. The
# Python package's erc20.json is a hand-curated minimal ABI and is not
# refreshed either (the TypeScript SDK uses viem's built-in `erc20Abi`).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CORE_REPO="${CORE_REPO:-$HOME/4mica-core}"
OUT="$CORE_REPO/contracts/out"
ABI_DIR="$ROOT/contracts/abi"
PY_DIR="$ROOT/packages/sdk-python/fourmica_sdk/contract/abi"

for artifact in "Core4Mica.sol/Core4Mica.json" "ClearingHouse.sol/ClearingHouse.json"; do
  if [ ! -f "$OUT/$artifact" ]; then
    echo "missing $OUT/$artifact — run 'forge build' in $CORE_REPO/contracts" >&2
    exit 1
  fi
done

mkdir -p "$ABI_DIR"
jq '{abi: .abi}' "$OUT/Core4Mica.sol/Core4Mica.json" > "$ABI_DIR/Core4Mica.json"
jq '{abi: .abi}' "$OUT/ClearingHouse.sol/ClearingHouse.json" > "$ABI_DIR/ClearingHouse.json"
printf '4mica-core %s (%s)\n' \
  "$(git -C "$CORE_REPO" rev-parse HEAD)" \
  "$(git -C "$CORE_REPO" log -1 --format=%cs HEAD)" > "$ABI_DIR/SOURCE"

# Every function an SDK calls by name must still exist. Extend when an SDK
# starts calling something new. This is a name-only smoke check; the real
# guards are packages/sdk/tests/abi.test.ts (pins the TypeScript ABIs to
# contracts/abi) and the sdk-python CI diff (pins the Python copies).
require_fn() {
  local file="$1" fn="$2"
  jq -e --arg fn "$fn" '.abi[] | select(.type=="function" and .name==$fn)' \
    "$file" > /dev/null || { echo "ABI drift: $fn missing from $(basename "$file")" >&2; exit 1; }
}
for fn in payNetDebit payNetDebitWithAuthorization payNetDebitWithPermit2 claimNetCreditFor; do
  require_fn "$ABI_DIR/ClearingHouse.json" "$fn"
done
for fn in deposit depositStablecoin depositStablecoinWithAuthorization depositStablecoinWithPermit2 \
  requestWithdrawal cancelWithdrawal finalizeWithdrawal finalizeWithdrawalFor \
  requestWithdrawalWithAuthorization cancelWithdrawalWithAuthorization \
  getUserAllAssets getGuaranteeVersionConfig guaranteeDomainSeparator \
  withdrawableBalance principalBalance guaranteeCapacity \
  grossYield protocolYieldShare userNetYield totalUserScaledBalance \
  protocolScaledBalance surplusScaledBalance contractScaledATokenBalance stablecoinAToken; do
  require_fn "$ABI_DIR/Core4Mica.json" "$fn"
done

cp "$ABI_DIR/Core4Mica.json" "$PY_DIR/core4mica.json"
cp "$ABI_DIR/ClearingHouse.json" "$PY_DIR/clearing_house.json"

node "$ROOT/packages/sdk/scripts/refresh-abis.mjs"

echo "ABIs refreshed from $(cat "$ABI_DIR/SOURCE")"
