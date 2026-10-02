import type {
  CustomerCouponInput,
  CustomerCouponPatch,
  CustomerCreditInput,
  CustomerIdentityInput,
  CustomerIdentityPatch,
  CustomerInput,
  CustomerPolicyInput,
  CustomerStatusInput,
} from "@api/customer";
import actionTypes from "./actionTypes";
import type {
  Customer,
  CustomerCoupon,
  CustomerCreditBalance,
  CustomerCreditEntry,
  CustomerFilters,
  CustomerOverview,
  Payment,
} from "./type";

export interface PendingMeta {
  pendingKey: string;
}

const rowKey = (id: string) => `customer:${id}`;
const statusKey = (id: string) => `customerStatus:${id}`;
const policyKey = (id: string) => `customerPolicy:${id}`;
const resetKey = (id: string) => `customerUsageReset:${id}`;

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

export const fetchCustomerCoupons = (id: string) => ({
  type: actionTypes.FETCH_CUSTOMER_COUPONS_REQUESTED,
  payload: { id },
});

export const fetchCustomerCouponsSucceeded = (items: CustomerCoupon[]) => ({
  type: actionTypes.FETCH_CUSTOMER_COUPONS_SUCCEEDED,
  payload: { items },
});

export const createCustomerCoupon = (payload: {
  id: string;
  data: CustomerCouponInput;
}) => ({
  type: actionTypes.CREATE_CUSTOMER_COUPON_REQUESTED,
  payload,
  meta: { pendingKey: "customerCoupon" },
});

export const updateCustomerCoupon = (payload: {
  id: string;
  couponId: string;
  data: CustomerCouponPatch;
}) => ({
  type: actionTypes.UPDATE_CUSTOMER_COUPON_REQUESTED,
  payload,
  meta: { pendingKey: `customerCoupon:${payload.couponId}` },
});

export const deleteCustomerCoupon = (payload: {
  id: string;
  couponId: string;
}) => ({
  type: actionTypes.DELETE_CUSTOMER_COUPON_REQUESTED,
  payload,
  meta: { pendingKey: `customerCoupon:${payload.couponId}` },
});

export const fetchCustomerCredit = (id: string) => ({
  type: actionTypes.FETCH_CUSTOMER_CREDIT_REQUESTED,
  payload: { id },
});

export const fetchCustomerCreditSucceeded = (payload: {
  balance: CustomerCreditBalance;
  items: CustomerCreditEntry[];
}) => ({
  type: actionTypes.FETCH_CUSTOMER_CREDIT_SUCCEEDED,
  payload,
});

export const grantCustomerCredit = (payload: {
  id: string;
  data: CustomerCreditInput;
}) => ({
  type: actionTypes.GRANT_CUSTOMER_CREDIT_REQUESTED,
  payload,
  meta: { pendingKey: "customerCredit" },
});

export const zeroCustomerCredit = (payload: { id: string }) => ({
  type: actionTypes.ZERO_CUSTOMER_CREDIT_REQUESTED,
  payload,
  meta: { pendingKey: "customerCreditZero" },
});

export const setCustomerPolicy = (payload: {
  id: string;
  data: CustomerPolicyInput;
}) => ({
  type: actionTypes.SET_CUSTOMER_POLICY_REQUESTED,
  payload,
  meta: { pendingKey: policyKey(payload.id) },
});

export const setCustomerPolicySucceeded = (
  customer: Customer,
  meta: PendingMeta,
) => ({
  type: actionTypes.SET_CUSTOMER_POLICY_SUCCEEDED,
  payload: customer,
  meta,
});

export const resetCustomerUsage = (payload: { id: string }) => ({
  type: actionTypes.RESET_CUSTOMER_USAGE_REQUESTED,
  payload,
  meta: { pendingKey: resetKey(payload.id) },
});

export const setCustomerStatus = (payload: {
  id: string;
  data: CustomerStatusInput;
}) => ({
  type: actionTypes.SET_CUSTOMER_STATUS_REQUESTED,
  payload,
  meta: { pendingKey: statusKey(payload.id) },
});

export const setCustomerStatusSucceeded = (
  customer: Customer,
  meta: PendingMeta,
) => ({
  type: actionTypes.SET_CUSTOMER_STATUS_SUCCEEDED,
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
