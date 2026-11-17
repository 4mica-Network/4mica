import type { RootState } from "@stores/index";
import type { Banner, BannerState } from "./type";

export const selectBannerState = (state: RootState): BannerState =>
  state.banner;

export const selectBanners = (state: RootState): Banner[] =>
  state.banner.banners;

export const selectHasLoadedBanners = (state: RootState): boolean =>
  state.banner.hasLoaded;

export const selectIsLoadingBanners = (state: RootState): boolean =>
  state.banner.isLoading;

export const selectViewedBannerIds = (state: RootState): string[] =>
  state.banner.viewedIds;
