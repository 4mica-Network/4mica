import { setPending } from "@stores/utils";
import actionTypes from "./actionTypes";
import type {
  InvitationPreview,
  InvitationState,
  OrganizationList,
  OrganizationState,
  OrganizationSummary,
} from "./type";

const INITIAL_INVITATION: InvitationState = {
  token: null,
  preview: null,
  status: "idle",
  errorCode: null,
  error: null,
};

export const INITIAL_STATE: OrganizationState = {
  items: [],
  defaultId: null,
  activeId: null,
  status: "idle",
  error: null,
  pending: {},
  issues: {},
  invitation: INITIAL_INVITATION,
};

interface OrganizationAction {
  type: string;
  payload?: unknown;
  meta?: { pendingKey: string };
}

const upsert = (
  items: OrganizationSummary[],
  next: OrganizationSummary,
): OrganizationSummary[] =>
  items.some((item) => item.id === next.id)
    ? items.map((item) => (item.id === next.id ? next : item))
    : [...items, next];

export default function organizationReducer(
  state: OrganizationState = INITIAL_STATE,
  action: OrganizationAction = { type: "" },
): OrganizationState {
  switch (action.type) {
    case actionTypes.FETCH_ORGANIZATIONS_PENDING:
      return {
        ...state,
        status: state.status === "loaded" ? "loaded" : "loading",
        error: null,
      };

    case actionTypes.FETCH_ORGANIZATIONS_SUCCEEDED: {
      const payload = action.payload as OrganizationList & {
        activeId: string | null;
      };
      return {
        ...state,
        items: payload.items,
        defaultId: payload.defaultId,
        activeId: payload.activeId,
        status: "loaded",
        error: null,
      };
    }

    case actionTypes.FETCH_ORGANIZATIONS_FAILED:
      return {
        ...state,
        status: state.status === "loaded" ? "loaded" : "failed",
        error:
          (action.payload as { message?: string })?.message ??
          "Failed to load your organizations.",
      };

    case actionTypes.ACTIVE_ORGANIZATION_SET:
      return { ...state, activeId: (action.payload as { id: string }).id };

    case actionTypes.CREATE_ORGANIZATION_REQUESTED:
    case actionTypes.UPDATE_ORGANIZATION_REQUESTED:
    case actionTypes.LEAVE_ORGANIZATION_REQUESTED:
    case actionTypes.DELETE_ORGANIZATION_REQUESTED:
    case actionTypes.TRANSFER_ORGANIZATION_REQUESTED:
    case actionTypes.ACCEPT_INVITATION_REQUESTED:
    case actionTypes.DECLINE_INVITATION_REQUESTED:
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, true),
        error: null,
        issues: {},
      };

    case actionTypes.CREATE_ORGANIZATION_SUCCEEDED:
    case actionTypes.UPDATE_ORGANIZATION_SUCCEEDED:
      return {
        ...state,
        items: upsert(state.items, action.payload as OrganizationSummary),
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };

    case actionTypes.LEAVE_ORGANIZATION_SUCCEEDED:
    case actionTypes.DELETE_ORGANIZATION_SUCCEEDED: {
      const { id } = action.payload as { id: string };
      return {
        ...state,
        items: state.items.filter((item) => item.id !== id),
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };
    }

    case actionTypes.TRANSFER_ORGANIZATION_SUCCEEDED:
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };

    case actionTypes.ORGANIZATION_ACTION_FAILED: {
      const payload = action.payload as {
        message?: string;
        issues?: Record<string, string>;
      };
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, false),
        error: payload?.message ?? "Something went wrong.",
        issues: payload?.issues ?? {},
      };
    }

    case actionTypes.CLEAR_ORGANIZATION_ISSUES:
      return { ...state, error: null, issues: {} };

    case actionTypes.FETCH_INVITATION_REQUESTED:
      return {
        ...state,
        invitation: {
          ...INITIAL_INVITATION,
          token: (action.payload as { token: string }).token,
          status: "loading",
        },
      };

    case actionTypes.FETCH_INVITATION_SUCCEEDED: {
      const payload = action.payload as {
        token: string;
        preview: InvitationPreview;
      };
      if (payload.token !== state.invitation.token) {
        return state;
      }
      return {
        ...state,
        invitation: {
          ...state.invitation,
          preview: payload.preview,
          status: "ready",
        },
      };
    }

    case actionTypes.FETCH_INVITATION_FAILED: {
      const payload = action.payload as {
        token: string;
        code: string;
        message: string;
      };
      if (payload.token !== state.invitation.token) {
        return state;
      }
      return {
        ...state,
        invitation: {
          ...state.invitation,
          status: "failed",
          errorCode: payload.code,
          error: payload.message,
        },
      };
    }

    case actionTypes.ACCEPT_INVITATION_SUCCEEDED:
      return {
        ...state,
        items: upsert(state.items, action.payload as OrganizationSummary),
        pending: setPending(state.pending, action.meta?.pendingKey, false),
        invitation: { ...state.invitation, status: "accepted" },
      };

    case actionTypes.DECLINE_INVITATION_SUCCEEDED:
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, false),
        invitation: { ...state.invitation, status: "declined" },
      };

    case actionTypes.INVITATION_ACTION_FAILED: {
      const payload = action.payload as { code: string; message: string };
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, false),
        invitation: {
          ...state.invitation,
          status: "failed",
          errorCode: payload.code,
          error: payload.message,
        },
      };
    }

    default:
      return state;
  }
}
