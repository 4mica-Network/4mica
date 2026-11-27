import { setPending } from "@stores/utils";
import actionTypes from "./actionTypes";
import type {
  AuditFilters,
  AuditLogItem,
  AuditLogState,
  Member,
  PendingInvitation,
  TeamState,
} from "./type";

export const INITIAL_AUDIT_FILTERS: AuditFilters = {
  from: "",
  to: "",
  actorUserId: "",
  actionPrefix: "",
  projectId: "",
  targetType: "",
  targetId: "",
  q: "",
};

const INITIAL_AUDIT: AuditLogState = {
  items: [],
  nextCursor: null,
  filters: INITIAL_AUDIT_FILTERS,
  status: "idle",
  isLoadingMore: false,
  error: null,
};

export const INITIAL_STATE: TeamState = {
  members: [],
  membersStatus: "idle",
  membersError: null,
  invitations: [],
  invitationsStatus: "idle",
  audit: INITIAL_AUDIT,
  pending: {},
  error: null,
  issues: {},
};

interface TeamAction {
  type: string;
  payload?: unknown;
  meta?: { pendingKey: string };
}

const messageOf = (payload: unknown, fallback: string) =>
  (payload as { message?: string } | undefined)?.message ?? fallback;

export default function teamReducer(
  state: TeamState = INITIAL_STATE,
  action: TeamAction = { type: "" },
): TeamState {
  switch (action.type) {
    case actionTypes.FETCH_MEMBERS_PENDING:
      return {
        ...state,
        membersStatus: state.membersStatus === "loaded" ? "loaded" : "loading",
        membersError: null,
      };

    case actionTypes.FETCH_MEMBERS_SUCCEEDED:
      return {
        ...state,
        members: (action.payload as { items: Member[] }).items,
        membersStatus: "loaded",
        membersError: null,
      };

    case actionTypes.FETCH_MEMBERS_FAILED:
      return {
        ...state,
        membersStatus: state.membersStatus === "loaded" ? "loaded" : "failed",
        membersError: messageOf(action.payload, "Failed to load members."),
      };

    case actionTypes.FETCH_INVITATIONS_PENDING:
      return {
        ...state,
        invitationsStatus:
          state.invitationsStatus === "loaded" ? "loaded" : "loading",
      };

    case actionTypes.FETCH_INVITATIONS_SUCCEEDED:
      return {
        ...state,
        invitations: (action.payload as { items: PendingInvitation[] }).items,
        invitationsStatus: "loaded",
      };

    case actionTypes.FETCH_INVITATIONS_FAILED:
      return {
        ...state,
        invitationsStatus:
          state.invitationsStatus === "loaded" ? "loaded" : "failed",
      };

    case actionTypes.UPDATE_MEMBER_ROLE_REQUESTED:
    case actionTypes.SUSPEND_MEMBER_REQUESTED:
    case actionTypes.REVOKE_MEMBER_SESSIONS_REQUESTED:
    case actionTypes.REMOVE_MEMBER_REQUESTED:
    case actionTypes.INVITE_MEMBERS_REQUESTED:
    case actionTypes.RESEND_INVITATION_REQUESTED:
    case actionTypes.REVOKE_INVITATION_REQUESTED:
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, true),
        error: null,
        issues: {},
      };

    case actionTypes.REVOKE_MEMBER_SESSIONS_SUCCEEDED:
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };

    case actionTypes.UPDATE_MEMBER_ROLE_SUCCEEDED:
    case actionTypes.SUSPEND_MEMBER_SUCCEEDED: {
      const member = action.payload as Member;
      return {
        ...state,
        members: state.members.map((current) =>
          current.userId === member.userId ? member : current,
        ),
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };
    }

    case actionTypes.REMOVE_MEMBER_SUCCEEDED: {
      const { userId } = action.payload as { userId: string };
      return {
        ...state,
        members: state.members.filter((member) => member.userId !== userId),
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };
    }

    case actionTypes.INVITE_MEMBERS_SUCCEEDED: {
      const { items } = action.payload as { items: PendingInvitation[] };
      const ids = new Set(items.map((item) => item.id));
      const emails = new Set(items.map((item) => item.email.toLowerCase()));
      return {
        ...state,
        invitations: [
          ...items,
          ...state.invitations.filter(
            (current) =>
              !ids.has(current.id) && !emails.has(current.email.toLowerCase()),
          ),
        ],
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };
    }

    case actionTypes.RESEND_INVITATION_SUCCEEDED: {
      const invitation = action.payload as PendingInvitation;
      return {
        ...state,
        invitations: state.invitations.map((current) =>
          current.id === invitation.id ? invitation : current,
        ),
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };
    }

    case actionTypes.REVOKE_INVITATION_SUCCEEDED: {
      const { id } = action.payload as { id: string };
      return {
        ...state,
        invitations: state.invitations.filter((current) => current.id !== id),
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };
    }

    case actionTypes.FETCH_AUDIT_LOG_PENDING: {
      const { append } = action.payload as { append: boolean };
      return {
        ...state,
        audit: append
          ? { ...state.audit, isLoadingMore: true, error: null }
          : { ...state.audit, status: "loading", error: null },
      };
    }

    case actionTypes.FETCH_AUDIT_LOG_SUCCEEDED: {
      const payload = action.payload as {
        items: AuditLogItem[];
        nextCursor: string | null;
        append: boolean;
      };
      return {
        ...state,
        audit: {
          ...state.audit,
          items: payload.append
            ? [...state.audit.items, ...payload.items]
            : payload.items,
          nextCursor: payload.nextCursor,
          status: "loaded",
          isLoadingMore: false,
          error: null,
        },
      };
    }

    case actionTypes.FETCH_AUDIT_LOG_FAILED:
      return {
        ...state,
        audit: {
          ...state.audit,
          status: state.audit.status === "loaded" ? "loaded" : "failed",
          isLoadingMore: false,
          error: messageOf(action.payload, "Failed to load the audit log."),
        },
      };

    case actionTypes.SET_AUDIT_FILTERS:
      return {
        ...state,
        audit: {
          ...state.audit,
          filters: {
            ...state.audit.filters,
            ...(action.payload as Partial<AuditFilters>),
          },
          nextCursor: null,
        },
      };

    case actionTypes.TEAM_ACTION_FAILED: {
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

    case actionTypes.CLEAR_TEAM_ISSUES:
      return { ...state, error: null, issues: {} };

    default:
      return state;
  }
}
