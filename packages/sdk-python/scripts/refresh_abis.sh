#!/usr/bin/env bash
# Kept for muscle memory: the ABIs are refreshed for every SDK at once by the
# monorepo-level script, which also writes this package's copies.
#
#   CORE_REPO=~/4mica-core ./scripts/refresh_abis.sh
exec "$(cd "$(dirname "$0")/../../.." && pwd)/scripts/refresh-abis.sh" "$@"
