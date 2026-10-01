import { HttpError } from "@4mica/http";
import type {
  CustomerIdentityInput,
  CustomerIdentityPatch,
  CustomerInput,
} from "@api/customer";
import * as api from "@api/customer";
import i18n from "@i18n";
import { notifyError, notifySuccess } from "@utils/notification";
import {
  all,
  call,
  put,
  select,
  takeEvery,
  takeLatest,
} from "redux-saga/effects";
import {
  batchDeleteCustomersSucceeded,
  createCustomerSucceeded,
  customerActionFailed,
  customerIdentityChanged,
  deleteCustomerSucceeded,
  fetchCustomerActivity as fetchCustomerActivityAction,
  fetchCustomerActivitySucceeded,
  fetchCustomerDetailFailed,
  fetchCustomerDetailPending,
  fetchCustomerDetailSucceeded,
  fetchCustomers as fetchCustomersAction,
  fetchCustomersFailed,
  fetchCustomersPending,
  fetchCustomersSucceeded,
  type PendingMeta,
  updateCustomerSucceeded,
} from "./actions";
import actionTypes from "./actionTypes";
import { selectCustomerState } from "./selector";
import type { CustomerState } from "./type";

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
        "store.customer.sessionExpired",
        "Your session has expired. Refresh the page and sign in again.",
      );
    }
    return (error.body as { message?: string } | null)?.message ?? fallback;
  }
  return fallback;
};

function* fail(error: unknown, fallback: string, meta: PendingMeta) {
  const message = toMessage(error, fallback);
  yield put(customerActionFailed(message, toIssueMap(error), meta));

  notifyError({
    title: t("store.customer.failedTitle", "Something went wrong"),
    content: message,
  });
}

export function* fetchCustomers(): Generator {
  try {
    yield put(fetchCustomersPending());

    const state = (yield select(selectCustomerState)) as CustomerState;
    const { filters, page, limit } = state;

    const result = (yield call(() =>
      api.getCustomers({
        page,
        limit,
        sort: filters.sort,
        ...(filters.q ? { q: filters.q } : {}),
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.network ? { network: filters.network } : {}),
      }),
    )) as Awaited<ReturnType<typeof api.getCustomers>>;

    yield put(fetchCustomersSucceeded(result));
  } catch (error) {
    yield put(
      fetchCustomersFailed(
        toMessage(
          error,
          t("store.customer.fetchFailed", "Couldn't load your customers."),
        ),
      ),
    );
  }
}

export function* fetchCustomerDetail(action: {
  type: string;
  payload: { id: string };
}): Generator {
  const { id } = action.payload;

  try {
    yield put(fetchCustomerDetailPending());

    const [customer, overview, breakdown] = (yield all([
      call(() => api.getCustomer(id)),
      call(() => api.getCustomerOverview(id)),
      call(() => api.getCustomerBreakdown(id)),
    ])) as [
      Awaited<ReturnType<typeof api.getCustomer>>,
      Awaited<ReturnType<typeof api.getCustomerOverview>>,
      Awaited<ReturnType<typeof api.getCustomerBreakdown>>,
    ];

    yield put(
      fetchCustomerDetailSucceeded({
        customer,
        overview,
        breakdown: breakdown.items,
      }),
    );
    yield put(fetchCustomerActivityAction(id));
  } catch (error) {
    yield put(
      fetchCustomerDetailFailed(
        toMessage(
          error,
          t("store.customer.detailFailed", "Couldn't load that customer."),
        ),
      ),
    );
  }
}

export function* fetchCustomerActivity(action: {
  type: string;
  payload: { id: string };
}): Generator {
  try {
    const state = (yield select(selectCustomerState)) as CustomerState;
    const { page, limit } = state.detail.activity;

    const result = (yield call(() =>
      api.getCustomerActivity(action.payload.id, { page, limit }),
    )) as Awaited<ReturnType<typeof api.getCustomerActivity>>;

    yield put(fetchCustomerActivitySucceeded(result));
  } catch {}
}

export function* createCustomer(action: {
  type: string;
  payload: CustomerInput;
  meta: PendingMeta;
}): Generator {
  try {
    const customer = (yield call(() =>
      api.createCustomer(action.payload),
    )) as Awaited<ReturnType<typeof api.createCustomer>>;

    yield put(createCustomerSucceeded(customer, action.meta));
    yield put(fetchCustomersAction());

    notifySuccess({
      title: t("store.customer.created", "Customer added"),
      content: t(
        "store.customer.createdBody",
        "Attach a wallet to see everything that address has already paid you.",
      ),
    });
  } catch (error) {
    yield* fail(error, "Couldn't add that customer.", action.meta);
  }
}

export function* updateCustomer(action: {
  type: string;
  payload: { id: string; data: Partial<CustomerInput> };
  meta: PendingMeta;
}): Generator {
  try {
    const customer = (yield call(() =>
      api.updateCustomer(action.payload.id, action.payload.data),
    )) as Awaited<ReturnType<typeof api.updateCustomer>>;

    yield put(updateCustomerSucceeded(customer, action.meta));

    notifySuccess({
      title: t("store.customer.updated", "Customer updated"),
      content: t("store.customer.updatedBody", "Your changes have been saved."),
    });
  } catch (error) {
    yield* fail(error, "Couldn't update that customer.", action.meta);
  }
}

