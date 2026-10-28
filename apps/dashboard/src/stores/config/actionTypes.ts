import { mirrorKeys } from "@stores/utils";

const configActions = mirrorKeys([
  "FETCH_CONFIG_REQUESTED",
  "FETCH_CONFIG_PENDING",
  "FETCH_CONFIG_SUCCEEDED",
  "FETCH_CONFIG_NOT_MODIFIED",
  "FETCH_CONFIG_FAILED",
] as const);

export default configActions;
