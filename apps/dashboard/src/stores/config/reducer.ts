import actionTypes from "./actionTypes";
import { readConfigCache } from "./persist";
import type { AppConfig, ConfigState } from "./type";

export const INITIAL_STATE: ConfigState = {
  config: null,
  fetchedAt: null,
  isLoading: false,
  hasLoaded: false,
  error: null,
};

const hydrate = (): ConfigState => {
  const cached = readConfigCache();
  return cached
    ? { ...INITIAL_STATE, ...cached, hasLoaded: true }
    : INITIAL_STATE;
};

interface ConfigAction {
  type: string;
  payload?: unknown;
}

const configReducer = (
  state: ConfigState = hydrate(),
  action: ConfigAction = { type: "" },
): ConfigState => {
  switch (action.type) {
    case actionTypes.FETCH_CONFIG_PENDING:
      return { ...state, isLoading: true, error: null };

    case actionTypes.FETCH_CONFIG_SUCCEEDED: {
      const { config, fetchedAt } = action.payload as {
        config: AppConfig;
        fetchedAt: number;
      };
      return {
        ...state,
        config,
        fetchedAt,
        isLoading: false,
        hasLoaded: true,
        error: null,
      };
    }

    case actionTypes.FETCH_CONFIG_NOT_MODIFIED: {
      const { fetchedAt } = action.payload as { fetchedAt: number };
      return { ...state, fetchedAt, isLoading: false, error: null };
    }

    case actionTypes.FETCH_CONFIG_FAILED: {
      const { message } = action.payload as { message: string };
      return { ...state, isLoading: false, hasLoaded: true, error: message };
    }

    default:
      return state;
  }
};

export default configReducer;
