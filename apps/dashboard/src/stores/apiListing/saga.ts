import { HttpError } from "@4mica/http";
import type { ApiEndpointInput, ApiListingInput } from "@api/apiListing";
import * as api from "@api/apiListing";
import i18n from "@i18n";
import { notifyError, notifySuccess } from "@utils/notification";
import { call, put, select, takeEvery, takeLatest } from "redux-saga/effects";
import {
  apiListingActionFailed,
  batchDeleteApiListingsSucceeded,
  createApiListingSucceeded,
  deleteApiListingSucceeded,
  fetchApiListings as fetchApiListingsAction,
  fetchApiListingsFailed,
  fetchApiListingsPending,
  fetchApiListingsSucceeded,
  type PendingMeta,
  publishApiListingSucceeded,
  replaceApiEndpointsSucceeded,
  updateApiListingSucceeded,
} from "./actions";
import actionTypes from "./actionTypes";
import { selectApiListingState } from "./selector";
import type { ApiListingState } from "./type";

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
        "store.apiListing.sessionExpired",
        "Your session has expired. Refresh the page and sign in again.",
      );
    }
    return (error.body as { message?: string } | null)?.message ?? fallback;
  }
  return fallback;
};

function* fail(error: unknown, fallback: string, meta: PendingMeta) {
  const message = toMessage(error, fallback);
  yield put(apiListingActionFailed(message, toIssueMap(error), meta));

  notifyError({
    title: t("store.apiListing.failedTitle", "Something went wrong"),
    content: message,
  });
}

export function* fetchApiListings(): Generator {
  try {
    yield put(fetchApiListingsPending());

    const state = (yield select(selectApiListingState)) as ApiListingState;
    const { filters, page, limit } = state;

    const result = (yield call(() =>
      api.getApiListings({
        page,
        limit,
        ...(filters.q ? { q: filters.q } : {}),
        ...(filters.visibility ? { visibility: filters.visibility } : {}),
        ...(filters.network ? { network: filters.network } : {}),
      }),
    )) as Awaited<ReturnType<typeof api.getApiListings>>;

    yield put(fetchApiListingsSucceeded(result));
  } catch (error) {
    yield put(
      fetchApiListingsFailed(
        toMessage(
          error,
          t("store.apiListing.fetchFailed", "Couldn't load your APIs."),
        ),
      ),
    );
  }
}

export function* createApiListing(action: {
  type: string;
  payload: ApiListingInput & { endpoints?: ApiEndpointInput[] };
  meta: PendingMeta;
}): Generator {
  try {
    const listing = (yield call(() =>
      api.createApiListing(action.payload),
    )) as Awaited<ReturnType<typeof api.createApiListing>>;

    yield put(createApiListingSucceeded(listing, action.meta));
    yield put(fetchApiListingsAction());

    notifySuccess({
      title: t("store.apiListing.created", "API created"),
      content: t(
        "store.apiListing.createdBody",
        "Publish it to show it on your public profile with a ready-made integration guide.",
      ),
    });
  } catch (error) {
    yield* fail(error, "Couldn't create that API.", action.meta);
  }
}

export function* updateApiListing(action: {
  type: string;
  payload: { id: string; data: Partial<ApiListingInput> };
  meta: PendingMeta;
}): Generator {
  try {
    const listing = (yield call(() =>
      api.updateApiListing(action.payload.id, action.payload.data),
    )) as Awaited<ReturnType<typeof api.updateApiListing>>;

    yield put(updateApiListingSucceeded(listing, action.meta));
    yield put(fetchApiListingsAction());

    notifySuccess({
      title: t("store.apiListing.updated", "API updated"),
      content: t(
        "store.apiListing.updatedBody",
        "Your changes have been saved.",
      ),
    });
  } catch (error) {
    yield* fail(error, "Couldn't update that API.", action.meta);
  }
}

