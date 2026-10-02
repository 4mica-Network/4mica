import type {
  CustomerIdentityInput,
  CustomerIdentityPatch,
  CustomerInput,
} from "@api/customer";
import actionTypes from "./actionTypes";
import type {
  Customer,
  CustomerFilters,
  CustomerOverview,
  Payment,
} from "./type";

export interface PendingMeta {
  pendingKey: string;
}

const rowKey = (id: string) => `customer:${id}`;

export const fetchCustomers = () => ({
  type: actionTypes.FETCH_CUSTOMERS_REQUESTED,
});

export const fetchCustomersPending = () => ({
  type: actionTypes.FETCH_CUSTOMERS_PENDING,
});

export const fetchCustomersSucceeded = (payload: {
  items: Customer[];
  total: number;
  page: number;
  limit: number;
}) => ({
  type: actionTypes.FETCH_CUSTOMERS_SUCCEEDED,
  payload,
});

export const fetchCustomersFailed = (message: string) => ({
  type: actionTypes.FETCH_CUSTOMERS_FAILED,
  payload: { message },
});

export const createCustomer = (payload: CustomerInput) => ({
  type: actionTypes.CREATE_CUSTOMER_REQUESTED,
  payload,
  meta: { pendingKey: "createCustomer" },
});

export const createCustomerSucceeded = (
  customer: Customer,
  meta: PendingMeta,
) => ({
  type: actionTypes.CREATE_CUSTOMER_SUCCEEDED,
  payload: customer,
  meta,
});

export const updateCustomer = (payload: {
  id: string;
  data: Partial<CustomerInput>;
}) => ({
  type: actionTypes.UPDATE_CUSTOMER_REQUESTED,
  payload,
  meta: { pendingKey: rowKey(payload.id) },
});

export const updateCustomerSucceeded = (
  customer: Customer,
  meta: PendingMeta,
) => ({
  type: actionTypes.UPDATE_CUSTOMER_SUCCEEDED,
  payload: customer,
  meta,
});

export const deleteCustomer = (payload: { id: string }) => ({
  type: actionTypes.DELETE_CUSTOMER_REQUESTED,
  payload,
  meta: { pendingKey: rowKey(payload.id) },
});

export const deleteCustomerSucceeded = (id: string, meta: PendingMeta) => ({
  type: actionTypes.DELETE_CUSTOMER_SUCCEEDED,
  payload: { id },
  meta,
});

export const batchDeleteCustomers = (payload: { ids: string[] }) => ({
  type: actionTypes.BATCH_DELETE_CUSTOMERS_REQUESTED,
  payload,
  meta: { pendingKey: "batchDeleteCustomers" },
});

export const batchDeleteCustomersSucceeded = (
  payload: { deleted: string[]; notFound: string[] },
  meta: PendingMeta,
) => ({
  type: actionTypes.BATCH_DELETE_CUSTOMERS_SUCCEEDED,
  payload,
  meta,
});

export const addCustomerIdentity = (payload: {
  id: string;
  data: CustomerIdentityInput;
}) => ({
  type: actionTypes.ADD_CUSTOMER_IDENTITY_REQUESTED,
  payload,
  meta: { pendingKey: "customerIdentity" },
});

export const updateCustomerIdentity = (payload: {
  id: string;
  identityId: string;
  data: CustomerIdentityPatch;
}) => ({
  type: actionTypes.UPDATE_CUSTOMER_IDENTITY_REQUESTED,
  payload,
  meta: { pendingKey: `customerIdentity:${payload.identityId}` },
});

export const removeCustomerIdentity = (payload: {
  id: string;
  identityId: string;
}) => ({
  type: actionTypes.REMOVE_CUSTOMER_IDENTITY_REQUESTED,
  payload,
  meta: { pendingKey: `customerIdentity:${payload.identityId}` },
});

export const customerIdentityChanged = (
  customer: Customer,
  meta: PendingMeta,
) => ({
  type: actionTypes.CUSTOMER_IDENTITY_CHANGED,
  payload: customer,
  meta,
});

export const fetchCustomerDetail = (id: string) => ({
  type: actionTypes.FETCH_CUSTOMER_DETAIL_REQUESTED,
  payload: { id },
});

export const fetchCustomerDetailPending = () => ({
  type: actionTypes.FETCH_CUSTOMER_DETAIL_PENDING,
});

export const fetchCustomerDetailSucceeded = (payload: {
  customer: Customer;
  overview: CustomerOverview;
}) => ({
  type: actionTypes.FETCH_CUSTOMER_DETAIL_SUCCEEDED,
  payload,
});

export const fetchCustomerDetailFailed = (message: string) => ({
  type: actionTypes.FETCH_CUSTOMER_DETAIL_FAILED,
  payload: { message },
});

export const fetchCustomerActivity = (id: string) => ({
  type: actionTypes.FETCH_CUSTOMER_ACTIVITY_REQUESTED,
  payload: { id },
});

export const fetchCustomerActivitySucceeded = (payload: {
  items: Payment[];
  total: number;
  page: number;
  limit: number;
}) => ({
  type: actionTypes.FETCH_CUSTOMER_ACTIVITY_SUCCEEDED,
  payload,
});

export const setCustomerActivityPage = (id: string, page: number) => ({
  type: actionTypes.SET_CUSTOMER_ACTIVITY_PAGE,
  payload: { id, page },
});

export const setCustomerFilters = (payload: Partial<CustomerFilters>) => ({
  type: actionTypes.SET_CUSTOMER_FILTERS,
  payload,
});

export const setCustomerPage = (page: number) => ({
  type: actionTypes.SET_CUSTOMER_PAGE,
  payload: { page },
});

export const toggleCustomerSelected = (id: string) => ({
  type: actionTypes.TOGGLE_CUSTOMER_SELECTED,
  payload: { id },
});

export const setCustomerSelection = (ids: string[]) => ({
  type: actionTypes.SET_CUSTOMER_SELECTION,
  payload: { ids },
});

export const clearCustomerSelection = () => ({
  type: actionTypes.CLEAR_CUSTOMER_SELECTION,
});

export const customerActionFailed = (
  message: string,
  issues: Record<string, string>,
  meta: PendingMeta,
) => ({
  type: actionTypes.CUSTOMER_ACTION_FAILED,
  payload: { message, issues },
  meta,
});

export const clearCustomerIssues = () => ({
  type: actionTypes.CLEAR_CUSTOMER_ISSUES,
});

export const resetCustomerDetail = () => ({
  type: actionTypes.RESET_CUSTOMER_DETAIL,
});
