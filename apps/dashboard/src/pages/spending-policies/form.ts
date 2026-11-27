import { isDecimalAmount } from "@4mica/rules";
import type {
  PolicyMode,
  PolicyScope,
  SpendingPolicy,
  SpendingPolicyInput,
} from "@stores/finance/type";
import { parseTokenKey, tokenKey } from "@/components/Finance/token";

export interface PolicyDraft {
  name: string;
  scope: PolicyScope;
  projectId: string;
  agentId: string;
  apiKeyId: string;
  mode: PolicyMode;
  token: string;
  perPaymentLimit: string;
  dailyLimit: string;
  monthlyLimit: string;
  approvalThreshold: string;
  approvalsRequired: string;
  allowedRecipients: string;
  alertThresholds: string;
}

export type PolicyErrors = Partial<Record<keyof PolicyDraft, string>>;

export const AMOUNT_FIELDS = [
  "perPaymentLimit",
  "dailyLimit",
  "monthlyLimit",
  "approvalThreshold",
] as const;

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const MAX_THRESHOLDS = 5;
const MAX_APPROVALS = 5;

export const emptyDraft = (projectId = ""): PolicyDraft => ({
  name: "",
  scope: "ORGANIZATION",
  projectId,
  agentId: "",
  apiKeyId: "",
  mode: "ENFORCE",
  token: "",
  perPaymentLimit: "",
  dailyLimit: "",
  monthlyLimit: "",
  approvalThreshold: "",
  approvalsRequired: "1",
  allowedRecipients: "",
  alertThresholds: "80, 100",
});

export const draftFrom = (policy: SpendingPolicy): PolicyDraft => ({
  name: policy.name,
  scope: policy.scope,
  projectId: policy.projectId ?? "",
  agentId: policy.agentId ?? "",
  apiKeyId: policy.apiKeyId ?? "",
  mode: policy.mode,
  token: policy.network ? tokenKey(policy.network, policy.assetAddress) : "",
  perPaymentLimit: policy.perPaymentLimit ?? "",
  dailyLimit: policy.dailyLimit ?? "",
  monthlyLimit: policy.monthlyLimit ?? "",
  approvalThreshold: policy.approvalThreshold ?? "",
  approvalsRequired: String(policy.approvalsRequired),
  allowedRecipients: policy.allowedRecipients.join("\n"),
  alertThresholds: policy.alertThresholds.join(", "),
});

export const splitList = (raw: string): string[] =>
  raw
    .split(/[\s,;]+/)
    .map((value) => value.trim())
    .filter(Boolean);

export const parseRecipients = (raw: string): string[] => [
  ...new Set(splitList(raw).map((value) => value.toLowerCase())),
];

export const parseThresholds = (raw: string): number[] =>
  [...new Set(splitList(raw).map(Number))].sort((a, b) => a - b);

export const validatePolicy = (
  draft: PolicyDraft,
  t: (key: string, options?: Record<string, unknown>) => string,
): PolicyErrors => {
  const errors: PolicyErrors = {};
  if (!draft.name.trim()) {
    errors.name = t("finance.policy.errors.name");
  }
  if (draft.scope === "PROJECT" && !draft.projectId) {
    errors.projectId = t("finance.policy.errors.project");
  }
  if (draft.scope === "AGENT" && !draft.agentId) {
    errors.agentId = t("finance.policy.errors.agent");
  }
  if (draft.scope === "API_KEY" && !draft.apiKeyId) {
    errors.apiKeyId = t("finance.policy.errors.apiKey");
  }

  let hasAmount = false;
  for (const field of AMOUNT_FIELDS) {
    const value = draft[field].trim();
    if (!value) {
      continue;
    }
    hasAmount = true;
    if (!isDecimalAmount(value) || Number(value) <= 0) {
      errors[field] = t("finance.policy.errors.amount");
    }
  }
  if (hasAmount && !parseTokenKey(draft.token)) {
    errors.token = t("finance.policy.errors.tokenRequired");
  }

  const approvals = Number(draft.approvalsRequired);
  if (
    !Number.isInteger(approvals) ||
    approvals < 1 ||
    approvals > MAX_APPROVALS
  ) {
    errors.approvalsRequired = t("finance.policy.errors.approvals", {
      max: MAX_APPROVALS,
    });
  }

  const recipients = splitList(draft.allowedRecipients);
  const badRecipients = recipients.filter(
    (value) => !ADDRESS_PATTERN.test(value),
  );
  if (badRecipients.length > 0) {
    errors.allowedRecipients = t("finance.policy.errors.recipients", {
      addresses: badRecipients.join(", "),
    });
  }

  const thresholds = parseThresholds(draft.alertThresholds);
  if (
    thresholds.some(
      (value) => !Number.isInteger(value) || value < 1 || value > 100,
    ) ||
    thresholds.length > MAX_THRESHOLDS
  ) {
    errors.alertThresholds = t("finance.policy.errors.thresholds", {
      max: MAX_THRESHOLDS,
    });
  }

  return errors;
};

const amountOrNull = (value: string): string | null => value.trim() || null;

export const toPolicyInput = (draft: PolicyDraft): SpendingPolicyInput => {
  const token = parseTokenKey(draft.token);
  return {
    name: draft.name.trim(),
    scope: draft.scope,
    projectId: draft.scope === "PROJECT" ? draft.projectId : null,
    agentId: draft.scope === "AGENT" ? draft.agentId : null,
    apiKeyId: draft.scope === "API_KEY" ? draft.apiKeyId : null,
    mode: draft.mode,
    network: token?.network ?? null,
    assetAddress: token?.assetAddress ?? null,
    perPaymentLimit: token ? amountOrNull(draft.perPaymentLimit) : null,
    dailyLimit: token ? amountOrNull(draft.dailyLimit) : null,
    monthlyLimit: token ? amountOrNull(draft.monthlyLimit) : null,
    approvalThreshold: token ? amountOrNull(draft.approvalThreshold) : null,
    approvalsRequired: Number(draft.approvalsRequired),
    allowedRecipients: parseRecipients(draft.allowedRecipients),
    alertThresholds: parseThresholds(draft.alertThresholds),
  };
};
