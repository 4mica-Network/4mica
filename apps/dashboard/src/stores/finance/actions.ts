import type { PendingMeta } from "@stores/utils";
import actionTypes from "./actionTypes";
import type {
  AlertFilters,
  ApprovalFilters,
  ApprovalRequest,
  ApprovalVote,
  AuthorizationFilters,
  FinanceSummary,
  FinancialAlert,
  GovernanceSettings,
  Reconciliation,
  ReportRange,
  SpendAuthorization,
  SpendingPolicy,
  SpendingPolicyInput,
  UsageDirection,
  UsageGroup,
  UsageRow,
} from "./type";

export const financePendingKeys = {
  savePolicy: "savePolicy",
  policy: (id: string) => `policy:${id}`,
  approval: (id: string) => `approval:${id}`,
  alert: (id: string) => `alert:${id}`,
  governance: "governance",
} as const;

export type FinanceList = "approvals" | "alerts" | "authorizations";

export interface ListFilters {
  approvals: ApprovalFilters;
  alerts: AlertFilters;
  authorizations: AuthorizationFilters;
}

export interface ListItems {
  approvals: ApprovalRequest;
  alerts: FinancialAlert;
  authorizations: SpendAuthorization;
}

export type FinanceReport = "summary" | "usage" | "reconciliation";

export interface ReportResults {
  summary: FinanceSummary;
  usage: UsageRow[];
  reconciliation: Reconciliation;
}

export const fetchPolicies = () => ({
  type: actionTypes.FETCH_POLICIES_REQUESTED,
});

export const fetchPoliciesPending = () => ({
  type: actionTypes.FETCH_POLICIES_PENDING,
});

export const fetchPoliciesSucceeded = (items: SpendingPolicy[]) => ({
  type: actionTypes.FETCH_POLICIES_SUCCEEDED,
  payload: { items },
});

export const fetchPoliciesFailed = (message: string) => ({
  type: actionTypes.FETCH_POLICIES_FAILED,
  payload: { message },
});

export const savePolicy = (payload: {
  id?: string;
  data: SpendingPolicyInput;
}) => ({
  type: actionTypes.SAVE_POLICY_REQUESTED,
  payload,
  meta: { pendingKey: financePendingKeys.savePolicy },
});

export const savePolicySucceeded = (
  policy: SpendingPolicy,
  meta: PendingMeta,
) => ({
  type: actionTypes.SAVE_POLICY_SUCCEEDED,
  payload: policy,
  meta,
});

export const deletePolicy = (payload: { id: string }) => ({
  type: actionTypes.DELETE_POLICY_REQUESTED,
  payload,
  meta: { pendingKey: financePendingKeys.policy(payload.id) },
});

export const deletePolicySucceeded = (id: string, meta: PendingMeta) => ({
  type: actionTypes.DELETE_POLICY_SUCCEEDED,
  payload: { id },
  meta,
});

export const freezePolicy = (payload: { id: string; frozen: boolean }) => ({
  type: actionTypes.FREEZE_POLICY_REQUESTED,
  payload,
  meta: { pendingKey: financePendingKeys.policy(payload.id) },
});

export const freezePolicySucceeded = (
  policy: SpendingPolicy,
  meta: PendingMeta,
) => ({
  type: actionTypes.FREEZE_POLICY_SUCCEEDED,
  payload: policy,
  meta,
});

export const fetchList = (
  list: FinanceList,
  options: { append?: boolean } = {},
) => ({
  type: actionTypes.FETCH_LIST_REQUESTED,
  payload: { list, append: Boolean(options.append) },
});

export const fetchListPending = (list: FinanceList, append: boolean) => ({
  type: actionTypes.FETCH_LIST_PENDING,
  payload: { list, append },
});

export const fetchListSucceeded = <L extends FinanceList>(payload: {
  list: L;
  items: ListItems[L][];
  nextCursor: string | null;
  append: boolean;
}) => ({
  type: actionTypes.FETCH_LIST_SUCCEEDED,
  payload,
});

export const fetchListFailed = (list: FinanceList, message: string) => ({
  type: actionTypes.FETCH_LIST_FAILED,
  payload: { list, message },
});

