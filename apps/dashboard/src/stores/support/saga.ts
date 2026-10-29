import { HttpError } from "@4mica/http";
import * as api from "@api/support";
import i18n from "@i18n";
import { definedParams, type PendingMeta } from "@stores/utils";
import { toMessage as messageOf, toIssueMap } from "@utils/http-errors";
import { call, put, select, takeEvery, takeLatest } from "redux-saga/effects";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  batchDeleteSupportRequestsSucceeded,
  createSupportRequestSucceeded,
  deleteSupportRequestSucceeded,
  fetchSupportRequest as fetchSupportRequestAction,
  fetchSupportRequestFailed,
  fetchSupportRequestSucceeded,
  fetchSupportRequests as fetchSupportRequestsAction,
  fetchSupportRequestsFailed,
  fetchSupportRequestsPending,
  fetchSupportRequestsSucceeded,
  replySupportRequestSucceeded,
  supportActionFailed,
  updateSupportRequestSucceeded,
} from "./actions";
import actionTypes from "./actionTypes";
import { selectSupportState } from "./selector";
import type {
  SupportRequestInput,
  SupportRequestPatch,
  SupportState,
} from "./type";

const t = (key: string, defaultValue: string) => i18n.t(key, { defaultValue });

const toMessage = (error: unknown, fallback: string): string =>
  error instanceof HttpError
    ? messageOf(error, fallback, {
        sessionExpired: t(
          "store.support.sessionExpired",
          "Your session has expired. Refresh the page and sign in again.",
        ),
      })
    : fallback;

function* fail(error: unknown, fallback: string, meta: PendingMeta) {
  const message = toMessage(error, fallback);
  yield put(supportActionFailed(message, toIssueMap(error), meta));
  notifyError({
    title: t("store.support.failedTitle", "Something went wrong"),
    content: message,
  });
}

export function* fetchSupportRequests(): Generator {
  try {
    yield put(fetchSupportRequestsPending());

    const state = (yield select(selectSupportState)) as SupportState;
    const { filters, page, limit } = state;

    const result = (yield call(() =>
      api.getSupportRequests({
        page,
        limit,
        ...definedParams({
          q: filters.q,
          status: filters.status,
          category: filters.category,
        }),
      }),
    )) as Awaited<ReturnType<typeof api.getSupportRequests>>;

    yield put(fetchSupportRequestsSucceeded(result));
  } catch (error) {
    yield put(
      fetchSupportRequestsFailed(
        toMessage(
          error,
          t("store.support.fetchFailed", "Couldn't load your requests."),
        ),
      ),
    );
  }
}

export function* fetchSupportRequest(action: {
  type: string;
  payload: { id: string };
}): Generator {
  try {
    const request = (yield call(() =>
      api.getSupportRequest(action.payload.id),
    )) as Awaited<ReturnType<typeof api.getSupportRequest>>;

    yield put(fetchSupportRequestSucceeded(request));
  } catch (error) {
    yield put(
      fetchSupportRequestFailed(
        toMessage(
          error,
          t("store.support.fetchOneFailed", "Couldn't load that request."),
        ),
      ),
    );
  }
}

export function* createSupportRequest(action: {
  type: string;
  payload: SupportRequestInput;
  meta: PendingMeta;
}): Generator {
  try {
    const request = (yield call(() =>
      api.createSupportRequest(action.payload),
    )) as Awaited<ReturnType<typeof api.createSupportRequest>>;

    yield put(createSupportRequestSucceeded(request, action.meta));
    yield put(fetchSupportRequestsAction());

    notifySuccess({
      title: i18n.t("store.support.created", {
        defaultValue: "Request #{{number}} sent",
        number: request.number,
      }),
      content: t(
        "store.support.createdBody",
        "We'll reply on this request. You can add details at any time.",
      ),
    });
  } catch (error) {
    yield* fail(error, "Couldn't send your request.", action.meta);
  }
}

