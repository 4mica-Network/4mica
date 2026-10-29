import type { PendingMeta } from "@stores/utils";
import actionTypes from "./actionTypes";
import type {
  SupportFilters,
  SupportMessage,
  SupportRequest,
  SupportRequestDetail,
  SupportRequestInput,
  SupportRequestListResponse,
  SupportRequestPatch,
} from "./type";

export const supportPendingKeys = {
  create: "createSupportRequest",
  row: (id: string) => `support:${id}`,
  reply: (id: string) => `supportReply:${id}`,
  batchDelete: "batchDeleteSupportRequests",
} as const;

export const fetchSupportRequests = () => ({
  type: actionTypes.FETCH_SUPPORT_REQUESTS_REQUESTED,
});

export const fetchSupportRequestsPending = () => ({
  type: actionTypes.FETCH_SUPPORT_REQUESTS_PENDING,
});

export const fetchSupportRequestsSucceeded = (
  payload: SupportRequestListResponse,
) => ({
  type: actionTypes.FETCH_SUPPORT_REQUESTS_SUCCEEDED,
  payload,
});

export const fetchSupportRequestsFailed = (message: string) => ({
  type: actionTypes.FETCH_SUPPORT_REQUESTS_FAILED,
  payload: { message },
});

export const fetchSupportRequest = (id: string) => ({
  type: actionTypes.FETCH_SUPPORT_REQUEST_REQUESTED,
  payload: { id },
});

export const fetchSupportRequestSucceeded = (
  payload: SupportRequestDetail,
) => ({
  type: actionTypes.FETCH_SUPPORT_REQUEST_SUCCEEDED,
  payload,
});

export const fetchSupportRequestFailed = (message: string) => ({
  type: actionTypes.FETCH_SUPPORT_REQUEST_FAILED,
  payload: { message },
});

export const resetSupportRequest = () => ({
  type: actionTypes.RESET_SUPPORT_REQUEST,
});

export const createSupportRequest = (payload: SupportRequestInput) => ({
  type: actionTypes.CREATE_SUPPORT_REQUEST_REQUESTED,
  payload,
  meta: { pendingKey: supportPendingKeys.create },
});

export const createSupportRequestSucceeded = (
  request: SupportRequest,
  meta: PendingMeta,
) => ({
  type: actionTypes.CREATE_SUPPORT_REQUEST_SUCCEEDED,
  payload: request,
  meta,
});

export const updateSupportRequest = (payload: {
  id: string;
  data: SupportRequestPatch;
}) => ({
  type: actionTypes.UPDATE_SUPPORT_REQUEST_REQUESTED,
  payload,
  meta: { pendingKey: supportPendingKeys.row(payload.id) },
});

export const updateSupportRequestSucceeded = (
  request: SupportRequest,
  meta: PendingMeta,
) => ({
  type: actionTypes.UPDATE_SUPPORT_REQUEST_SUCCEEDED,
  payload: request,
  meta,
});

export const replySupportRequest = (payload: { id: string; body: string }) => ({
  type: actionTypes.REPLY_SUPPORT_REQUEST_REQUESTED,
  payload,
  meta: { pendingKey: supportPendingKeys.reply(payload.id) },
});

export const replySupportRequestSucceeded = (
  payload: { id: string; message: SupportMessage },
  meta: PendingMeta,
) => ({
  type: actionTypes.REPLY_SUPPORT_REQUEST_SUCCEEDED,
  payload,
  meta,
});

export const deleteSupportRequest = (payload: { id: string }) => ({
  type: actionTypes.DELETE_SUPPORT_REQUEST_REQUESTED,
  payload,
  meta: { pendingKey: supportPendingKeys.row(payload.id) },
});

export const deleteSupportRequestSucceeded = (
  id: string,
  meta: PendingMeta,
) => ({
  type: actionTypes.DELETE_SUPPORT_REQUEST_SUCCEEDED,
  payload: { id },
  meta,
});

export const batchDeleteSupportRequests = (payload: { ids: string[] }) => ({
  type: actionTypes.BATCH_DELETE_SUPPORT_REQUESTS_REQUESTED,
  payload,
  meta: { pendingKey: supportPendingKeys.batchDelete },
});

export const batchDeleteSupportRequestsSucceeded = (
  payload: { deleted: string[]; notFound: string[] },
  meta: PendingMeta,
) => ({
  type: actionTypes.BATCH_DELETE_SUPPORT_REQUESTS_SUCCEEDED,
  payload,
  meta,
});

export const setSupportFilters = (payload: Partial<SupportFilters>) => ({
  type: actionTypes.SET_SUPPORT_FILTERS,
  payload,
});

export const setSupportPage = (page: number) => ({
  type: actionTypes.SET_SUPPORT_PAGE,
  payload: { page },
});

export const toggleSupportRequestSelected = (id: string) => ({
  type: actionTypes.TOGGLE_SUPPORT_REQUEST_SELECTED,
  payload: { id },
});

export const setSupportSelection = (ids: string[]) => ({
  type: actionTypes.SET_SUPPORT_SELECTION,
  payload: { ids },
});

export const clearSupportSelection = () => ({
  type: actionTypes.CLEAR_SUPPORT_SELECTION,
});

export const supportActionFailed = (
  message: string,
  issues: Record<string, string>,
  meta: PendingMeta,
) => ({
  type: actionTypes.SUPPORT_ACTION_FAILED,
  payload: { message, issues },
  meta,
});

export const clearSupportIssues = () => ({
  type: actionTypes.CLEAR_SUPPORT_ISSUES,
});
