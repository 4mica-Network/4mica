import { mirrorKeys } from "@stores/utils";

const financeBadgeActions = mirrorKeys([
  "FETCH_FINANCE_BADGES_REQUESTED",
  "FETCH_FINANCE_BADGES_SUCCEEDED",
] as const);

export default financeBadgeActions;
