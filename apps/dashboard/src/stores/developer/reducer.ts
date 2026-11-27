import { setPending } from "@stores/utils";
import actionTypes from "./actionTypes";
import type {
  ApiKey,
  CliSession,
  DeveloperState,
  Webhook,
  WebhookEvent,
} from "./type";

export const INITIAL_STATE: DeveloperState = {
  apiKeys: [],
  webhooks: [],
  events: [],
  cliSessions: [],
  cliSessionsLoading: false,
  cliSessionsLoaded: false,
  cliSessionsError: null,
  isLoading: false,
  hasLoaded: false,
  pending: {},
  error: null,
  validationIssues: {},
};

interface DeveloperAction {
  type: string;
  payload?: unknown;
  meta?: { pendingKey: string };
}

const replaceById = <T extends { id: string }>(items: T[], next: T): T[] =>
  items.map((item) => (item.id === next.id ? next : item));

export default function developerReducer(
  state: DeveloperState = INITIAL_STATE,
  action: DeveloperAction = { type: "" },
): DeveloperState {
  switch (action.type) {
    case actionTypes.FETCH_DEVELOPER_PENDING:
      return { ...state, isLoading: true, error: null };

    case actionTypes.FETCH_DEVELOPER_SUCCEEDED: {
      const payload = action.payload as {
        apiKeys: ApiKey[];
        webhooks: Webhook[];
        events: WebhookEvent[];
      };
      return {
        ...state,
        apiKeys: payload.apiKeys,
        webhooks: payload.webhooks,
        events: payload.events,
        isLoading: false,
        hasLoaded: true,
        error: null,
      };
    }

    case actionTypes.FETCH_DEVELOPER_FAILED:
      return {
        ...state,
        isLoading: false,
        error:
          (action.payload as { message?: string })?.message ??
          "Failed to load developer settings.",
      };

    case actionTypes.CREATE_API_KEY_REQUESTED:
    case actionTypes.RENAME_API_KEY_REQUESTED:
    case actionTypes.REVOKE_API_KEY_REQUESTED:
    case actionTypes.DELETE_API_KEY_REQUESTED:
    case actionTypes.CREATE_WEBHOOK_REQUESTED:
    case actionTypes.UPDATE_WEBHOOK_REQUESTED:
    case actionTypes.ROTATE_WEBHOOK_SECRET_REQUESTED:
    case actionTypes.DELETE_WEBHOOK_REQUESTED:
    case actionTypes.CREATE_CLI_TOKEN_REQUESTED:
    case actionTypes.REVOKE_CLI_SESSION_REQUESTED:
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, true),
        error: null,
        validationIssues: {},
      };

    case actionTypes.CREATE_API_KEY_SUCCEEDED: {
      const { apiKey } = action.payload as { apiKey: ApiKey };
      return {
        ...state,
        apiKeys: [apiKey, ...state.apiKeys],
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };
    }

    case actionTypes.RENAME_API_KEY_SUCCEEDED:
    case actionTypes.REVOKE_API_KEY_SUCCEEDED:
      return {
        ...state,
        apiKeys: replaceById(state.apiKeys, action.payload as ApiKey),
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };

    case actionTypes.DELETE_API_KEY_SUCCEEDED: {
      const { id } = action.payload as { id: string };
      return {
        ...state,
        apiKeys: state.apiKeys.filter((key) => key.id !== id),
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };
    }

    case actionTypes.CREATE_WEBHOOK_SUCCEEDED: {
      const { webhook } = action.payload as { webhook: Webhook };
      return {
        ...state,
        webhooks: [webhook, ...state.webhooks],
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };
    }

    case actionTypes.UPDATE_WEBHOOK_SUCCEEDED:
      return {
        ...state,
        webhooks: replaceById(state.webhooks, action.payload as Webhook),
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };

    case actionTypes.ROTATE_WEBHOOK_SECRET_SUCCEEDED: {
      const { webhook } = action.payload as { webhook: Webhook };
      return {
        ...state,
        webhooks: replaceById(state.webhooks, webhook),
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };
    }

    case actionTypes.DELETE_WEBHOOK_SUCCEEDED: {
      const { id } = action.payload as { id: string };
      return {
        ...state,
        webhooks: state.webhooks.filter((hook) => hook.id !== id),
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };
    }

    case actionTypes.FETCH_CLI_SESSIONS_PENDING:
      return { ...state, cliSessionsLoading: true, cliSessionsError: null };

    case actionTypes.FETCH_CLI_SESSIONS_SUCCEEDED: {
      const { sessions } = action.payload as { sessions: CliSession[] };
      return {
        ...state,
        cliSessions: sessions,
        cliSessionsLoading: false,
        cliSessionsLoaded: true,
        cliSessionsError: null,
      };
    }

    case actionTypes.FETCH_CLI_SESSIONS_FAILED:
      return {
        ...state,
        cliSessionsLoading: false,
        cliSessionsError:
          (action.payload as { message?: string })?.message ??
          "Failed to load CLI sessions.",
      };

    case actionTypes.CREATE_CLI_TOKEN_SUCCEEDED: {
      const { session } = action.payload as { session: CliSession };
      return {
        ...state,
        cliSessions: [session, ...state.cliSessions],
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };
    }

    case actionTypes.REVOKE_CLI_SESSION_SUCCEEDED: {
      const { id } = action.payload as { id: string };
      return {
        ...state,
        cliSessions: state.cliSessions.filter((session) => session.id !== id),
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };
    }

    case actionTypes.DEVELOPER_ACTION_FAILED: {
      const payload = action.payload as {
        message?: string;
        issues?: Record<string, string>;
      };
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, false),
        error: payload?.message ?? "Something went wrong.",
        validationIssues: payload?.issues ?? {},
      };
    }

    default:
      return state;
  }
}
