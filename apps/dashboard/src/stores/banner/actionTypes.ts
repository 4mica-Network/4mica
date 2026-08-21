import { mirrorKeys } from "@stores/utils";

const bannerActions = mirrorKeys([
  "FETCH_BANNERS_REQUESTED",
  "FETCH_BANNERS_PENDING",
  "FETCH_BANNERS_SUCCEEDED",
  "FETCH_BANNERS_FAILED",

  "DISMISS_BANNER_REQUESTED",
  "DISMISS_BANNER_FAILED",

  "RECORD_BANNER_INTERACTION_REQUESTED",
] as const);

export default bannerActions;
