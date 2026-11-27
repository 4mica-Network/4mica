import type { Permission } from "@stores/organization/type";
import { setPending } from "@stores/utils";
import type { SecurityOpOutcome } from "./actions";
import actionTypes from "./actionTypes";
import type {
  Collection,
  ComplianceReport,
  SecurityFailure,
  SecurityResource,
  SecuritySettings,
  SecurityState,
} from "./type";

const empty = <T>(): Collection<T> => ({
  items: [],
  status: "idle",
  error: null,
});

export const INITIAL_STATE: SecurityState = {
  domains: empty(),
  sso: empty(),
  roles: empty(),
  scimTokens: empty(),
  scimGroups: empty(),
  streams: empty(),
  assignablePermissions: [],
  settings: null,
  settingsStatus: "idle",
  report: null,
  reportStatus: "idle",
  reportError: null,
  pending: {},
  failure: null,
};

interface SecurityAction {
  type: string;
  payload?: unknown;
  meta?: { pendingKey: string };
}

const messageOf = (payload: unknown, fallback: string) =>
  (payload as { message?: string } | undefined)?.message ?? fallback;

type AnyItem = { id: string };

const updateCollection = (
  state: SecurityState,
  resource: SecurityResource,
  update: (collection: Collection<AnyItem>) => Collection<AnyItem>,
): SecurityState => ({
  ...state,
  [resource]: update(state[resource] as Collection<AnyItem>),
});

const upsert = (items: AnyItem[], item: AnyItem): AnyItem[] =>
  items.some((current) => current.id === item.id)
    ? items.map((current) => (current.id === item.id ? item : current))
    : [item, ...items];

export default function securityReducer(
  state: SecurityState = INITIAL_STATE,
  action: SecurityAction = { type: "" },
): SecurityState {
  switch (action.type) {
    case actionTypes.FETCH_SECURITY_PENDING: {
      const { resource } = action.payload as { resource: SecurityResource };
      return updateCollection(state, resource, (collection) => ({
        ...collection,
        status: collection.status === "loaded" ? "loaded" : "loading",
        error: null,
      }));
    }

    case actionTypes.FETCH_SECURITY_SUCCEEDED: {
      const { resource, items, assignablePermissions } = action.payload as {
        resource: SecurityResource;
        items: AnyItem[];
        assignablePermissions?: Permission[];
      };
      const next = updateCollection(state, resource, () => ({
        items,
        status: "loaded",
        error: null,
      }));
      return assignablePermissions ? { ...next, assignablePermissions } : next;
    }

    case actionTypes.FETCH_SECURITY_FAILED: {
      const { resource } = action.payload as { resource: SecurityResource };
      return updateCollection(state, resource, (collection) => ({
        ...collection,
        status: collection.status === "loaded" ? "loaded" : "failed",
        error: messageOf(action.payload, "Failed to load."),
      }));
    }

    case actionTypes.FETCH_SETTINGS_PENDING:
      return {
        ...state,
        settingsStatus:
          state.settingsStatus === "loaded" ? "loaded" : "loading",
      };

    case actionTypes.FETCH_SETTINGS_SUCCEEDED:
      return {
        ...state,
        settings: action.payload as SecuritySettings,
        settingsStatus: "loaded",
      };

    case actionTypes.FETCH_SETTINGS_FAILED:
      return {
        ...state,
        settingsStatus: state.settingsStatus === "loaded" ? "loaded" : "failed",
      };

    case actionTypes.FETCH_REPORT_PENDING:
      return { ...state, reportStatus: "loading", reportError: null };

    case actionTypes.FETCH_REPORT_SUCCEEDED:
      return {
        ...state,
        report: action.payload as ComplianceReport,
        reportStatus: "loaded",
        reportError: null,
      };

    case actionTypes.FETCH_REPORT_FAILED:
      return {
        ...state,
        reportStatus: state.report ? "loaded" : "failed",
        reportError: messageOf(action.payload, "Failed to load the report."),
      };

    case actionTypes.SAVE_SETTINGS_REQUESTED:
    case actionTypes.SECURITY_OP_REQUESTED:
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, true),
        failure: null,
      };

    case actionTypes.SAVE_SETTINGS_SUCCEEDED:
      return {
        ...state,
        settings: action.payload as SecuritySettings,
        settingsStatus: "loaded",
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };

    case actionTypes.SECURITY_OP_SUCCEEDED: {
      const { resource, item, removedId } = action.payload as SecurityOpOutcome;
      const next = updateCollection(state, resource, (collection) => ({
        ...collection,
        items: removedId
          ? collection.items.filter((current) => current.id !== removedId)
          : item
            ? upsert(collection.items, item as AnyItem)
            : collection.items,
      }));
      return {
        ...next,
        pending: setPending(state.pending, action.meta?.pendingKey, false),
      };
    }

    case actionTypes.SECURITY_OP_FAILED:
      return {
        ...state,
        pending: setPending(state.pending, action.meta?.pendingKey, false),
        failure: {
          ...(action.payload as Omit<SecurityFailure, "key">),
          key: action.meta?.pendingKey ?? "",
        },
      };

    case actionTypes.CLEAR_SECURITY_FAILURE:
      return { ...state, failure: null };

    default:
      return state;
  }
}
