import type { WithdrawResult } from "@4mica/sdk";
import { fields } from "../ui/output.js";

export const withdrawalFields = (result: WithdrawResult): string =>
  fields([
    ["asset", result.asset.symbol],
    ["transaction", result.txHash],
    ["network", result.network],
    ["explorer", result.explorerUrl],
  ]);
