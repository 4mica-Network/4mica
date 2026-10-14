import { mirrorKeys } from "@stores/utils";

const balanceActions = mirrorKeys([
  "FETCH_BALANCES_REQUESTED",
  "FETCH_BALANCES_PENDING",
  "FETCH_BALANCES_SUCCEEDED",
  "FETCH_BALANCES_FAILED",
] as const);

export default balanceActions;
