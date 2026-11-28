import { setPending } from "@stores/utils";
import actionTypes from "./actionTypes";
import { readEnvironment } from "./persist";
import type {
  Environment,
  ProjectMember,
  ProjectState,
  ProjectSummary,
} from "./type";

export const INITIAL_STATE: ProjectState = {
  organizationId: null,
  items: [],
  activeId: null,
  environment: readEnvironment(),
  status: "idle",
  error: null,
  pending: {},
  issues: {},
  members: [],
  membersStatus: "idle",
  membersError: null,
};

interface ProjectAction {
  type: string;
  payload?: unknown;
  meta?: { pendingKey: string };
}

const upsert = (
  items: ProjectSummary[],
  next: ProjectSummary,
): ProjectSummary[] =>
  items.some((item) => item.id === next.id)
    ? items.map((item) => (item.id === next.id ? next : item))
    : [...items, next];

export default function projectReducer(
  state: ProjectState = INITIAL_STATE,
  action: ProjectAction = { type: "" },
): ProjectState {
  switch (action.type) {
    case actionTypes.FETCH_PROJECTS_PENDING:
      return {
        ...state,
        status: state.status === "loaded" ? "loaded" : "loading",
        error: null,
      };

    case actionTypes.FETCH_PROJECTS_SUCCEEDED: {
      const payload = action.payload as {
        organizationId: string;
        items: ProjectSummary[];
        activeId: string | null;
        environment: Environment;
      };
      return {
        ...state,
        organizationId: payload.organizationId,
        items: payload.items,
        activeId: payload.activeId,
        environment: payload.environment,
        status: "loaded",
        error: null,
      };
    }

    case actionTypes.FETCH_PROJECTS_FAILED:
      return {
        ...state,
        status: state.status === "loaded" ? "loaded" : "failed",
        error:
          (action.payload as { message?: string })?.message ??
          "Failed to load your projects.",
      };

    case actionTypes.ACTIVE_PROJECT_SET:
      return { ...state, activeId: (action.payload as { id: string }).id };

    case actionTypes.ENVIRONMENT_SET:
      return {
        ...state,
        environment: (action.payload as { environment: Environment })
          .environment,
      };

    case actionTypes.CREATE_PROJECT_REQUESTED:
    case actionTypes.UPDATE_PROJECT_REQUESTED:
    case actionTypes.ARCHIVE_PROJECT_REQUESTED:
    case actionTypes.DELETE_PROJECT_REQUESTED:
    case actionTypes.MOVE_RESOURCES_REQUESTED:
    case actionTypes.SET_PROJECT_MEMBER_ROLE_REQUESTED:
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, true),
        error: null,
        issues: {},
      };

    case actionTypes.CREATE_PROJECT_SUCCEEDED:
    case actionTypes.UPDATE_PROJECT_SUCCEEDED:
    case actionTypes.ARCHIVE_PROJECT_SUCCEEDED:
      return {
        ...state,
        items: upsert(state.items, action.payload as ProjectSummary),
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };

    case actionTypes.DELETE_PROJECT_SUCCEEDED: {
      const { id } = action.payload as { id: string };
      return {
        ...state,
        items: state.items.filter((item) => item.id !== id),
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };
    }

    case actionTypes.MOVE_RESOURCES_SUCCEEDED:
    case actionTypes.SET_PROJECT_MEMBER_ROLE_SUCCEEDED:
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };

    case actionTypes.PROJECT_ACTION_FAILED: {
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

    case actionTypes.CLEAR_PROJECT_ISSUES:
      return { ...state, error: null, issues: {} };

    case actionTypes.FETCH_PROJECT_MEMBERS_REQUESTED:
      return {
        ...state,
        membersStatus: state.membersStatus === "loaded" ? "loaded" : "loading",
        membersError: null,
      };

    case actionTypes.FETCH_PROJECT_MEMBERS_SUCCEEDED:
      return {
        ...state,
        members: action.payload as ProjectMember[],
        membersStatus: "loaded",
        membersError: null,
      };

    case actionTypes.FETCH_PROJECT_MEMBERS_FAILED:
      return {
        ...state,
        membersStatus: "failed",
        membersError:
          (action.payload as { message?: string })?.message ??
          "Failed to load project members.",
      };

    default:
      return state;
  }
}
