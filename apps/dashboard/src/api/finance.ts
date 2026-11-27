import { HttpMethod } from "@4mica/http";
import type { AgentListResponse } from "@stores/agent/type";
import type { ApiKey } from "@stores/developer/type";
import type {
  ApprovalRequest,
  ApprovalVote,
  CursorList,
  FinanceSummary,
  FinancialAlert,
  GovernanceSettings,
  Reconciliation,
  SpendAuthorization,
  SpendingPolicy,
  SpendingPolicyInput,
  UsageDirection,
  UsageGroup,
  UsageRow,
} from "@stores/finance/type";
import {
  forgetRequest,
  replayConfig,
  type StoredRequest,
} from "@/lib/approvalRequests";
import { httpClient } from "./client";

type Params = Record<string, string | number | boolean | undefined>;

export const getSpendingPolicies = (params: Params = {}) =>
  httpClient.request<{ items: SpendingPolicy[] }>({
    url: "/me/spending-policies",
    method: HttpMethod.GET,
    params,
  });

export const createSpendingPolicy = (data: SpendingPolicyInput) =>
  httpClient.request<SpendingPolicy, typeof data>({
    url: "/me/spending-policies",
    method: HttpMethod.POST,
    data,
  });

export const updateSpendingPolicy = (
  id: string,
  data: Partial<SpendingPolicyInput>,
) =>
  httpClient.request<SpendingPolicy, typeof data>({
    url: `/me/spending-policies/${encodeURIComponent(id)}`,
    method: HttpMethod.PATCH,
    data,
  });

export const deleteSpendingPolicy = (id: string) =>
  httpClient.request<void>({
    url: `/me/spending-policies/${encodeURIComponent(id)}`,
    method: HttpMethod.DELETE,
  });

export const freezeSpendingPolicy = (id: string, frozen: boolean) =>
  httpClient.request<SpendingPolicy>({
    url: `/me/spending-policies/${encodeURIComponent(id)}/${frozen ? "freeze" : "unfreeze"}`,
    method: HttpMethod.POST,
  });

export const getApprovals = (params: Params = {}) =>
  httpClient.request<CursorList<ApprovalRequest>>({
    url: "/me/approvals",
    method: HttpMethod.GET,
    params,
  });

export const getApproval = (id: string) =>
  httpClient.request<ApprovalRequest>({
    url: `/me/approvals/${encodeURIComponent(id)}`,
    method: HttpMethod.GET,
  });

export const decideApproval = (
  id: string,
  data: { vote: ApprovalVote; comment?: string },
) =>
  httpClient.request<ApprovalRequest, typeof data>({
    url: `/me/approvals/${encodeURIComponent(id)}/decide`,
    method: HttpMethod.POST,
    data,
  });

export const cancelApproval = (id: string) =>
  httpClient.request<ApprovalRequest>({
    url: `/me/approvals/${encodeURIComponent(id)}/cancel`,
    method: HttpMethod.POST,
  });

export const applyApprovedRequest = async (
  id: string,
  request: StoredRequest,
): Promise<unknown> => {
  const result = await httpClient.request<unknown>(replayConfig(id, request));
  forgetRequest(id);
  return result;
};

export const getAlerts = (params: Params = {}) =>
  httpClient.request<CursorList<FinancialAlert>>({
    url: "/me/finance/alerts",
    method: HttpMethod.GET,
    params,
  });

export const acknowledgeAlert = (id: string) =>
  httpClient.request<FinancialAlert>({
    url: `/me/finance/alerts/${encodeURIComponent(id)}/acknowledge`,
    method: HttpMethod.POST,
  });

export const getSpendAuthorizations = (params: Params = {}) =>
  httpClient.request<CursorList<SpendAuthorization>>({
    url: "/me/spend/authorizations",
    method: HttpMethod.GET,
    params,
  });

export const getFinanceSummary = (params: { from: string; to: string }) =>
  httpClient.request<FinanceSummary>({
    url: "/me/finance/summary",
    method: HttpMethod.GET,
    params,
  });

export const getFinanceUsage = (params: {
  from: string;
  to: string;
  groupBy: UsageGroup;
  direction: UsageDirection;
}) =>
  httpClient.request<{ items: UsageRow[] }>({
    url: "/me/finance/usage",
    method: HttpMethod.GET,
    params,
  });

export const getReconciliation = (params: { from: string; to: string }) =>
  httpClient.request<Reconciliation>({
    url: "/me/finance/reconciliation",
    method: HttpMethod.GET,
    params,
  });

export const getGovernance = () =>
  httpClient.request<GovernanceSettings>({
    url: "/me/organization/governance",
    method: HttpMethod.GET,
  });

export const updateGovernance = (data: GovernanceSettings) =>
  httpClient.request<GovernanceSettings, typeof data>({
    url: "/me/organization/governance",
    method: HttpMethod.PUT,
    data,
  });

export const getProjectAgents = (projectId: string) =>
  httpClient.request<AgentListResponse>({
    url: "/me/agents",
    method: HttpMethod.GET,
    params: { limit: 100 },
    headers: { "X-Project-Id": projectId },
  });

export const getProjectApiKeys = (projectId: string) =>
  httpClient.request<ApiKey[]>({
    url: "/me/api-keys",
    method: HttpMethod.GET,
    headers: { "X-Project-Id": projectId },
  });