export function* updateSupportRequest(action: {
  type: string;
  payload: { id: string; data: SupportRequestPatch };
  meta: PendingMeta;
}): Generator {
  const { id, data } = action.payload;

  try {
    const request = (yield call(() =>
      api.updateSupportRequest(id, data),
    )) as Awaited<ReturnType<typeof api.updateSupportRequest>>;

    yield put(updateSupportRequestSucceeded(request, action.meta));
    yield put(fetchSupportRequestsAction());

    notifySuccess(
      data.status === "CLOSED"
        ? {
            title: t("store.support.closed", "Request closed"),
            content: t(
              "store.support.closedBody",
              "Reopen it from the request if you need us again.",
            ),
          }
        : data.status === "OPEN"
          ? {
              title: t("store.support.reopened", "Request reopened"),
              content: t(
                "store.support.reopenedBody",
                "It's back in the queue for our team.",
              ),
            }
          : {
              title: t("store.support.updated", "Request updated"),
              content: t(
                "store.support.updatedBody",
                "Your changes have been saved.",
              ),
            },
    );
  } catch (error) {
    yield* fail(error, "Couldn't update that request.", action.meta);
  }
}

export function* replySupportRequest(action: {
  type: string;
  payload: { id: string; body: string };
  meta: PendingMeta;
}): Generator {
  const { id, body } = action.payload;

  try {
    const message = (yield call(() =>
      api.replySupportRequest(id, body),
    )) as Awaited<ReturnType<typeof api.replySupportRequest>>;

    yield put(replySupportRequestSucceeded({ id, message }, action.meta));
    yield put(fetchSupportRequestAction(id));
    yield put(fetchSupportRequestsAction());
  } catch (error) {
    yield* fail(error, "Couldn't send your reply.", action.meta);
  }
}

export function* deleteSupportRequest(action: {
  type: string;
  payload: { id: string };
  meta: PendingMeta;
}): Generator {
  try {
    yield call(() => api.deleteSupportRequest(action.payload.id));
    yield put(deleteSupportRequestSucceeded(action.payload.id, action.meta));
    yield put(fetchSupportRequestsAction());

    notifySuccess({
      title: t("store.support.deleted", "Request deleted"),
      content: t(
        "store.support.deletedBody",
        "It and its conversation were removed.",
      ),
    });
  } catch (error) {
    yield* fail(error, "Couldn't delete that request.", action.meta);
  }
}

export function* batchDeleteSupportRequests(action: {
  type: string;
  payload: { ids: string[] };
  meta: PendingMeta;
}): Generator {
  try {
    const result = (yield call(() =>
      api.batchDeleteSupportRequests(action.payload.ids),
    )) as Awaited<ReturnType<typeof api.batchDeleteSupportRequests>>;

    yield put(batchDeleteSupportRequestsSucceeded(result, action.meta));
    yield put(fetchSupportRequestsAction());

    notifySuccess({
      title: t("store.support.batchDeleted", "Requests deleted"),
      content: i18n.t("store.support.batchDeletedBody", {
        defaultValue: "{{count}} requests were deleted.",
        count: result.deleted.length,
      }),
    });
  } catch (error) {
    yield* fail(error, "Couldn't delete those requests.", action.meta);
  }
}

export default [
  takeLatest(
    actionTypes.FETCH_SUPPORT_REQUESTS_REQUESTED,
    fetchSupportRequests,
  ),
  takeLatest(actionTypes.SET_SUPPORT_FILTERS, fetchSupportRequests),
  takeLatest(actionTypes.SET_SUPPORT_PAGE, fetchSupportRequests),
  takeLatest(actionTypes.FETCH_SUPPORT_REQUEST_REQUESTED, fetchSupportRequest),
  takeEvery(actionTypes.CREATE_SUPPORT_REQUEST_REQUESTED, createSupportRequest),
  takeEvery(actionTypes.UPDATE_SUPPORT_REQUEST_REQUESTED, updateSupportRequest),
  takeEvery(actionTypes.REPLY_SUPPORT_REQUEST_REQUESTED, replySupportRequest),
  takeEvery(actionTypes.DELETE_SUPPORT_REQUEST_REQUESTED, deleteSupportRequest),
  takeEvery(
    actionTypes.BATCH_DELETE_SUPPORT_REQUESTS_REQUESTED,
    batchDeleteSupportRequests,
  ),
];
