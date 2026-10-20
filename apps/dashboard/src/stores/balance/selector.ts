import type { RootState } from "@stores/index";
import type { BalanceState } from "./type";

export const selectBalanceState = (state: RootState): BalanceState =>
  state.balance;
