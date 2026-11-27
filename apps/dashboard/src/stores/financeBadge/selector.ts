import type { RootState } from "@stores/index";
import { INITIAL_STATE } from "./reducer";
import type { FinanceBadgeState } from "./type";

export const selectFinanceBadges = (state: RootState): FinanceBadgeState =>
  state.financeBadge ?? INITIAL_STATE;
