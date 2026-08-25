import { describe, expect, it } from "vitest";
import {
  dismissBanner,
  dismissBannerFailed,
  fetchBannersFailed,
  fetchBannersPending,
  fetchBannersSucceeded,
} from "./actions";
import reducer, { INITIAL_STATE } from "./reducer";
import type { Banner } from "./type";

const banner = (over: Partial<Banner> = {}): Banner => ({
  id: "ban_1",
  title: "Instant payouts",
  message: "Settle to your wallet the moment a payment clears.",
  url: "https://4mica.io",
  thumbnailUrl: null,
  videoUrl: null,
  alt: null,
  isVideo: false,
  ...over,
});

describe("banner reducer", () => {
  it("stores the fetched banners and flips hasLoaded", () => {
    const state = reducer(
      reducer(INITIAL_STATE, fetchBannersPending()),
      fetchBannersSucceeded([banner()]),
    );

    expect(state.banners).toHaveLength(1);
    expect(state.isLoading).toBe(false);
    expect(state.hasLoaded).toBe(true);
    expect(state.error).toBeNull();
  });

  it("still flips hasLoaded on failure, so the sidebar stops waiting", () => {
    const state = reducer(INITIAL_STATE, fetchBannersFailed("nope"));

    expect(state.hasLoaded).toBe(true);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBe("nope");
  });

  it("removes the banner optimistically on dismiss", () => {
    const loaded = reducer(
      INITIAL_STATE,
      fetchBannersSucceeded([banner(), banner({ id: "ban_2" })]),
    );

    const state = reducer(loaded, dismissBanner(banner()));

    expect(state.banners.map((item) => item.id)).toEqual(["ban_2"]);
  });

  it("restores the banner when the dismissal write fails", () => {
    const loaded = reducer(INITIAL_STATE, fetchBannersSucceeded([banner()]));
    const dismissed = reducer(loaded, dismissBanner(banner()));

    const state = reducer(dismissed, dismissBannerFailed(banner(), "offline"));

    expect(state.banners.map((item) => item.id)).toEqual(["ban_1"]);
    expect(state.error).toBe("offline");
  });

  it("does not duplicate a banner if the same failure lands twice", () => {
    const loaded = reducer(INITIAL_STATE, fetchBannersSucceeded([banner()]));
    const dismissed = reducer(loaded, dismissBanner(banner()));

    const state = reducer(
      reducer(dismissed, dismissBannerFailed(banner(), "offline")),
      dismissBannerFailed(banner(), "offline"),
    );

    expect(state.banners).toHaveLength(1);
  });
});
