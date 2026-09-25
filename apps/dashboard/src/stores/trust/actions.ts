import actionTypes from "./actionTypes";
import type {
  PolicyInput,
  Report,
  ReportStatus,
  ResourcePolicy,
  Review,
  TrustSummary,
} from "./type";

export interface PendingMeta {
  pendingKey: string;
}

export type ResourceKind = "listing" | "agent";

export interface ResourceRef {
  kind: ResourceKind;
  id: string;
}

export const fetchTrust = (resource: ResourceRef) => ({
  type: actionTypes.FETCH_TRUST_REQUESTED,
  payload: resource,
});

export const fetchTrustPending = () => ({
  type: actionTypes.FETCH_TRUST_PENDING,
});

export const fetchTrustSucceeded = (payload: {
  policy: ResourcePolicy | null;
  summary: TrustSummary;
  reviews: Review[];
  reports: Report[];
}) => ({
  type: actionTypes.FETCH_TRUST_SUCCEEDED,
  payload,
});

export const fetchTrustFailed = (message: string) => ({
  type: actionTypes.FETCH_TRUST_FAILED,
  payload: { message },
});

export const savePolicy = (resource: ResourceRef, policy: PolicyInput) => ({
  type: actionTypes.SAVE_POLICY_REQUESTED,
  payload: { resource, policy },
  meta: { pendingKey: "savePolicy" },
});

export const savePolicySucceeded = (policy: ResourcePolicy | null) => ({
  type: actionTypes.SAVE_POLICY_SUCCEEDED,
  payload: { policy },
});

export const replyToReview = (
  resource: ResourceRef,
  reviewId: string,
  reply: string | null,
) => ({
  type: actionTypes.REPLY_TO_REVIEW_REQUESTED,
  payload: { resource, reviewId, reply },
  meta: { pendingKey: `review:${reviewId}` },
});

export const replyToReviewSucceeded = (review: Review) => ({
  type: actionTypes.REPLY_TO_REVIEW_SUCCEEDED,
  payload: { review },
});

export const updateReport = (
  resource: ResourceRef,
  reportId: string,
  status: Extract<ReportStatus, "ACKNOWLEDGED" | "RESOLVED">,
  resolutionNote?: string | null,
) => ({
  type: actionTypes.UPDATE_REPORT_REQUESTED,
  payload: { resource, reportId, status, resolutionNote },
  meta: { pendingKey: `report:${reportId}` },
});

export const updateReportSucceeded = (report: Report) => ({
  type: actionTypes.UPDATE_REPORT_SUCCEEDED,
  payload: { report },
});

export const trustActionFailed = (
  message: string,
  issues: Record<string, string>,
  meta: PendingMeta,
) => ({
  type: actionTypes.TRUST_ACTION_FAILED,
  payload: { message, issues },
  meta,
});

export const clearTrustIssues = () => ({
  type: actionTypes.CLEAR_TRUST_ISSUES,
});

export const resetTrust = () => ({ type: actionTypes.RESET_TRUST });
