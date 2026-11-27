import type {
  ApprovalStatus,
  EnvironmentKind,
  PaymentNetwork,
  Prisma,
} from "@4mica/db";
import type { EmailClient } from "@4mica/email-client";
import { findPaymentAsset, PAYMENT_NETWORKS } from "@4mica/rules";
import { writeAudit } from "@controllers/audit/repository";
import { notifyFinance } from "@controllers/finance-alerts/notify";
import {
  type AlertInput,
  type AlertRow,
  raiseAlerts,
} from "@controllers/finance-alerts/repository";
import { appLogger } from "@logger/index";
import { payloadHash } from "@utils/canonical";
import { fromUnits, toUnits } from "@utils/units";
import {
  type BudgetCrossing,
  budgetCrossings,
  type EnginePolicy,
  evaluate,
  policyApplies,
  RESERVATION_MS,
  type SpendSubject,
  type UsageData,
} from "./engine";
import {
  AUTHORIZATION_SELECT,
  type AuthorizationRow,
  approvalTtlHours,
  cancelPendingApproval,
  expirePendingApproval,
  expireReservation,
  findAuthorization,
  findReportedPayment,
  hasEnforcingPolicy,
  loadPolicies,
  loadUsage,
  lockSpend,
  ownersOfPayerWallet,
  reqIdInUse,
  runInTransaction,
  transitionAuthorization,
} from "./repository";

type Db = Prisma.TransactionClient;

const HOUR_MS = 3_600_000;
export const PAYMENT_APPROVAL_ACTION = "payment.authorize";

const EMPTY_USAGE: UsageData = {
  authorizations: [],
  payments: [],
  agentWallets: {},
};

export const assetSymbol = (
  network: PaymentNetwork,
  assetAddress: string | null,
): string =>
  findPaymentAsset(network, assetAddress)?.symbol ??
  (assetAddress
    ? shortAddress(assetAddress)
    : PAYMENT_NETWORKS[network].currency.symbol);

export const shortAddress = (address: string): string =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;

const money = (
  amount: bigint | string,
  network: PaymentNetwork,
  assetAddress: string | null,
): string =>
  `${typeof amount === "string" ? amount : fromUnits(amount)} ${assetSymbol(network, assetAddress)}`;

const networkLabel = (network: PaymentNetwork) =>
  PAYMENT_NETWORKS[network].label;

const usageFor = async (
  tx: Db,
  orgId: string,
  network: PaymentNetwork,
  assetAddress: string | null,
  policies: EnginePolicy[],
  now: Date,
): Promise<UsageData> =>
  policies.some((policy) => policy.network !== null)
    ? loadUsage(
        tx,
        orgId,
        network,
        assetAddress,
        policies
          .filter((policy) => policy.scope === "AGENT" && policy.agentId)
          .map((policy) => policy.agentId as string),
        now,
      )
    : EMPTY_USAGE;

const budgetAlerts = (
  orgId: string,
  crossings: BudgetCrossing[],
): AlertInput[] =>
  crossings.map((crossing) => {
    const { policy } = crossing;
    const network = policy.network as PaymentNetwork;
    const label = crossing.window === "daily" ? "Daily" : "Monthly";
    return {
      orgId,
      projectId: policy.projectId,
      kind: "BUDGET_THRESHOLD",
      policyId: policy.id,
      title: `${label} budget ${crossing.percent}% used: ${policy.name}`,
      dedupeKey: `budget:${policy.id}:${crossing.window}:${crossing.period}:${crossing.percent}`,
      detail: {
        window: crossing.window,
        period: crossing.period,
        percent: crossing.percent,
        used: fromUnits(crossing.used),
        limit: fromUnits(crossing.limit),
        network,
        assetAddress: policy.assetAddress,
        mode: policy.mode,
        lines: [
          `Policy: ${policy.name}${policy.mode === "MONITOR" ? " (monitor only)" : ""}`,
          `${label === "Daily" ? "Spent today" : "Spent this month"}: ${fromUnits(crossing.used)} of ${money(crossing.limit, network, policy.assetAddress)} on ${networkLabel(network)}`,
        ],
      },
    };
  });

export interface AuthorizeInput {
  orgId: string;
  projectId: string;
  environment: EnvironmentKind;
  apiKeyId: string;
  agentId: string | null;
  agentName: string | null;
  network: PaymentNetwork;
  assetAddress: string | null;
  amount: string;
  payerAddress: string;
  recipientAddress: string;
  reqId: string | null;
}

