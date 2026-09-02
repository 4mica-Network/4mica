#!/usr/bin/env bash
# Refresh the vendored contract ABIs from the 4mica-core repo's forge output.
#
# Usage: CORE_REPO=~/4mica-core ./scripts/refresh_abis.sh
# Run `forge build` in $CORE_REPO/contracts first.
#
# erc20.json is a hand-curated minimal ABI and is not refreshed here.
set -euo pipefail

CORE_REPO="${CORE_REPO:-$HOME/4mica-core}"
OUT="$CORE_REPO/contracts/out"
DEST="$(cd "$(dirname "$0")/.." && pwd)/fourmica_sdk/contract/abi"

for artifact in "Core4Mica.sol/Core4Mica.json" "ClearingHouse.sol/ClearingHouse.json"; do
  if [ ! -f "$OUT/$artifact" ]; then
    echo "missing $OUT/$artifact — run 'forge build' in $CORE_REPO/contracts" >&2
    exit 1
  fi
done

jq '{abi: .abi}' "$OUT/Core4Mica.sol/Core4Mica.json" > "$DEST/core4mica.json"
jq '{abi: .abi}' "$OUT/ClearingHouse.sol/ClearingHouse.json" > "$DEST/clearing_house.json"

# Cheap drift check: the functions the SDK calls must exist.
for fn in payNetDebit claimNetCreditFor; do
  jq -e --arg fn "$fn" '.abi[] | select(.type=="function" and .name==$fn)' \
    "$DEST/clearing_house.json" > /dev/null || { echo "ABI drift: $fn missing" >&2; exit 1; }
done
for fn in deposit depositStablecoin getGuaranteeVersionConfig getUserAllAssets depositStablecoinWithAuthorization; do
  jq -e --arg fn "$fn" '.abi[] | select(.type=="function" and .name==$fn)' \
    "$DEST/core4mica.json" > /dev/null || { echo "ABI drift: $fn missing" >&2; exit 1; }
done

echo "ABIs refreshed into $DEST"
