import { type AmountSpec, parseAmount } from "@4mica/sdk/amounts";
import { usageError } from "../errors.js";
import type { Resolved } from "./settings.js";

/**
 * `5` with an asset from `--asset` or the config file, or the SDK's own
 * `"5 USDC"`. Naming the asset both ways on the command line is refused, not
 * reconciled; over a default from the config file, the one typed wins.
 */
export function amountInput(arg: string, given?: Resolved): AmountSpec {
  const parts = arg.trim().split(/\s+/);
  if (parts.length === 2 && given?.source === "flag") {
    throw usageError(`the asset is given twice: "${arg}" and --asset`, {
      code: "ASSET_GIVEN_TWICE",
      suggestions: ["name it once"],
    });
  }
  const asset = given?.value;
  if (parts.length === 1 && !asset) {
    throw usageError("no asset given", {
      code: "NO_ASSET",
      suggestions: [
        "pass --asset, for example --asset USDC",
        "or set a default with `4mica config set asset USDC`",
      ],
    });
  }
  return parts.length === 1
    ? parseAmount({ amount: arg, asset: asset as string })
    : parseAmount(arg);
}

export function requireAsset(asset?: string): string {
  if (asset) return asset;
  throw usageError("no asset given", {
    code: "NO_ASSET",
    suggestions: [
      "pass --asset, for example --asset USDC",
      "or set a default with `4mica config set asset USDC`",
    ],
  });
}