export type AuthorizeOutcome =
  | { kind: "ok"; row: AuthorizationRow; alerts: AlertRow[] }
  | { kind: "req_id_in_use" };

export const paymentSummary = (input: {
  agentName: string | null;
  amount: string;
  network: PaymentNetwork;
  assetAddress: string | null;
  recipientAddress: string;
}): string =>
  `${input.agentName ? `Agent ${input.agentName}` : "An API key"} wants to pay ${money(input.amount, input.network, input.assetAddress)} to ${shortAddress(input.recipientAddress)}`.slice(
    0,
    280,
  );

export const authorizeSpend = async (
  input: AuthorizeInput,
  now: Date = new Date(),
): Promise<AuthorizeOutcome> =>
  runInTransaction(async (tx) => {
    await lockSpend(tx, input.orgId, input.network, input.assetAddress);

    if (input.reqId && (await reqIdInUse(tx, input.orgId, input.reqId))) {
      return { kind: "req_id_in_use" as const };
    }

    const subject: SpendSubject = {
      projectId: input.projectId,
      agentId: input.agentId,
      apiKeyId: input.apiKeyId,
      network: input.network,
      assetAddress: input.assetAddress,
      amount: toUnits(input.amount),
      recipientAddress: input.recipientAddress,
    };

    const policies = (
      await loadPolicies(tx, input.orgId, input.network, input.assetAddress)
    ).filter((policy) => policyApplies(policy, subject));
    const usage = await usageFor(
      tx,
      input.orgId,
      input.network,
      input.assetAddress,
      policies,
      now,
    );
    const decision = evaluate(subject, policies, usage, now);

    const base = {
      organizationId: input.orgId,
      projectId: input.projectId,
      environment: input.environment,
      apiKeyId: input.apiKeyId,
      agentId: input.agentId,
      network: input.network,
      assetAddress: input.assetAddress,
      payerAddress: input.payerAddress,
      recipientAddress: input.recipientAddress,
      amount: input.amount,
      reqId: input.reqId,
    };
    const alerts: AlertInput[] = [];
    const audit = (
      action: string,
      id: string,
      metadata: Prisma.InputJsonValue,
    ) =>
      writeAudit(tx, {
        orgId: input.orgId,
        projectId: input.projectId,
        actorApiKeyId: input.apiKeyId,
        action,
        targetType: "spend_authorization",
        targetId: id,
        metadata,
      });

    let id: string;

    if (decision.kind === "deny") {
      const created = await tx.spendAuthorization.create({
        data: {
          ...base,
          status: "DENIED",
          deniedReason: decision.reason,
          policyId: decision.policy.id,
          expiresAt: now,
        },
        select: { id: true },
      });
      id = created.id;
      await audit("spend.denied", id, {
        reason: decision.reason,
        policyId: decision.policy.id,
        amount: input.amount,
        network: input.network,
        assetAddress: input.assetAddress,
        recipientAddress: input.recipientAddress,
      });
      alerts.push({
        orgId: input.orgId,
        projectId: input.projectId,
        kind: "POLICY_DENIAL",
        policyId: decision.policy.id,
        title: `Payment denied by ${decision.policy.name}`,
        dedupeKey: `denial:${decision.policy.id}:${now.toISOString().slice(0, 13)}`,
        detail: {
          authorizationId: id,
          reason: decision.reason,
          amount: input.amount,
          network: input.network,
          assetAddress: input.assetAddress,
          recipientAddress: input.recipientAddress,
          agentId: input.agentId,
          apiKeyId: input.apiKeyId,
          lines: [
            `${paymentSummary(input)} and was denied: ${decision.reason.replaceAll("_", " ")}.`,
            "Further denials by this policy in the same hour are not emailed.",
          ],
        },
      });
    } else if (decision.kind === "approval") {
      const expiresAt = new Date(
        now.getTime() + (await approvalTtlHours(tx, input.orgId)) * HOUR_MS,
      );
      const created = await tx.spendAuthorization.create({
        data: {
          ...base,
          status: "PENDING_APPROVAL",
          policyId: decision.policies[0]?.id ?? null,
          expiresAt,
        },
        select: { id: true },
      });
      id = created.id;
      const payload = {
        authorizationId: id,
        network: input.network,
        assetAddress: input.assetAddress,
        amount: input.amount,
        payerAddress: input.payerAddress,
        recipientAddress: input.recipientAddress,
        reqId: input.reqId,
        agentId: input.agentId,
        apiKeyId: input.apiKeyId,
        policyIds: decision.policies.map((policy) => policy.id),
      };
      const summary = paymentSummary(input);
      const approval = await tx.approvalRequest.create({
        data: {
          organizationId: input.orgId,
          projectId: input.projectId,
          kind: "PAYMENT",
          action: PAYMENT_APPROVAL_ACTION,
          summary,
          payload,
          payloadHash: payloadHash(PAYMENT_APPROVAL_ACTION, payload),
          requestedByApiKeyId: input.apiKeyId,
          requiredApprovals: decision.requiredApprovals,
          expiresAt,
        },
        select: { id: true },
      });
      await tx.spendAuthorization.update({
        where: { id },
        data: { approvalRequestId: approval.id },
        select: { id: true },
      });
      await audit("spend.approval_requested", id, {
        approvalRequestId: approval.id,
        policyIds: payload.policyIds,
        amount: input.amount,
        network: input.network,
        assetAddress: input.assetAddress,
      });
      alerts.push({
        orgId: input.orgId,
        projectId: input.projectId,
        kind: "APPROVAL_REQUESTED",
        policyId: decision.policies[0]?.id ?? null,
        title: `Approval needed: ${summary}`,
        dedupeKey: `approval:${approval.id}`,
        detail: {
          authorizationId: id,
          approvalRequestId: approval.id,
          requiredApprovals: decision.requiredApprovals,
          lines: [
            summary,
            `It needs ${decision.requiredApprovals} approval${decision.requiredApprovals === 1 ? "" : "s"} before ${expiresAt.toISOString()}.`,
          ],
        },
      });
    } else {
      const created = await tx.spendAuthorization.create({
        data: {
          ...base,
          status: "RESERVED",
          expiresAt: new Date(now.getTime() + RESERVATION_MS),
        },
        select: { id: true },
      });
      id = created.id;
    }

    if (decision.kind !== "deny") {
      usage.authorizations.push({
        id,
        reqId: input.reqId,
        status: decision.kind === "approval" ? "PENDING_APPROVAL" : "RESERVED",
        amount: subject.amount,
        createdAt: now,
        expiresAt: new Date(now.getTime() + RESERVATION_MS),
        projectId: input.projectId,
        agentId: input.agentId,
        apiKeyId: input.apiKeyId,
      });
      alerts.push(
        ...budgetAlerts(input.orgId, budgetCrossings(policies, usage, now)),
      );
    }

    const raised = await raiseAlerts(tx, alerts);
    const row = await findAuthorization(tx, input.orgId, id);
    if (!row) {
      throw new Error("Spend authorization vanished inside its transaction");
    }
    return { kind: "ok" as const, row, alerts: raised };
  });

