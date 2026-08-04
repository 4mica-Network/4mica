import actionTypes from "./actionTypes";
import type { Business, User, UserState } from "./type";

export const INITIAL_STATE: UserState = {
  user: null,
  business: null,
  isLoading: false,
  isUpdateLoading: false,
  isBusinessUpdateLoading: false,
  error: null,
  validationIssues: {},
};

interface UserAction {
  type: string;
  payload?: {
    user?: User;
    business?: Business | null;
    message?: string;
    issues?: Record<string, string>;
  } & Partial<User> &
    Partial<Business>;
}

export default function userReducer(
  state: UserState = INITIAL_STATE,
  action: UserAction = { type: "" },
): UserState {
  switch (action.type) {
    case actionTypes.FETCH_USER_PENDING:
      return { ...state, isLoading: true, error: null };

    case actionTypes.FETCH_USER_SUCCEEDED:
      return {
        ...state,
        user: (action.payload?.user as User) ?? null,
        business: (action.payload?.business as Business | null) ?? null,
        isLoading: false,
        error: null,
      };

    case actionTypes.FETCH_USER_FAILED:
      return {
        ...state,
        isLoading: false,
        error: action.payload?.message ?? "Failed to load your account.",
      };

    case actionTypes.UPDATE_USER_PENDING:
      return {
        ...state,
        isUpdateLoading: true,
        error: null,
        validationIssues: {},
      };

    case actionTypes.UPDATE_USER_SUCCEEDED:
      return {
        ...state,
        user: action.payload as unknown as User,
        isUpdateLoading: false,
        error: null,
        validationIssues: {},
      };

    case actionTypes.UPDATE_USER_FAILED:
      return {
        ...state,
        isUpdateLoading: false,
        error: action.payload?.message ?? "Update failed.",
        validationIssues: action.payload?.issues ?? {},
      };

    case actionTypes.UPDATE_BUSINESS_PENDING:
      return {
        ...state,
        isBusinessUpdateLoading: true,
        error: null,
        validationIssues: {},
      };

    case actionTypes.UPDATE_BUSINESS_SUCCEEDED:
      return {
        ...state,
        business: action.payload as unknown as Business,
        isBusinessUpdateLoading: false,
        error: null,
        validationIssues: {},
      };

    case actionTypes.UPDATE_BUSINESS_FAILED:
      return {
        ...state,
        isBusinessUpdateLoading: false,
        error: action.payload?.message ?? "Update failed.",
        validationIssues: action.payload?.issues ?? {},
      };

    case actionTypes.CLEAR_VALIDATION_ISSUES:
      return { ...state, validationIssues: {}, error: null };

    default:
      return state;
  }
}
