import actionTypes from "./actionTypes";
import type {
  ApiKey,
  DeveloperState,
  RevealedSecret,
  Webhook,
  WebhookEvent,
} from "./type";

export const INITIAL_STATE: DeveloperState = {
  apiKeys: [],
  webhooks: [],
  events: [],
  revealed: null,
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

const setPending = (
  pending: Record<string, boolean>,
  key: string | undefined,
  value: boolean,
): Record<string, boolean> => {
  if (!key) {
    return pending;
  }
  const next = { ...pending };
  if (value) {
    next[key] = true;
  } else {
    delete next[key];
  }
  return next;
};

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
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, true),
        error: null,
        validationIssues: {},
      };

    case actionTypes.CREATE_API_KEY_SUCCEEDED: {
      const { apiKey, revealed } = action.payload as {
        apiKey: ApiKey;
        revealed: RevealedSecret;
      };
      return {
        ...state,
        apiKeys: [apiKey, ...state.apiKeys],
        revealed,
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
      const { webhook, revealed } = action.payload as {
        webhook: Webhook;
        revealed: RevealedSecret;
      };
      return {
        ...state,
        webhooks: [webhook, ...state.webhooks],
        revealed,
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
      const { webhook, revealed } = action.payload as {
        webhook: Webhook;
        revealed: RevealedSecret;
      };
      return {
        ...state,
        webhooks: replaceById(state.webhooks, webhook),
        revealed,
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

    case actionTypes.DISMISS_REVEALED_SECRET:
      return { ...state, revealed: null };

    default:
      return state;
  }
}
