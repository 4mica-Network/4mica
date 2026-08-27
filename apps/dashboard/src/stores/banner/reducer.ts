import actionTypes from "./actionTypes";
import type { Banner, BannerState } from "./type";

export const INITIAL_STATE: BannerState = {
  banners: [],
  isLoading: false,
  hasLoaded: false,
  error: null,
};

interface BannerAction {
  type: string;
  payload?: unknown;
}

const bannerReducer = (
  state: BannerState = INITIAL_STATE,
  action: BannerAction = { type: "" },
): BannerState => {
  switch (action.type) {
    case actionTypes.FETCH_BANNERS_PENDING:
      return { ...state, isLoading: true, error: null };

    case actionTypes.FETCH_BANNERS_SUCCEEDED: {
      const { banners } = action.payload as { banners: Banner[] };
      return {
        ...state,
        banners,
        isLoading: false,
        hasLoaded: true,
        error: null,
      };
    }

    case actionTypes.FETCH_BANNERS_FAILED: {
      const { message } = action.payload as { message: string };
      return { ...state, isLoading: false, hasLoaded: true, error: message };
    }

    case actionTypes.DISMISS_BANNER_REQUESTED: {
      const { banner } = action.payload as { banner: Banner };
      return {
        ...state,
        banners: state.banners.filter((item) => item.id !== banner.id),
      };
    }

    case actionTypes.DISMISS_BANNER_FAILED: {
      const { banner, message } = action.payload as {
        banner: Banner;
        message: string;
      };
      if (state.banners.some((item) => item.id === banner.id)) {
        return { ...state, error: message };
      }
      return { ...state, banners: [...state.banners, banner], error: message };
    }

    default:
      return state;
  }
};

export default bannerReducer;