const subjectOf = (row: AuthorizationRow): SpendSubject => ({
  projectId: row.projectId,
  agentId: row.agentId,
  apiKeyId: row.apiKeyId,
  network: row.network,
  assetAddress: row.assetAddress,
  amount: toUnits(row.amount),
  recipientAddress: row.recipientAddress,
});

export const resolvePendingAuthorization = async (
  tx: Db,
  row: AuthorizationRow,
  status: ApprovalStatus,
  now: Date = new Date(),
): Promise<void> => {
  if (row.status !== "PENDING_APPROVAL" || status === "PENDING") {
    return;
  }

  const move = (data: Prisma.SpendAuthorizationUncheckedUpdateManyInput) =>
    transitionAuthorization(tx, row.id, ["PENDING_APPROVAL"], data);

  if (status === "CANCELLED") {
    await move({ status: "RELEASED" });
    return;
  }

  if (status === "REJECTED" || status === "EXPIRED") {
    const reason =
      status === "REJECTED" ? "approval_rejected" : "approval_expired";
    const { count } = await move({ status: "DENIED", deniedReason: reason });
    if (count > 0) {
      await writeAudit(tx, {
        orgId: row.organizationId,
        projectId: row.projectId,
        actorApiKeyId: row.apiKeyId,
        action: "spend.denied",
        targetType: "spend_authorization",
        targetId: row.id,
        metadata: { reason, approvalRequestId: row.approvalRequestId },
      });
    }
    return;
  }

  await lockSpend(tx, row.organizationId, row.network, row.assetAddress);
  const subject = subjectOf(row);
  const policies = (
    await loadPolicies(tx, row.organizationId, row.network, row.assetAddress)
  ).filter((policy) => policyApplies(policy, subject));
  const usage = await usageFor(
    tx,
    row.organizationId,
    row.network,
    row.assetAddress,
    policies,
    now,
  );
  const decision = evaluate(subject, policies, usage, now, {
    ignoreApprovalThreshold: true,
    excludeId: row.id,
  });

  if (decision.kind === "deny") {
    const { count } = await move({
      status: "DENIED",
      deniedReason: "limit_changed",
      policyId: decision.policy.id,
    });
    if (count > 0) {
      await writeAudit(tx, {
        orgId: row.organizationId,
        projectId: row.projectId,
        actorApiKeyId: row.apiKeyId,
        action: "spend.denied",
        targetType: "spend_authorization",
        targetId: row.id,
        metadata: {
          reason: "limit_changed",
          failed: decision.reason,
          policyId: decision.policy.id,
          approvalRequestId: row.approvalRequestId,
        },
      });
    }
    return;
  }

  await move({
    status: "RESERVED",
    expiresAt: new Date(now.getTime() + RESERVATION_MS),
  });
};

