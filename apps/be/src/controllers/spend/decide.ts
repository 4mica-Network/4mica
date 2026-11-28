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
import { amountText } from "@utils/amount";
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
  LINKABLE_STATUSES,
  linkPayment,
  type MatchablePayment,
  type PaymentMismatch,
  paymentMismatch,
} from "./matching";
import {
  type AuthorizationOwner,
  type AuthorizationRow,
  approvalTtlHours,
  cancelPendingApproval,
  expirePendingApproval,
  expireReservation,
  findAuthorization,
  findReportedPayments,
  hasEnforcingPolicy,
  isReqIdConflict,
  loadPolicies,
  loadUsage,
  lockSpend,
  ownedBy,
  ownersOfPayerWallet,
  reqIdInUse,
  runInTransaction,
  settlementCandidates,
  transitionAuthorization,
  type UsageOptions,
} from "./repository";

type Db = Prisma.TransactionClient;

const HOUR_MS = 3_600_000;
export const PAYMENT_APPROVAL_ACTION = "payment.authorize";

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
  options: UsageOptions = {},
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
        options,
      )
    : { authorizations: [], payments: [], agentWallets: {} };

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
  apiKeyPrefix: string | null;
  serviceAccountId: string | null;
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

const reqIdConflictAs = async <T>(
  work: () => Promise<T>,
  conflict: T,
): Promise<T> => {
  try {
    return await work();
  } catch (error) {
    if (isReqIdConflict(error)) {
      return conflict;
    }
    throw error;
  }
};

export const authorizeSpend = async (
  input: AuthorizeInput,
  now: Date = new Date(),
): Promise<AuthorizeOutcome> =>
  reqIdConflictAs(() => decideSpend(input, now), {
    kind: "req_id_in_use",
  } as const);

