import type { PaymentNetwork } from "@4mica/rules";
import type { LoadStatus } from "@stores/organization/type";
import type { Payment } from "@stores/payment/type";

export interface UserRef {
  id: string;
  name: string;
}

export const POLICY_SCOPES = [
  "ORGANIZATION",
  "PROJECT",
  "AGENT",
  "API_KEY",
] as const;

export type PolicyScope = (typeof POLICY_SCOPES)[number];

export const POLICY_MODES = ["ENFORCE", "MONITOR"] as const;

export type PolicyMode = (typeof POLICY_MODES)[number];

export interface TokenRef {
  network: PaymentNetwork;
  assetAddress: string | null;
}

export interface PolicyUsage {
  asset: TokenRef | null;
  spentToday: string;
  spentThisMonth: string;
  reserved: string;
}

export interface SpendingPolicy {
  id: string;
  name: string;
  scope: PolicyScope;
  projectId: string | null;
  agentId: string | null;
  apiKeyId: string | null;
  mode: PolicyMode;
  network: PaymentNetwork | null;
  assetAddress: string | null;
  perPaymentLimit: string | null;
  dailyLimit: string | null;
  monthlyLimit: string | null;
  approvalThreshold: string | null;
  approvalsRequired: number;
  allowedRecipients: string[];
  alertThresholds: number[];
  frozen: boolean;
  frozenAt: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: UserRef | null;
  usage: PolicyUsage | null;
}

export interface SpendingPolicyInput {
  name: string;
  scope: PolicyScope;
  projectId: string | null;
  agentId: string | null;
  apiKeyId: string | null;
  mode: PolicyMode;
  network: PaymentNetwork | null;
  assetAddress: string | null;
  perPaymentLimit: string | null;
  dailyLimit: string | null;
  monthlyLimit: string | null;
  approvalThreshold: string | null;
  approvalsRequired: number;
  allowedRecipients: string[];
  alertThresholds: number[];
}

export const APPROVAL_KINDS = ["PAYMENT", "SELLER_PAYMENT", "GOVERNANCE"];

export type ApprovalKind = "PAYMENT" | "SELLER_PAYMENT" | "GOVERNANCE";

export const APPROVAL_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
];

export type ApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "CANCELLED";

export type ApprovalVote = "APPROVE" | "REJECT";

export interface ApprovalDecision {
  user: UserRef;
  vote: ApprovalVote;
  comment: string | null;
  createdAt: string;
}

export interface ApprovalRequest {
  id: string;
  kind: ApprovalKind;
  action: string;
  summary: string;
  payload: unknown;
  status: ApprovalStatus;
  requiredApprovals: number;
  approvals: number;
  decisions: ApprovalDecision[];
  requestedBy: UserRef | null;
  requestedByApiKeyId: string | null;
  projectId: string | null;
  expiresAt: string;
  createdAt: string;
  decidedAt: string | null;
  executedAt: string | null;
  canDecide: boolean;
}

export const ALERT_KINDS = [
  "BUDGET_THRESHOLD",
  "POLICY_DENIAL",
  "UNAUTHORIZED_SPEND",
  "APPROVAL_REQUESTED",
];

export interface FinancialAlert {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  policyId: string | null;
  projectId: string | null;
  createdAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: UserRef | null;
}

export const AUTHORIZATION_STATUSES = [
  "RESERVED",
  "PENDING_APPROVAL",
  "DENIED",
  "CONSUMED",
  "RELEASED",
  "EXPIRED",
];

export type AuthorizationStatus =
  | "RESERVED"
  | "PENDING_APPROVAL"
  | "DENIED"
  | "CONSUMED"
  | "RELEASED"
  | "EXPIRED";

export interface SpendAuthorization {
  id: string;
  status: AuthorizationStatus;
  deniedReason: string | null;
  policyId: string | null;
  approvalRequestId: string | null;
  expiresAt: string;
  amount: string;
  network: PaymentNetwork;
  assetAddress: string | null;
  payerAddress?: string | null;
  recipientAddress?: string | null;
  projectId?: string | null;
  agentId?: string | null;
  apiKeyId?: string | null;
  createdAt?: string;
}

export interface TokenTotal extends TokenRef {
  amount: string;
  count: number;
}

export interface FinanceSummary {
  sent: TokenTotal[];
  received: TokenTotal[];
  authorizations: {
    reserved: number;
    pendingApproval: number;
    consumed: number;
    denied: number;
    released: number;
    expired: number;
  };
}

export const USAGE_GROUPS = [
  "project",
  "agent",
  "api_key",
  "listing",
  "recipient",
] as const;

export type UsageGroup = (typeof USAGE_GROUPS)[number];

export type UsageDirection = "sent" | "received";

export interface UsageRow extends TokenTotal {
  key: string | null;
  label: string;
}

export interface Reconciliation {
  matched: number;
  authorizedNotReported: SpendAuthorization[];
  reportedNotAuthorized: Payment[];
}

export const GOVERNED_ACTIONS = [
  "spending_policy.change",
  "api_key.create_production",
  "wallet.remove",
  "member.role_grant",
] as const;

export type GovernedAction = (typeof GOVERNED_ACTIONS)[number];

export interface GovernanceSettings {
  approvalsRequired: number;
  governedActions: GovernedAction[];
  approvalTtlHours: number;
  financeRecipientIds: string[];
  auditRetentionDays: number | null;
}

export interface CursorList<T> {
  items: T[];
  nextCursor: string | null;
}

export interface Paged<T, F> {
  items: T[];
  nextCursor: string | null;
  status: LoadStatus;
  isLoadingMore: boolean;
  error: string | null;
  filters: F;
}

export interface ApprovalFilters {
  status: string;
  kind: string;
}

export interface AlertFilters {
  acknowledged: string;
  kind: string;
}

export interface AuthorizationFilters {
  status: string;
  projectId: string;
  from: string;
  to: string;
}

export interface ReportRange {
  from: string;
  to: string;
}

export interface ReportsState {
  range: ReportRange;
  groupBy: UsageGroup;
  direction: UsageDirection;
  summary: FinanceSummary | null;
  summaryStatus: LoadStatus;
  usage: UsageRow[];
  usageStatus: LoadStatus;
  reconciliation: Reconciliation | null;
  reconciliationStatus: LoadStatus;
  error: string | null;
}

export interface FinanceState {
  policies: SpendingPolicy[];
  policiesStatus: LoadStatus;
  policiesError: string | null;
  approvals: Paged<ApprovalRequest, ApprovalFilters>;
  alerts: Paged<FinancialAlert, AlertFilters>;
  authorizations: Paged<SpendAuthorization, AuthorizationFilters>;
  reports: ReportsState;
  governance: GovernanceSettings | null;
  governanceStatus: LoadStatus;
  pending: Record<string, boolean>;
  error: string | null;
  issues: Record<string, string>;
}
