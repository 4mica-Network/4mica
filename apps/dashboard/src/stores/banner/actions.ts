import actionTypes from "./actionTypes";
import type { Banner, BannerInteractionType } from "./type";

export const fetchBanners = () => ({
  type: actionTypes.FETCH_BANNERS_REQUESTED,
});

export const fetchBannersPending = () => ({
  type: actionTypes.FETCH_BANNERS_PENDING,
});

export const fetchBannersSucceeded = (banners: Banner[]) => ({
  type: actionTypes.FETCH_BANNERS_SUCCEEDED,
  payload: { banners },
});

export const fetchBannersFailed = (message: string) => ({
  type: actionTypes.FETCH_BANNERS_FAILED,
  payload: { message },
});

export const dismissBanner = (banner: Banner) => ({
  type: actionTypes.DISMISS_BANNER_REQUESTED,
  payload: { banner },
});

export const dismissBannerFailed = (banner: Banner, message: string) => ({
  type: actionTypes.DISMISS_BANNER_FAILED,
  payload: { banner, message },
});

export const recordBannerInteraction = (
  id: string,
  interaction: BannerInteractionType,
) => ({
  type: actionTypes.RECORD_BANNER_INTERACTION_REQUESTED,
  payload: { id, interaction },
});
