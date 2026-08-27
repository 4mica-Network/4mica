import type { UsernameUnavailability } from "@api/user";
import actionTypes from "./actionTypes";
import type { Business, User, UserState } from "./type";

export const INITIAL_STATE: UserState = {
  user: null,
  business: null,
  usernameCheck: { value: "", status: "idle" },
  isLoading: false,
  savingSections: {},
  rollback: null,
  businessRollback: null,
  error: null,
  validationIssues: {},
};

interface UserAction {
  type: string;
  payload?: unknown;
  meta?: { section: string };
}

const setSaving = (
  sections: Record<string, boolean>,
  section: string | undefined,
  value: boolean,
): Record<string, boolean> => {
  if (!section) {
    return sections;
  }
  const next = { ...sections };
  if (value) {
    next[section] = true;
  } else {
    delete next[section];
  }
  return next;
};

/** Snapshot of the keys about to change, so a failed write can be undone. */
const snapshot = <T extends object>(
  source: T | null,
  patch: Partial<T>,
): Partial<T> | null => {
  if (!source) {
    return null;
  }
  const keys = Object.keys(patch) as (keyof T)[];
  return Object.fromEntries(
    keys.map((key) => [key, source[key]]),
  ) as Partial<T>;
};

export default function userReducer(
  state: UserState = INITIAL_STATE,
  action: UserAction = { type: "" },
): UserState {
  switch (action.type) {
    case actionTypes.FETCH_USER_PENDING:
      return { ...state, isLoading: true, error: null };

    case actionTypes.FETCH_USER_SUCCEEDED: {
      const payload = action.payload as {
        user: User;
        business: Business | null;
      };
      return {
        ...state,
        user: payload.user,
        business: payload.business,
        isLoading: false,
        error: null,
      };
    }

    case actionTypes.FETCH_USER_FAILED:
      return {
        ...state,
        isLoading: false,
        error:
          (action.payload as { message?: string })?.message ??
          "Failed to load your account.",
      };

    // Applied optimistically so toggles move the instant they are clicked.
    case actionTypes.UPDATE_PROFILE_REQUESTED:
    case actionTypes.UPDATE_ACCOUNT_REQUESTED:
    case actionTypes.UPDATE_NOTIFICATIONS_REQUESTED: {
      const patch = action.payload as Partial<User>;
      return {
        ...state,
        user: state.user ? { ...state.user, ...patch } : state.user,
        rollback: state.rollback ?? snapshot(state.user, patch),
        savingSections: setSaving(
          state.savingSections,
          action.meta?.section,
          true,
        ),
        error: null,
        validationIssues: {},
      };
    }

    case actionTypes.UPDATE_USER_SUCCEEDED:
      return {
        ...state,
        user: action.payload as User,
        rollback: null,
        savingSections: setSaving(
          state.savingSections,
          action.meta?.section,
          false,
        ),
        error: null,
        validationIssues: {},
      };

    case actionTypes.UPDATE_USER_FAILED: {
      const payload = action.payload as {
        message?: string;
        issues?: Record<string, string>;
      };
      return {
        ...state,
        // Undo the optimistic patch so the UI matches the server again.
        user:
          state.user && state.rollback
            ? { ...state.user, ...state.rollback }
            : state.user,
        rollback: null,
        savingSections: setSaving(
          state.savingSections,
          action.meta?.section,
          false,
        ),
        error: payload?.message ?? "Update failed.",
        validationIssues: payload?.issues ?? {},
      };
    }

    case actionTypes.UPDATE_BUSINESS_REQUESTED: {
      const patch = action.payload as Partial<Business>;
      return {
        ...state,
        business: state.business
          ? { ...state.business, ...patch }
          : state.business,
        businessRollback:
          state.businessRollback ?? snapshot(state.business, patch),
        savingSections: setSaving(
          state.savingSections,
          action.meta?.section,
          true,
        ),
        error: null,
        validationIssues: {},
      };
    }

    case actionTypes.UPDATE_BUSINESS_SUCCEEDED:
      return {
        ...state,
        business: action.payload as Business,
        businessRollback: null,
        savingSections: setSaving(
          state.savingSections,
          action.meta?.section,
          false,
        ),
        error: null,
        validationIssues: {},
      };

    case actionTypes.UPDATE_BUSINESS_FAILED: {
      const payload = action.payload as {
        message?: string;
        issues?: Record<string, string>;
      };
      return {
        ...state,
        business:
          state.business && state.businessRollback
            ? { ...state.business, ...state.businessRollback }
            : state.business,
        businessRollback: null,
        savingSections: setSaving(
          state.savingSections,
          action.meta?.section,
          false,
        ),
        error: payload?.message ?? "Update failed.",
        validationIssues: payload?.issues ?? {},
      };
    }

    case actionTypes.CHECK_USERNAME_REQUESTED:
      return {
        ...state,
        usernameCheck: {
          value: action.payload as string,
          status: "checking",
        },
      };

    case actionTypes.CHECK_USERNAME_SUCCEEDED: {
      const payload = action.payload as {
        username: string;
        available: boolean;
        reason: UsernameUnavailability | null;
      };

      if (payload.username !== state.usernameCheck.value) {
        return state;
      }

      return {
        ...state,
        usernameCheck: {
          value: payload.username,
          status: payload.available ? "available" : (payload.reason ?? "taken"),
        },
      };
    }

    case actionTypes.CHECK_USERNAME_FAILED: {
      const payload = action.payload as { username: string };
      if (payload.username !== state.usernameCheck.value) {
        return state;
      }
      return {
        ...state,
        usernameCheck: { value: payload.username, status: "error" },
      };
    }

    case actionTypes.RESET_USERNAME_CHECK:
      return { ...state, usernameCheck: { value: "", status: "idle" } };

    case actionTypes.COMPLETE_ONBOARDING_REQUESTED: {
      const patch = action.payload as Partial<Business>;
      return {
        ...state,
        business: state.business
          ? { ...state.business, ...patch }
          : state.business,
        businessRollback:
          state.businessRollback ?? snapshot(state.business, patch),
        savingSections: setSaving(
          state.savingSections,
          action.meta?.section,
          true,
        ),
        error: null,
        validationIssues: {},
      };
    }

    case actionTypes.CLEAR_VALIDATION_ISSUES:
      return { ...state, validationIssues: {}, error: null };

    default:
      return state;
  }
}