export const setListFilters = <L extends FinanceList>(
  list: L,
  filters: Partial<ListFilters[L]>,
) => ({
  type: actionTypes.SET_LIST_FILTERS,
  payload: { list, filters },
});

export const decideApproval = (payload: {
  id: string;
  vote: ApprovalVote;
  comment?: string;
}) => ({
  type: actionTypes.DECIDE_APPROVAL_REQUESTED,
  payload,
  meta: { pendingKey: financePendingKeys.approval(payload.id) },
});

export const cancelApproval = (payload: { id: string }) => ({
  type: actionTypes.CANCEL_APPROVAL_REQUESTED,
  payload,
  meta: { pendingKey: financePendingKeys.approval(payload.id) },
});

export const applyApproval = (
  payload: { id: string },
  onApplied?: (result: unknown) => void,
) => ({
  type: actionTypes.APPLY_APPROVAL_REQUESTED,
  payload,
  meta: { pendingKey: financePendingKeys.approval(payload.id) },
  onApplied,
});

export const applyApprovalSucceeded = (id: string, meta: PendingMeta) => ({
  type: actionTypes.APPLY_APPROVAL_SUCCEEDED,
  payload: { id },
  meta,
});

export const approvalUpdated = (
  approval: ApprovalRequest,
  meta: PendingMeta,
) => ({
  type: actionTypes.APPROVAL_UPDATED,
  payload: approval,
  meta,
});

export const acknowledgeAlert = (payload: { id: string }) => ({
  type: actionTypes.ACKNOWLEDGE_ALERT_REQUESTED,
  payload,
  meta: { pendingKey: financePendingKeys.alert(payload.id) },
});

export const alertUpdated = (alert: FinancialAlert, meta: PendingMeta) => ({
  type: actionTypes.ALERT_UPDATED,
  payload: alert,
  meta,
});

export const setReportOptions = (
  payload: Partial<{
    range: ReportRange;
    groupBy: UsageGroup;
    direction: UsageDirection;
  }>,
) => ({
  type: actionTypes.SET_REPORT_OPTIONS,
  payload,
});

export const fetchReport = (report: FinanceReport) => ({
  type: actionTypes.FETCH_REPORT_REQUESTED,
  payload: { report },
});

export const fetchReportPending = (report: FinanceReport) => ({
  type: actionTypes.FETCH_REPORT_PENDING,
  payload: { report },
});

export const fetchReportSucceeded = <R extends FinanceReport>(
  report: R,
  result: ReportResults[R],
) => ({
  type: actionTypes.FETCH_REPORT_SUCCEEDED,
  payload: { report, result },
});

export const fetchReportFailed = (report: FinanceReport, message: string) => ({
  type: actionTypes.FETCH_REPORT_FAILED,
  payload: { report, message },
});

export const fetchGovernance = () => ({
  type: actionTypes.FETCH_GOVERNANCE_REQUESTED,
});

export const fetchGovernancePending = () => ({
  type: actionTypes.FETCH_GOVERNANCE_PENDING,
});

export const fetchGovernanceSucceeded = (settings: GovernanceSettings) => ({
  type: actionTypes.FETCH_GOVERNANCE_SUCCEEDED,
  payload: settings,
});

export const fetchGovernanceFailed = (message: string) => ({
  type: actionTypes.FETCH_GOVERNANCE_FAILED,
  payload: { message },
});

export const saveGovernance = (payload: GovernanceSettings) => ({
  type: actionTypes.SAVE_GOVERNANCE_REQUESTED,
  payload,
  meta: { pendingKey: financePendingKeys.governance },
});

export const saveGovernanceSucceeded = (
  settings: GovernanceSettings,
  meta: PendingMeta,
) => ({
  type: actionTypes.SAVE_GOVERNANCE_SUCCEEDED,
  payload: settings,
  meta,
});

export const financeActionFailed = (
  message: string,
  issues: Record<string, string>,
  meta: PendingMeta,
) => ({
  type: actionTypes.FINANCE_ACTION_FAILED,
  payload: { message, issues },
  meta,
});

export const clearFinanceIssues = () => ({
  type: actionTypes.CLEAR_FINANCE_ISSUES,
});