export function* deleteCustomer(action: {
  type: string;
  payload: { id: string };
  meta: PendingMeta;
}): Generator {
  try {
    yield call(() => api.deleteCustomer(action.payload.id));
    yield put(deleteCustomerSucceeded(action.payload.id, action.meta));
    yield put(fetchCustomersAction());

    notifySuccess({
      title: t("store.customer.deleted", "Customer removed"),
      content: t(
        "store.customer.deletedBody",
        "Their payment history stays on your payments ledger.",
      ),
    });
  } catch (error) {
    yield* fail(error, "Couldn't remove that customer.", action.meta);
  }
}

export function* batchDeleteCustomers(action: {
  type: string;
  payload: { ids: string[] };
  meta: PendingMeta;
}): Generator {
  try {
    const result = (yield call(() =>
      api.batchDeleteCustomers(action.payload.ids),
    )) as Awaited<ReturnType<typeof api.batchDeleteCustomers>>;

    yield put(batchDeleteCustomersSucceeded(result, action.meta));
    yield put(fetchCustomersAction());

    notifySuccess({
      title: t("store.customer.batchDeleted", "Customers removed"),
      content: i18n.t("store.customer.batchDeletedBody", {
        defaultValue: "{{count}} customers were removed.",
        count: result.deleted.length,
      }),
    });
  } catch (error) {
    yield* fail(error, "Couldn't remove those customers.", action.meta);
  }
}

export function* addCustomerIdentity(action: {
  type: string;
  payload: { id: string; data: CustomerIdentityInput };
  meta: PendingMeta;
}): Generator {
  try {
    const customer = (yield call(() =>
      api.addCustomerIdentity(action.payload.id, action.payload.data),
    )) as Awaited<ReturnType<typeof api.addCustomerIdentity>>;

    yield put(customerIdentityChanged(customer, action.meta));
    yield put(fetchCustomerActivityAction(action.payload.id));

    notifySuccess({
      title: t("store.customer.identityAdded", "Identity attached"),
      content: t(
        "store.customer.identityAddedBody",
        "Any payments already made from it now count towards this customer.",
      ),
    });
  } catch (error) {
    yield* fail(error, "Couldn't attach that identity.", action.meta);
  }
}

export function* updateCustomerIdentity(action: {
  type: string;
  payload: { id: string; identityId: string; data: CustomerIdentityPatch };
  meta: PendingMeta;
}): Generator {
  try {
    const customer = (yield call(() =>
      api.updateCustomerIdentity(
        action.payload.id,
        action.payload.identityId,
        action.payload.data,
      ),
    )) as Awaited<ReturnType<typeof api.updateCustomerIdentity>>;

    yield put(customerIdentityChanged(customer, action.meta));
    yield put(fetchCustomerActivityAction(action.payload.id));

    notifySuccess({
      title: t("store.customer.identityUpdated", "Identity updated"),
      content: t(
        "store.customer.identityUpdatedBody",
        "Spend was recalculated for the dates you set.",
      ),
    });
  } catch (error) {
    yield* fail(error, "Couldn't update that identity.", action.meta);
  }
}

export function* removeCustomerIdentity(action: {
  type: string;
  payload: { id: string; identityId: string };
  meta: PendingMeta;
}): Generator {
  try {
    yield call(() =>
      api.removeCustomerIdentity(action.payload.id, action.payload.identityId),
    );

    const customer = (yield call(() =>
      api.getCustomer(action.payload.id),
    )) as Awaited<ReturnType<typeof api.getCustomer>>;

    yield put(customerIdentityChanged(customer, action.meta));
    yield put(fetchCustomerActivityAction(action.payload.id));

    notifySuccess({
      title: t("store.customer.identityRemoved", "Identity detached"),
      content: t(
        "store.customer.identityRemovedBody",
        "That address is free to map to another customer.",
      ),
    });
  } catch (error) {
    yield* fail(error, "Couldn't detach that identity.", action.meta);
  }
}

export function* refetchActivity(action: {
  type: string;
  payload: { id: string };
}): Generator {
  yield* fetchCustomerActivity(action);
}

export default [
  takeLatest(actionTypes.FETCH_CUSTOMERS_REQUESTED, fetchCustomers),
  takeLatest(actionTypes.SET_CUSTOMER_FILTERS, fetchCustomers),
  takeLatest(actionTypes.SET_CUSTOMER_PAGE, fetchCustomers),
  takeLatest(actionTypes.FETCH_CUSTOMER_DETAIL_REQUESTED, fetchCustomerDetail),
  takeLatest(
    actionTypes.FETCH_CUSTOMER_ACTIVITY_REQUESTED,
    fetchCustomerActivity,
  ),
  takeLatest(actionTypes.SET_CUSTOMER_ACTIVITY_PAGE, refetchActivity),
  takeEvery(actionTypes.CREATE_CUSTOMER_REQUESTED, createCustomer),
  takeEvery(actionTypes.UPDATE_CUSTOMER_REQUESTED, updateCustomer),
  takeEvery(actionTypes.DELETE_CUSTOMER_REQUESTED, deleteCustomer),
  takeEvery(actionTypes.BATCH_DELETE_CUSTOMERS_REQUESTED, batchDeleteCustomers),
  takeEvery(actionTypes.ADD_CUSTOMER_IDENTITY_REQUESTED, addCustomerIdentity),
  takeEvery(
    actionTypes.UPDATE_CUSTOMER_IDENTITY_REQUESTED,
    updateCustomerIdentity,
  ),
  takeEvery(
    actionTypes.REMOVE_CUSTOMER_IDENTITY_REQUESTED,
    removeCustomerIdentity,
  ),
];
