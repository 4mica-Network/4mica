import type {
  PaymentNetwork,
  SpendAuthorizationStatus,
  SpendingPolicyMode,
  SpendingPolicyScope,
} from "@4mica/db";

export interface EnginePolicy {
  id: string;
  name: string;
  scope: SpendingPolicyScope;
  projectId: string | null;
  agentId: string | null;
  apiKeyId: string | null;
  mode: SpendingPolicyMode;
  network: PaymentNetwork | null;
  assetAddress: string | null;
  perPaymentLimit: bigint | null;
  dailyLimit: bigint | null;
  monthlyLimit: bigint | null;
  approvalThreshold: bigint | null;
  approvalsRequired: number;
  allowedRecipients: string[];
  alertThresholds: number[];
  frozen: boolean;
}

export interface UsageAuthorization {
  id: string;
  reqId: string | null;
  status: SpendAuthorizationStatus;
  amount: bigint;
  createdAt: Date;
  expiresAt: Date;
  projectId: string;
  agentId: string | null;
  apiKeyId: string | null;
}

export interface UsagePayment {
  reqId: string;
  amount: bigint;
  createdAt: Date;
  payerAddress: string;
}

export interface UsageData {
  authorizations: UsageAuthorization[];
  payments: UsagePayment[];
  agentWallets: Record<string, string[]>;
}

export interface SpendSubject {
  projectId: string;
  agentId: string | null;
  apiKeyId: string | null;
  network: PaymentNetwork;
  assetAddress: string | null;
  amount: bigint;
  recipientAddress: string;
}

export interface Usage {
  day: bigint;
  month: bigint;
  reserved: bigint;
}

export type DenyReason =
  | "frozen"
  | "recipient_not_allowed"
  | "per_payment_limit"
  | "daily_limit"
  | "monthly_limit";

export type Decision =
  | { kind: "deny"; reason: DenyReason; policy: EnginePolicy }
  | {
      kind: "approval";
      policies: EnginePolicy[];
      requiredApprovals: number;
    }
  | { kind: "reserve" };

export const RESERVATION_MS = 10 * 60_000;

export const windowsAt = (now: Date) => ({
  dayStart: new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ),
  monthStart: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
});

export const periodKeys = (now: Date) => {
  const iso = now.toISOString();
  return { daily: iso.slice(0, 10), monthly: iso.slice(0, 7) };
};

export const countsTowardUsage = (
  authorization: Pick<UsageAuthorization, "status" | "expiresAt">,
  now: Date,
): boolean =>
  authorization.status === "CONSUMED" ||
  ((authorization.status === "RESERVED" ||
    authorization.status === "PENDING_APPROVAL") &&
    authorization.expiresAt.getTime() > now.getTime());

const assetMatches = (
  policy: Pick<EnginePolicy, "network" | "assetAddress">,
  network: PaymentNetwork,
  assetAddress: string | null,
): boolean =>
  policy.network === null ||
  (policy.network === network && policy.assetAddress === assetAddress);

const authorizationInScope = (
  policy: EnginePolicy,
  authorization: Pick<UsageAuthorization, "projectId" | "agentId" | "apiKeyId">,
): boolean => {
  switch (policy.scope) {
    case "ORGANIZATION":
      return true;
    case "PROJECT":
      return authorization.projectId === policy.projectId;
    case "AGENT":
      return authorization.agentId === policy.agentId;
    case "API_KEY":
      return authorization.apiKeyId === policy.apiKeyId;
  }
};

export const policyApplies = (
  policy: EnginePolicy,
  subject: Pick<
    SpendSubject,
    "projectId" | "agentId" | "apiKeyId" | "network" | "assetAddress"
  >,
): boolean =>
  assetMatches(policy, subject.network, subject.assetAddress) &&
  authorizationInScope(policy, subject);

const paymentInScope = (
  policy: EnginePolicy,
  payment: UsagePayment,
  data: UsageData,
): boolean => {
  if (policy.scope === "ORGANIZATION") {
    return true;
  }
  if (policy.scope === "AGENT" && policy.agentId) {
    return (data.agentWallets[policy.agentId] ?? []).includes(
      payment.payerAddress,
    );
  }
  return false;
};

