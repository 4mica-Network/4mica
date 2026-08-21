import { HttpError } from "@4mica/http";
import * as api from "@api/banner";
import i18n from "@i18n";
import { notifyError } from "@utils/notification";
import { call, put, takeEvery, takeLatest } from "redux-saga/effects";
import {
  dismissBannerFailed,
  fetchBannersFailed,
  fetchBannersPending,
  fetchBannersSucceeded,
} from "./actions";
import actionTypes from "./actionTypes";
import type { Banner, BannerInteractionType } from "./type";

const toMessage = (error: unknown, fallback: string): string => {
  if (error instanceof HttpError) {
    return (error.body as { message?: string } | null)?.message ?? fallback;
  }
  return fallback;
};

const t = (key: string, defaultValue: string) => i18n.t(key, { defaultValue });

export function* fetchBanners(): Generator {
  try {
    yield put(fetchBannersPending());
    const banners = (yield call(api.getBanners)) as Banner[];
    yield put(fetchBannersSucceeded(banners));
  } catch (error) {
    // No toast: a failed promo fetch is not something the user can act on. But
    // it must not be invisible to us either, or the deck just silently renders
    // nothing.
    if (import.meta.env.DEV) {
      console.warn("[banners] fetch failed", error);
    }
    yield put(
      fetchBannersFailed(toMessage(error, "Couldn't load announcements.")),
    );
  }
}

export function* dismissBanner(action: {
  type: string;
  payload: { banner: Banner };
}): Generator {
  const { banner } = action.payload;
  try {
    yield call(() => api.recordBannerInteraction(banner.id, "DISMISSED"));
  } catch (error) {
    const message = toMessage(error, "Couldn't dismiss the announcement.");
    yield put(dismissBannerFailed(banner, message));
    notifyError({
      title: t("store.banner.failedTitle", "Something went wrong"),
      content: message,
    });
  }
}

export function* recordBannerInteraction(action: {
  type: string;
  payload: { id: string; interaction: BannerInteractionType };
}): Generator {
  try {
    yield call(() =>
      api.recordBannerInteraction(
        action.payload.id,
        action.payload.interaction,
      ),
    );
  } catch {}
}

export default [
  takeLatest(actionTypes.FETCH_BANNERS_REQUESTED, fetchBanners),
  takeEvery(actionTypes.DISMISS_BANNER_REQUESTED, dismissBanner),
  takeEvery(
    actionTypes.RECORD_BANNER_INTERACTION_REQUESTED,
    recordBannerInteraction,
  ),
];