export function* replaceApiEndpoints(action: {
  type: string;
  payload: { id: string; endpoints: ApiEndpointInput[] };
  meta: PendingMeta;
}): Generator {
  try {
    const listing = (yield call(() =>
      api.replaceApiEndpoints(action.payload.id, action.payload.endpoints),
    )) as Awaited<ReturnType<typeof api.replaceApiEndpoints>>;

    yield put(replaceApiEndpointsSucceeded(listing, action.meta));
    yield put(fetchApiListingsAction());

    notifySuccess({
      title: t("store.apiListing.endpointsSaved", "Endpoints saved"),
      content: t(
        "store.apiListing.endpointsSavedBody",
        "Your integration guide now demonstrates the first endpoint.",
      ),
    });
  } catch (error) {
    yield* fail(error, "Couldn't save those endpoints.", action.meta);
  }
}

export function* publishApiListing(action: {
  type: string;
  payload: { id: string; publish: boolean };
  meta: PendingMeta;
}): Generator {
  const { id, publish } = action.payload;

  try {
    const listing = (yield call(() =>
      publish ? api.publishApiListing(id) : api.unpublishApiListing(id),
    )) as Awaited<ReturnType<typeof api.publishApiListing>>;

    yield put(publishApiListingSucceeded(listing, action.meta));
    yield put(fetchApiListingsAction());

    notifySuccess({
      title: publish
        ? t("store.apiListing.published", "API published")
        : t("store.apiListing.unpublished", "API hidden"),
      content: publish
        ? t(
            "store.apiListing.publishedBody",
            "It is now on your public profile, with a copy-paste integration guide.",
          )
        : t(
            "store.apiListing.unpublishedBody",
            "It is no longer listed on your public profile.",
          ),
    });
  } catch (error) {
    yield* fail(
      error,
      publish ? "Couldn't publish that API." : "Couldn't hide that API.",
      action.meta,
    );
  }
}

export function* deleteApiListing(action: {
  type: string;
  payload: { id: string };
  meta: PendingMeta;
}): Generator {
  try {
    yield call(() => api.deleteApiListing(action.payload.id));
    yield put(deleteApiListingSucceeded(action.payload.id, action.meta));
    yield put(fetchApiListingsAction());

    notifySuccess({
      title: t("store.apiListing.deleted", "API removed"),
      content: t(
        "store.apiListing.deletedBody",
        "It is gone from your profile and its address is free to reuse.",
      ),
    });
  } catch (error) {
    yield* fail(error, "Couldn't remove that API.", action.meta);
  }
}

export function* batchDeleteApiListings(action: {
  type: string;
  payload: { ids: string[] };
  meta: PendingMeta;
}): Generator {
  try {
    const result = (yield call(() =>
      api.batchDeleteApiListings(action.payload.ids),
    )) as Awaited<ReturnType<typeof api.batchDeleteApiListings>>;

    yield put(batchDeleteApiListingsSucceeded(result, action.meta));
    yield put(fetchApiListingsAction());

    notifySuccess({
      title: t("store.apiListing.batchDeleted", "APIs removed"),
      content: i18n.t("store.apiListing.batchDeletedBody", {
        defaultValue: "{{count}} APIs were removed.",
        count: result.deleted.length,
      }),
    });
  } catch (error) {
    yield* fail(error, "Couldn't remove those APIs.", action.meta);
  }
}

export default [
  takeLatest(actionTypes.FETCH_API_LISTINGS_REQUESTED, fetchApiListings),
  takeLatest(actionTypes.SET_API_LISTING_FILTERS, fetchApiListings),
  takeLatest(actionTypes.SET_API_LISTING_PAGE, fetchApiListings),
  takeEvery(actionTypes.CREATE_API_LISTING_REQUESTED, createApiListing),
  takeEvery(actionTypes.UPDATE_API_LISTING_REQUESTED, updateApiListing),
  takeEvery(actionTypes.REPLACE_API_ENDPOINTS_REQUESTED, replaceApiEndpoints),
  takeEvery(actionTypes.PUBLISH_API_LISTING_REQUESTED, publishApiListing),
  takeEvery(actionTypes.DELETE_API_LISTING_REQUESTED, deleteApiListing),
  takeEvery(
    actionTypes.BATCH_DELETE_API_LISTINGS_REQUESTED,
    batchDeleteApiListings,
  ),
];