export const refreshAuthorization = async (
  orgId: string,
  id: string,
  now: Date = new Date(),
): Promise<AuthorizationRow | null> =>
  runInTransaction(async (tx) => {
    const row = await findAuthorization(tx, orgId, id);
    if (!row) {
      return null;
    }

    if (row.status === "RESERVED" && row.expiresAt <= now) {
      await expireReservation(tx, row.id, now);
      return findAuthorization(tx, orgId, id);
    }

    if (row.status !== "PENDING_APPROVAL") {
      return row;
    }

    const approval = row.approvalRequest;
    if (!approval) {
      if (row.expiresAt <= now) {
        await resolvePendingAuthorization(tx, row, "EXPIRED", now);
        return findAuthorization(tx, orgId, id);
      }
      return row;
    }

    let status = approval.status;
    if (status === "PENDING" && approval.expiresAt <= now) {
      await expirePendingApproval(tx, row.approvalRequestId as string, now);
      status = "EXPIRED";
    }
    if (status === "PENDING") {
      return row;
    }

    await resolvePendingAuthorization(tx, row, status, now);
    return findAuthorization(tx, orgId, id);
  });

export type TransitionOutcome =
  | { kind: "ok"; row: AuthorizationRow }
  | { kind: "not_found" }
  | { kind: "conflict"; row: AuthorizationRow }
  | { kind: "req_id_mismatch" }
  | { kind: "req_id_in_use" };

export const consumeAuthorization = async (
  orgId: string,
  id: string,
  reqId: string | null,
  now: Date = new Date(),
): Promise<TransitionOutcome> => {
  const current = await refreshAuthorization(orgId, id, now);
  if (!current) {
    return { kind: "not_found" };
  }
  if (current.status !== "RESERVED") {
    return { kind: "conflict", row: current };
  }
  if (reqId && current.reqId && reqId !== current.reqId) {
    return { kind: "req_id_mismatch" };
  }

  return runInTransaction(async (tx) => {
    if (reqId && !current.reqId && (await reqIdInUse(tx, orgId, reqId))) {
      return { kind: "req_id_in_use" as const };
    }
    const finalReqId = reqId ?? current.reqId;
    const payment = finalReqId
      ? await findReportedPayment(tx, current.payerAddress, finalReqId)
      : null;
    const { count } = await transitionAuthorization(
      tx,
      id,
      ["RESERVED"],
      {
        status: "CONSUMED",
        consumedAt: now,
        reqId: finalReqId,
        ...(payment ? { paymentId: payment.id } : {}),
      },
      { organizationId: orgId, expiresAt: { gt: now } },
    );
    const row = await findAuthorization(tx, orgId, id);
    if (!row) {
      return { kind: "not_found" as const };
    }
    return count > 0
      ? { kind: "ok" as const, row }
      : { kind: "conflict" as const, row };
  });
};

