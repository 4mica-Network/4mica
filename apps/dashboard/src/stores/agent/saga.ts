import { HttpError } from "@4mica/http";
import type { AgentInput } from "@api/agent";
import * as api from "@api/agent";
import i18n from "@i18n";
import { notifyError, notifySuccess } from "@utils/notification";
import { call, put, select, takeEvery, takeLatest } from "redux-saga/effects";
import {
  agentActionFailed,
  batchDeleteAgentsSucceeded,
  createAgentSucceeded,
  deleteAgentSucceeded,
  fetchAgents as fetchAgentsAction,
  fetchAgentsFailed,
  fetchAgentsPending,
  fetchAgentsSucceeded,
  type PendingMeta,
  publishAgentSucceeded,
  updateAgentSucceeded,
} from "./actions";
import actionTypes from "./actionTypes";
import { selectAgentState } from "./selector";
import type { AgentState } from "./type";

interface ApiIssue {
  path: string;
  message: string;
}

const t = (key: string, defaultValue: string) => i18n.t(key, { defaultValue });

const toIssueMap = (error: unknown): Record<string, string> => {
  if (!(error instanceof HttpError)) {
    return {};
  }
  const issues = (error.body as { issues?: ApiIssue[] } | null)?.issues;
  return Array.isArray(issues)
    ? Object.fromEntries(issues.map((i) => [i.path, i.message]))
    : {};
};

const toMessage = (error: unknown, fallback: string): string => {
  if (error instanceof HttpError) {
    if (error.status === 401 || error.status === 403) {
      return t(
        "store.agent.sessionExpired",
        "Your session has expired. Refresh the page and sign in again.",
      );
    }
    return (error.body as { message?: string } | null)?.message ?? fallback;
  }
  return fallback;
};

function* fail(error: unknown, fallback: string, meta: PendingMeta) {
  const message = toMessage(error, fallback);
  yield put(agentActionFailed(message, toIssueMap(error), meta));

  notifyError({
    title: t("store.agent.failedTitle", "Something went wrong"),
    content: message,
  });
}

export function* fetchAgents(): Generator {
  try {
    yield put(fetchAgentsPending());

    const state = (yield select(selectAgentState)) as AgentState;
    const { filters, page, limit } = state;

    const result = (yield call(() =>
      api.getAgents({
        page,
        limit,
        ...(filters.q ? { q: filters.q } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.visibility ? { visibility: filters.visibility } : {}),
        ...(filters.network ? { network: filters.network } : {}),
      }),
    )) as Awaited<ReturnType<typeof api.getAgents>>;

    yield put(fetchAgentsSucceeded(result));
  } catch (error) {
    yield put(
      fetchAgentsFailed(
        toMessage(
          error,
          t("store.agent.fetchFailed", "Couldn't load your agents."),
        ),
      ),
    );
  }
}

export function* createAgent(action: {
  type: string;
  payload: AgentInput;
  meta: PendingMeta;
}): Generator {
  try {
    const agent = (yield call(() =>
      api.createAgent(action.payload),
    )) as Awaited<ReturnType<typeof api.createAgent>>;

    yield put(createAgentSucceeded(agent, action.meta));
    yield put(fetchAgentsAction());

    notifySuccess({
      title: t("store.agent.created", "Agent created"),
      content: t(
        "store.agent.createdBody",
        "Publish it to show it on your public profile with a ready-made integration guide.",
      ),
    });
  } catch (error) {
    yield* fail(error, "Couldn't create that agent.", action.meta);
  }
}

export function* updateAgent(action: {
  type: string;
  payload: { id: string; data: Partial<AgentInput> };
  meta: PendingMeta;
}): Generator {
  try {
    const agent = (yield call(() =>
      api.updateAgent(action.payload.id, action.payload.data),
    )) as Awaited<ReturnType<typeof api.updateAgent>>;

    yield put(updateAgentSucceeded(agent, action.meta));
    yield put(fetchAgentsAction());

    notifySuccess({
      title: t("store.agent.updated", "Agent updated"),
      content: t("store.agent.updatedBody", "Your changes have been saved."),
    });
  } catch (error) {
    yield* fail(error, "Couldn't update that agent.", action.meta);
  }
}

export function* publishAgent(action: {
  type: string;
  payload: { id: string; publish: boolean };
  meta: PendingMeta;
}): Generator {
  const { id, publish } = action.payload;

  try {
    const agent = (yield call(() =>
      publish ? api.publishAgent(id) : api.unpublishAgent(id),
    )) as Awaited<ReturnType<typeof api.publishAgent>>;

    yield put(publishAgentSucceeded(agent, action.meta));
    yield put(fetchAgentsAction());

    notifySuccess({
      title: publish
        ? t("store.agent.published", "Agent published")
        : t("store.agent.unpublished", "Agent hidden"),
      content: publish
        ? t(
            "store.agent.publishedBody",
            "It is now on your public profile, with a copy-paste integration guide.",
          )
        : t(
            "store.agent.unpublishedBody",
            "It is no longer listed on your public profile.",
          ),
    });
  } catch (error) {
    yield* fail(
      error,
      publish ? "Couldn't publish that agent." : "Couldn't hide that agent.",
      action.meta,
    );
  }
}

export function* deleteAgent(action: {
  type: string;
  payload: { id: string };
  meta: PendingMeta;
}): Generator {
  try {
    yield call(() => api.deleteAgent(action.payload.id));
    yield put(deleteAgentSucceeded(action.payload.id, action.meta));
    yield put(fetchAgentsAction());

    notifySuccess({
      title: t("store.agent.deleted", "Agent removed"),
      content: t(
        "store.agent.deletedBody",
        "It is gone from your profile, and its wallet is free to reuse.",
      ),
    });
  } catch (error) {
    yield* fail(error, "Couldn't remove that agent.", action.meta);
  }
}

export function* batchDeleteAgents(action: {
  type: string;
  payload: { ids: string[] };
  meta: PendingMeta;
}): Generator {
  try {
    const result = (yield call(() =>
      api.batchDeleteAgents(action.payload.ids),
    )) as Awaited<ReturnType<typeof api.batchDeleteAgents>>;

    yield put(batchDeleteAgentsSucceeded(result, action.meta));
    yield put(fetchAgentsAction());

    notifySuccess({
      title: t("store.agent.batchDeleted", "Agents removed"),
      content: i18n.t("store.agent.batchDeletedBody", {
        defaultValue: "{{count}} agents were removed.",
        count: result.deleted.length,
      }),
    });
  } catch (error) {
    yield* fail(error, "Couldn't remove those agents.", action.meta);
  }
}

export default [
  takeLatest(actionTypes.FETCH_AGENTS_REQUESTED, fetchAgents),
  takeLatest(actionTypes.SET_AGENT_FILTERS, fetchAgents),
  takeLatest(actionTypes.SET_AGENT_PAGE, fetchAgents),
  takeEvery(actionTypes.CREATE_AGENT_REQUESTED, createAgent),
  takeEvery(actionTypes.UPDATE_AGENT_REQUESTED, updateAgent),
  takeEvery(actionTypes.PUBLISH_AGENT_REQUESTED, publishAgent),
  takeEvery(actionTypes.DELETE_AGENT_REQUESTED, deleteAgent),
  takeEvery(actionTypes.BATCH_DELETE_AGENTS_REQUESTED, batchDeleteAgents),
];