const decideSpend = async (
  input: AuthorizeInput,
  now: Date,
): Promise<AuthorizeOutcome> =>
  runInTransaction(async (tx) => {
    await lockSpend(tx, input.orgId, input.network, input.assetAddress);

    if (
      input.reqId &&
      (await reqIdInUse(
        tx,
        {
          orgId: input.orgId,
          network: input.network,
          assetAddress: input.assetAddress,
        },
        input.reqId,
      ))
    ) {
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
      {
        claim: input.reqId
          ? {
              reqId: input.reqId,
              payerAddress: input.payerAddress,
              recipientAddress: input.recipientAddress,
            }
          : null,
      },
    );
    const decision = evaluate(subject, policies, usage, now);

    const base = {
      organizationId: input.orgId,
      projectId: input.projectId,
      environment: input.environment,
      apiKeyId: input.apiKeyId,
      issuedByKeyId: input.apiKeyId,
      issuedByKeyPrefix: input.apiKeyPrefix,
      serviceAccountId: input.serviceAccountId,
      agentId: input.agentId,
      network: input.network,
      assetAddress: input.assetAddress,
      payerAddress: input.payerAddress,
      recipientAddress: input.recipientAddress,
      amount: input.amount,
      authorizedAmount: input.amount,
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
    const row = await findAuthorization(tx, id, {
      organizationId: input.orgId,
    });
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
  scope: Prisma.SpendAuthorizationWhereInput = {
    organizationId: row.organizationId,
  },
): Promise<void> => {
  if (row.status !== "PENDING_APPROVAL" || status === "PENDING") {
    return;
  }

  const move = (data: Prisma.SpendAuthorizationUncheckedUpdateManyInput) =>
    transitionAuthorization(tx, row.id, ["PENDING_APPROVAL"], data, scope);

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
    { excludeId: row.id },
  );
  const decision = evaluate(subject, policies, usage, now, {
    ignoreApprovalThreshold: true,
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
  owner: AuthorizationOwner,
  id: string,
  now: Date = new Date(),
): Promise<AuthorizationRow | null> =>
  runInTransaction(async (tx) => {
    const scope = ownedBy(owner);
    const row = await findAuthorization(tx, id, scope);
    if (!row) {
      return null;
    }

    if (row.status === "RESERVED" && row.expiresAt <= now) {
      await expireReservation(tx, row.id, now, scope);
      return findAuthorization(tx, id, scope);
    }

    if (row.status !== "PENDING_APPROVAL") {
      return row;
    }

    const approval = row.approvalRequest;
    if (!approval) {
      if (row.expiresAt <= now) {
        await resolvePendingAuthorization(tx, row, "EXPIRED", now, scope);
        return findAuthorization(tx, id, scope);
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

    await resolvePendingAuthorization(tx, row, status, now, scope);
    return findAuthorization(tx, id, scope);
  });

export type TransitionOutcome =
  | { kind: "ok"; row: AuthorizationRow }
  | { kind: "not_found" }
  | { kind: "conflict"; row: AuthorizationRow }
  | { kind: "req_id_mismatch" }
  | { kind: "req_id_in_use" };

const alreadyConsumed = (
  row: AuthorizationRow,
  reqId: string | null,
): TransitionOutcome =>
  reqId !== null && row.reqId === reqId
    ? { kind: "ok", row }
    : { kind: "conflict", row };

export const consumeAuthorization = async (
  owner: AuthorizationOwner,
  id: string,
  reqId: string | null,
  now: Date = new Date(),
): Promise<TransitionOutcome> => {
  const current = await refreshAuthorization(owner, id, now);
  if (!current) {
    return { kind: "not_found" };
  }
  if (current.status === "CONSUMED") {
    return alreadyConsumed(current, reqId);
  }
  if (current.status !== "RESERVED") {
    return { kind: "conflict", row: current };
  }
  if (reqId && current.reqId && reqId !== current.reqId) {
    return { kind: "req_id_mismatch" };
  }

  const scope = ownedBy(owner);
  return reqIdConflictAs(
    () =>
      runInTransaction(async (tx): Promise<TransitionOutcome> => {
        await lockSpend(
          tx,
          current.organizationId,
          current.network,
          current.assetAddress,
        );
        if (
          reqId &&
          !current.reqId &&
          (await reqIdInUse(
            tx,
            {
              orgId: current.organizationId,
              network: current.network,
              assetAddress: current.assetAddress,
            },
            reqId,
            current.id,
          ))
        ) {
          return { kind: "req_id_in_use" };
        }
        const finalReqId = reqId ?? current.reqId;
        const { count } = await transitionAuthorization(
          tx,
          id,
          ["RESERVED"],
          { status: "CONSUMED", consumedAt: now, reqId: finalReqId },
          { ...scope, expiresAt: { gt: now } },
        );
        const row = await findAuthorization(tx, id, scope);
        if (!row) {
          return { kind: "not_found" };
        }
        if (count > 0) {
          await writeAudit(tx, {
            orgId: row.organizationId,
            projectId: row.projectId,
            actorApiKeyId: owner.keyId,
            action: "spend.consumed",
            targetType: "spend_authorization",
            targetId: row.id,
            metadata: {
              reqId: finalReqId,
              amount: amountText(row.amount),
              network: row.network,
              assetAddress: row.assetAddress,
            },
          });
          const settled = await settleWithReportedPayment(tx, row, now);
          return {
            kind: "ok",
            row: settled
              ? ((await findAuthorization(tx, id, scope)) ?? row)
              : row,
          };
        }
        return row.status === "CONSUMED"
          ? alreadyConsumed(row, reqId)
          : { kind: "conflict", row };
      }),
    { kind: "req_id_in_use" },
  );
};

export const releaseAuthorization = async (
  owner: AuthorizationOwner,
  id: string,
  now: Date = new Date(),
): Promise<TransitionOutcome> => {
  const current = await refreshAuthorization(owner, id, now);
  if (!current) {
    return { kind: "not_found" };
  }
  if (current.status === "RELEASED") {
    return { kind: "ok", row: current };
  }
  if (current.status !== "RESERVED" && current.status !== "PENDING_APPROVAL") {
    return { kind: "conflict", row: current };
  }

  const scope = ownedBy(owner);
  return runInTransaction(async (tx): Promise<TransitionOutcome> => {
    const { count } = await transitionAuthorization(
      tx,
      id,
      ["RESERVED", "PENDING_APPROVAL"],
      { status: "RELEASED" },
      scope,
    );
    if (count > 0) {
      await writeAudit(tx, {
        orgId: current.organizationId,
        projectId: current.projectId,
        actorApiKeyId: owner.keyId,
        action: "spend.released",
        targetType: "spend_authorization",
        targetId: current.id,
        metadata: {
          from: current.status,
          amount: amountText(current.amount),
          approvalRequestId: current.approvalRequestId,
        },
      });
    }
    if (count > 0 && current.approvalRequestId) {
      await cancelPendingApproval(tx, current.approvalRequestId);
    }
    const row = await findAuthorization(tx, id, scope);
    if (!row) {
      return { kind: "not_found" };
    }
    return count > 0 || row.status === "RELEASED"
      ? { kind: "ok", row }
      : { kind: "conflict", row };
  });
};

export type ReportedPayment = MatchablePayment & { amount: string };

type Unmatched = PaymentMismatch | "not_authorized";

const MISMATCH_LINES: Record<Unmatched, string> = {
  not_authorized:
    "No spend authorization was requested for it. It still counts toward your limits.",
  payment_failed: "The payment failed.",
  req_id_mismatch: "Its reqId differs from its authorization's.",
  network_mismatch:
    "It was paid on a different network than its authorization named.",
  asset_mismatch:
    "It was paid in a different asset than its authorization named.",
  payer_mismatch:
    "It was paid from a different wallet than its authorization named.",
  recipient_mismatch:
    "It paid a different recipient than its authorization named.",
  exceeds_authorization: "It paid more than its authorization allowed.",
  already_settled: "Its authorization was already settled by another payment.",
};

const settlementAudit = (
  tx: Db,
  authorization: AuthorizationRow,
  payment: MatchablePayment,
) =>
  writeAudit(tx, {
    orgId: authorization.organizationId,
    projectId: authorization.projectId,
    action: "spend.reconciled",
    targetType: "spend_authorization",
    targetId: authorization.id,
    metadata: {
      paymentId: payment.id,
      reqId: payment.reqId,
      authorizedAmount: amountText(
        authorization.authorizedAmount ?? authorization.amount,
      ),
      settledAmount: amountText(payment.amount),
      network: payment.network,
      assetAddress: payment.assetAddress,
      recipientAddress: payment.recipientAddress,
    },
  });

const settleWithReportedPayment = async (
  tx: Db,
  authorization: AuthorizationRow,
  now: Date,
): Promise<MatchablePayment | null> => {
  if (authorization.paymentId !== null) {
    return null;
  }
  for (const payment of await findReportedPayments(tx, authorization)) {
    if (await linkPayment(tx, authorization, payment, now)) {
      await settlementAudit(tx, authorization, payment);
      return payment;
    }
  }
  return null;
};

const HOLDS_REQ_ID = new Set<string>([
  "RESERVED",
  "PENDING_APPROVAL",
  "CONSUMED",
]);

const settlementCandidate = (
  candidates: AuthorizationRow[],
  payment: MatchablePayment,
): { candidate: AuthorizationRow | null; reason: Unmatched | null } => {
  const holder = candidates.find(
    (row) => HOLDS_REQ_ID.has(row.status) && row.reqIdConflict === null,
  );
  const pool = (holder ? [holder] : candidates).filter((row) =>
    LINKABLE_STATUSES.includes(row.status),
  );
  const match =
    pool.find((row) => row.paymentId === payment.id) ??
    pool.find((row) => paymentMismatch(row, payment) === null);
  if (match) {
    return { candidate: match, reason: null };
  }
  const nearest = pool[0] ?? holder ?? null;
  return {
    candidate: nearest,
    reason: (nearest && paymentMismatch(nearest, payment)) ?? "not_authorized",
  };
};

const reconcileForOrg = async (
  orgId: string,
  payment: ReportedPayment,
  now: Date,
): Promise<AlertRow[]> =>
  runInTransaction(async (tx) => {
    await lockSpend(tx, orgId, payment.network, payment.assetAddress);

    const { candidate, reason } = settlementCandidate(
      await settlementCandidates(tx, orgId, payment),
      payment,
    );
    const alerts: AlertInput[] = [];

    if (candidate && reason === null) {
      if (await linkPayment(tx, candidate, payment, now)) {
        await settlementAudit(tx, candidate, payment);
      }
    } else if (reason !== null) {
      const enforcing = await hasEnforcingPolicy(tx, orgId);
      if (candidate || enforcing) {
        await writeAudit(tx, {
          orgId,
          projectId: candidate?.projectId ?? null,
          action: "spend.reconciliation_unmatched",
          targetType: "payment",
          targetId: payment.id,
          metadata: {
            reason,
            reqId: payment.reqId,
            authorizationId: candidate?.id ?? null,
            amount: payment.amount,
            network: payment.network,
            assetAddress: payment.assetAddress,
            payerAddress: payment.payerAddress,
            recipientAddress: payment.recipientAddress,
          },
        });
      }
      if (enforcing) {
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
            recipientAddress: payment.recipientAddress,
            authorizationId: candidate?.id ?? null,
            lines: [
              `${shortAddress(payment.payerAddress)} paid ${money(payment.amount, payment.network, payment.assetAddress)} to ${shortAddress(payment.recipientAddress)} on ${networkLabel(payment.network)}.`,
              MISMATCH_LINES[reason],
            ],
          },
        });
      }
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