export const releaseAuthorization = async (
  orgId: string,
  id: string,
  now: Date = new Date(),
): Promise<TransitionOutcome> => {
  const current = await refreshAuthorization(orgId, id, now);
  if (!current) {
    return { kind: "not_found" };
  }
  if (current.status !== "RESERVED" && current.status !== "PENDING_APPROVAL") {
    return { kind: "conflict", row: current };
  }

  return runInTransaction(async (tx) => {
    const { count } = await transitionAuthorization(
      tx,
      id,
      ["RESERVED", "PENDING_APPROVAL"],
      { status: "RELEASED" },
      { organizationId: orgId },
    );
    if (count > 0 && current.approvalRequestId) {
      await cancelPendingApproval(tx, current.approvalRequestId);
    }
    const row = await findAuthorization(tx, orgId, id);
    if (!row) {
      return { kind: "not_found" as const };
    }
    return count > 0
      ? { kind: "ok" as const, row }
      : { kind: "conflict" as const, row };
  });
};

export interface ReportedPayment {
  id: string;
  reqId: string;
  payerAddress: string;
  network: PaymentNetwork;
  assetAddress: string | null;
  amount: string;
  status: string;
}

const RECONCILABLE = ["RESERVED", "EXPIRED", "RELEASED", "CONSUMED"] as const;

const reconcileForOrg = async (
  orgId: string,
  payment: ReportedPayment,
  now: Date,
): Promise<AlertRow[]> =>
  runInTransaction(async (tx) => {
    await lockSpend(tx, orgId, payment.network, payment.assetAddress);

    const amount = toUnits(payment.amount);
    const candidate = await tx.spendAuthorization.findFirst({
      where: {
        organizationId: orgId,
        reqId: payment.reqId,
        status: { in: [...RECONCILABLE] },
      },
      orderBy: { createdAt: "desc" },
      select: AUTHORIZATION_SELECT,
    });

    const covers =
      candidate !== null &&
      candidate.network === payment.network &&
      candidate.assetAddress === payment.assetAddress &&
      candidate.payerAddress === payment.payerAddress &&
      toUnits(candidate.amount) >= amount &&
      (candidate.paymentId === null || candidate.paymentId === payment.id);

    const alerts: AlertInput[] = [];

    if (candidate && covers) {
      await tx.spendAuthorization.update({
        where: { id: candidate.id },
        data: {
          status: "CONSUMED",
          paymentId: payment.id,
          consumedAt: candidate.consumedAt ?? now,
        },
        select: { id: true },
      });
    } else if (await hasEnforcingPolicy(tx, orgId)) {
      const reason = candidate ? "exceeds_authorization" : "not_authorized";
      alerts.push({
        orgId,
        projectId: candidate?.projectId ?? null,
        kind: "UNAUTHORIZED_SPEND",
        title: `Payment of ${money(payment.amount, payment.network, payment.assetAddress)} was made without an authorization`,
        dedupeKey: `unauthorized:${payment.id}`,
        detail: {
          paymentId: payment.id,
          reqId: payment.reqId,
          reason,
          amount: payment.amount,
          network: payment.network,
          assetAddress: payment.assetAddress,
          payerAddress: payment.payerAddress,
          authorizationId: candidate?.id ?? null,
          lines: [
            `${shortAddress(payment.payerAddress)} paid ${money(payment.amount, payment.network, payment.assetAddress)} on ${networkLabel(payment.network)}.`,
            reason === "exceeds_authorization"
              ? "The payment does not match its authorization."
              : "No spend authorization was requested for it. It still counts toward your limits.",
          ],
        },
      });
    }

    const policies = await loadPolicies(
      tx,
      orgId,
      payment.network,
      payment.assetAddress,
    );
    const usage = await usageFor(
      tx,
      orgId,
      payment.network,
      payment.assetAddress,
      policies,
      now,
    );
    alerts.push(...budgetAlerts(orgId, budgetCrossings(policies, usage, now)));

    return raiseAlerts(tx, alerts);
  });

export const reconcileReportedPayment = async (
  payment: ReportedPayment,
  email: EmailClient | null = null,
  now: Date = new Date(),
): Promise<void> => {
  if (payment.status === "FAILED") {
    return;
  }
  const owners = await ownersOfPayerWallet(
    payment.payerAddress,
    payment.network,
  );
  for (const orgId of owners) {
    try {
      const raised = await reconcileForOrg(orgId, payment, now);
      void notifyFinance(email, orgId, raised);
    } catch (error) {
      appLogger.error("Could not reconcile a reported payment", {
        orgId,
        paymentId: payment.id,
        error,
      });
    }
  }
};