export const usageOf = (
  policy: EnginePolicy,
  data: UsageData,
  now: Date,
  excludeId?: string,
): Usage => {
  const { dayStart, monthStart } = windowsAt(now);
  const usage: Usage = { day: 0n, month: 0n, reserved: 0n };
  const add = (amount: bigint, at: Date): boolean => {
    if (at.getTime() < monthStart.getTime()) {
      return false;
    }
    usage.month += amount;
    if (at.getTime() >= dayStart.getTime()) {
      usage.day += amount;
    }
    return true;
  };

  const authorized = new Map<string, bigint>();
  for (const authorization of data.authorizations) {
    if (!countsTowardUsage(authorization, now)) {
      continue;
    }
    if (authorization.reqId) {
      const before = authorized.get(authorization.reqId) ?? 0n;
      if (authorization.amount > before) {
        authorized.set(authorization.reqId, authorization.amount);
      }
    }
    if (
      authorization.id === excludeId ||
      !authorizationInScope(policy, authorization)
    ) {
      continue;
    }
    if (
      add(authorization.amount, authorization.createdAt) &&
      authorization.status !== "CONSUMED"
    ) {
      usage.reserved += authorization.amount;
    }
  }

  const seen = new Set<string>();
  for (const payment of data.payments) {
    const covered = authorized.get(payment.reqId);
    if (
      (covered !== undefined && covered >= payment.amount) ||
      seen.has(payment.reqId)
    ) {
      continue;
    }
    seen.add(payment.reqId);
    if (paymentInScope(policy, payment, data)) {
      add(payment.amount, payment.createdAt);
    }
  }

  return usage;
};

const failure = (
  policy: EnginePolicy,
  subject: SpendSubject,
  usage: () => Usage,
): DenyReason | null => {
  if (policy.frozen) {
    return "frozen";
  }
  if (
    policy.allowedRecipients.length > 0 &&
    !policy.allowedRecipients.includes(subject.recipientAddress)
  ) {
    return "recipient_not_allowed";
  }
  if (policy.network === null) {
    return null;
  }
  if (
    policy.perPaymentLimit !== null &&
    subject.amount > policy.perPaymentLimit
  ) {
    return "per_payment_limit";
  }
  if (policy.dailyLimit === null && policy.monthlyLimit === null) {
    return null;
  }
  const current = usage();
  if (
    policy.dailyLimit !== null &&
    current.day + subject.amount > policy.dailyLimit
  ) {
    return "daily_limit";
  }
  if (
    policy.monthlyLimit !== null &&
    current.month + subject.amount > policy.monthlyLimit
  ) {
    return "monthly_limit";
  }
  return null;
};

export interface EvaluateOptions {
  ignoreApprovalThreshold?: boolean;
  excludeId?: string;
}

export const evaluate = (
  subject: SpendSubject,
  policies: EnginePolicy[],
  data: UsageData,
  now: Date,
  options: EvaluateOptions = {},
): Decision => {
  const enforced = policies.filter(
    (policy) => policy.mode === "ENFORCE" && policyApplies(policy, subject),
  );

  for (const policy of enforced) {
    const reason = failure(policy, subject, () =>
      usageOf(policy, data, now, options.excludeId),
    );
    if (reason) {
      return { kind: "deny", reason, policy };
    }
  }

  if (options.ignoreApprovalThreshold) {
    return { kind: "reserve" };
  }

  const triggering = enforced.filter(
    (policy) =>
      policy.network !== null &&
      policy.approvalThreshold !== null &&
      subject.amount > policy.approvalThreshold,
  );

  if (triggering.length > 0) {
    return {
      kind: "approval",
      policies: triggering,
      requiredApprovals: Math.max(
        ...triggering.map((policy) => policy.approvalsRequired),
      ),
    };
  }

  return { kind: "reserve" };
};

export interface BudgetCrossing {
  policy: EnginePolicy;
  window: "daily" | "monthly";
  period: string;
  percent: number;
  used: bigint;
  limit: bigint;
}

export const budgetCrossings = (
  policies: EnginePolicy[],
  data: UsageData,
  now: Date,
): BudgetCrossing[] => {
  const periods = periodKeys(now);
  const crossings: BudgetCrossing[] = [];

  for (const policy of policies) {
    if (
      policy.network === null ||
      policy.alertThresholds.length === 0 ||
      (policy.dailyLimit === null && policy.monthlyLimit === null)
    ) {
      continue;
    }
    const usage = usageOf(policy, data, now);
    const windows = [
      { window: "daily" as const, limit: policy.dailyLimit, used: usage.day },
      {
        window: "monthly" as const,
        limit: policy.monthlyLimit,
        used: usage.month,
      },
    ];
    for (const { window, limit, used } of windows) {
      if (limit === null || limit <= 0n) {
        continue;
      }
      for (const percent of [...new Set(policy.alertThresholds)].sort(
        (a, b) => a - b,
      )) {
        if (used * 100n >= limit * BigInt(percent)) {
          crossings.push({
            policy,
            window,
            period: periods[window],
            percent,
            used,
            limit,
          });
        }
      }
    }
  }

  return crossings;
};
