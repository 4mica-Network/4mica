import {
  type ApprovalStatus,
  type ApprovalVote,
  type OrgRole,
  type PaymentNetwork,
  type Prisma,
  prisma,
} from "@4mica/db";
import { can, type RoleSubject } from "@auth/permissions";
import { onApprovalResolved } from "@controllers/spend/approval-hook";
import { payloadHash } from "@utils/canonical";
import {
  type CreateSellerApprovalInput,
  DEFAULT_APPROVAL_TTL_HOURS,
  type ListApprovalsQuery,
  SELLER_PAYMENT_ACTION,
  type UpdateGovernanceInput,
} from "./schema";

type Tx = Prisma.TransactionClient;

const HOUR_MS = 3_600_000;
const EXPIRY_BATCH = 100;
const ROLE_GRANT_ACTION = "member.role_grant";
const ROLE_GRANT_DECIDERS: readonly OrgRole[] = ["OWNER", "ADMIN"];

export const APPROVAL_SELECT = {
  id: true,
  organizationId: true,
  kind: true,
  action: true,
  summary: true,
  payload: true,
  status: true,
  requiredApprovals: true,
  requestedById: true,
  requestedByApiKeyId: true,
  projectId: true,
  expiresAt: true,
  createdAt: true,
  decidedAt: true,
  executedAt: true,
  requestedBy: { select: { id: true, name: true } },
  decisions: {
    orderBy: { createdAt: "asc" },
    select: {
      vote: true,
      comment: true,
      createdAt: true,
      user: { select: { id: true, name: true } },
    },
  },
} as const satisfies Prisma.ApprovalRequestSelect;

export type ApprovalRow = Prisma.ApprovalRequestGetPayload<{
  select: typeof APPROVAL_SELECT;
}>;

export interface Viewer extends RoleSubject {
  userId: string;
}

const isExpired = (row: { status: ApprovalStatus; expiresAt: Date }) =>
  row.status === "PENDING" && row.expiresAt.getTime() <= Date.now();

const decisionBlocker = (
  row: ApprovalRow,
  viewer: Viewer,
): DecideFailure | null => {
  if (row.status !== "PENDING" || isExpired(row)) {
    return "closed";
  }
  if (row.requestedById === viewer.userId) {
    return "self_approval";
  }
  if (
    row.kind === "GOVERNANCE" &&
    row.action === ROLE_GRANT_ACTION &&
    !ROLE_GRANT_DECIDERS.includes(viewer.role)
  ) {
    return "forbidden_role";
  }
  if (row.decisions.some((decision) => decision.user.id === viewer.userId)) {
    return "already_decided";
  }
  return null;
};

export const toApproval = (row: ApprovalRow, viewer: Viewer) => {
  const { organizationId: _org, requestedById: _by, ...rest } = row;
  return {
    ...rest,
    status: isExpired(row) ? ("EXPIRED" as const) : row.status,
    approvals: row.decisions.filter((decision) => decision.vote === "APPROVE")
      .length,
    canDecide:
      can(viewer, "approvals.decide") && decisionBlocker(row, viewer) === null,
  };
};

const resolved = (
  tx: Tx,
  row: { id: string; organizationId: string; kind: ApprovalRow["kind"] },
  status: ApprovalStatus,
) =>
  onApprovalResolved(tx, {
    id: row.id,
    organizationId: row.organizationId,
    kind: row.kind,
    status,
  });

const closeAs = async (
  tx: Tx,
  row: { id: string; organizationId: string; kind: ApprovalRow["kind"] },
  status: ApprovalStatus,
): Promise<boolean> => {
  const { count } = await tx.approvalRequest.updateMany({
    where: { id: row.id, status: "PENDING" },
    data: { status, decidedAt: new Date() },
  });
  if (count === 0) {
    return false;
  }
  await resolved(tx, row, status);
  return true;
};

export const expireStaleApprovals = async (
  orgId: string,
  id?: string,
): Promise<number> => {
  const stale = await prisma.approvalRequest.findMany({
    where: {
      organizationId: orgId,
      ...(id ? { id } : {}),
      status: "PENDING",
      expiresAt: { lte: new Date() },
    },
    select: { id: true, organizationId: true, kind: true },
    orderBy: { expiresAt: "asc" },
    take: EXPIRY_BATCH,
  });

  let expired = 0;
  for (const row of stale) {
    if (await prisma.$transaction((tx) => closeAs(tx, row, "EXPIRED"))) {
      expired++;
    }
  }
  return expired;
};

export const listApprovals = async (
  orgId: string,
  { status, kind, cursor, limit }: ListApprovalsQuery,
) => {
  await expireStaleApprovals(orgId);

  const rows = await prisma.approvalRequest.findMany({
    where: {
      organizationId: orgId,
      ...(status ? { status } : {}),
      ...(kind ? { kind } : {}),
      ...(cursor ? { id: { lt: cursor } } : {}),
    },
    orderBy: { id: "desc" },
    take: limit + 1,
    select: APPROVAL_SELECT,
  });

  const items = rows.slice(0, limit);
  return {
    items,
    nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null,
  };
};

export const findApproval = async (orgId: string, id: string) => {
  await expireStaleApprovals(orgId, id);
  return prisma.approvalRequest.findFirst({
    where: { id, organizationId: orgId },
    select: APPROVAL_SELECT,
  });
};

export type DecideFailure =
  | "not_found"
  | "closed"
  | "self_approval"
  | "forbidden_role"
  | "already_decided"
  | "not_requester";

export type ApprovalChange =
  | { ok: true; row: ApprovalRow; status: ApprovalStatus }
  | { ok: false; reason: DecideFailure };

const lockApproval = async (tx: Tx, orgId: string, id: string) => {
  await tx.$queryRaw`SELECT id FROM approval_requests WHERE id = ${id} AND organization_id = ${orgId} FOR UPDATE`;
  return tx.approvalRequest.findFirst({
    where: { id, organizationId: orgId },
    select: APPROVAL_SELECT,
  });
};

const reread = (tx: Tx, id: string) =>
  tx.approvalRequest.findUniqueOrThrow({
    where: { id },
    select: APPROVAL_SELECT,
  });

export const decideApproval = (
  orgId: string,
  id: string,
  viewer: Viewer,
  vote: ApprovalVote,
  comment: string | null,
): Promise<ApprovalChange> =>
  prisma.$transaction(async (tx) => {
    const row = await lockApproval(tx, orgId, id);
    if (!row) {
      return { ok: false, reason: "not_found" };
    }
    if (isExpired(row)) {
      await closeAs(tx, row, "EXPIRED");
      return { ok: false, reason: "closed" };
    }
    const blocker = decisionBlocker(row, viewer);
    if (blocker) {
      return { ok: false, reason: blocker };
    }

    await tx.approvalDecision.create({
      data: { approvalRequestId: id, userId: viewer.userId, vote, comment },
    });

    const approvals =
      row.decisions.filter((decision) => decision.vote === "APPROVE").length +
      (vote === "APPROVE" ? 1 : 0);
    const status: ApprovalStatus =
      vote === "REJECT"
        ? "REJECTED"
        : approvals >= row.requiredApprovals
          ? "APPROVED"
          : "PENDING";

    if (status !== "PENDING") {
      await closeAs(tx, row, status);
    }

    return { ok: true, row: await reread(tx, id), status };
  });

export const cancelApproval = (
  orgId: string,
  id: string,
  userId: string,
): Promise<ApprovalChange> =>
  prisma.$transaction(async (tx) => {
    const row = await lockApproval(tx, orgId, id);
    if (!row) {
      return { ok: false, reason: "not_found" };
    }
    if (isExpired(row)) {
      await closeAs(tx, row, "EXPIRED");
      return { ok: false, reason: "closed" };
    }
    if (row.status !== "PENDING") {
      return { ok: false, reason: "closed" };
    }
    if (row.requestedById !== userId) {
      return { ok: false, reason: "not_requester" };
    }

    await closeAs(tx, row, "CANCELLED");
    return { ok: true, row: await reread(tx, id), status: "CANCELLED" };
  });

export const normalizeAmount = (value: string): string => {
  const [whole = "0", fraction = ""] = value.trim().split(".");
  const integer = whole.replace(/^0+(?=\d)/, "");
  const decimals = fraction.replace(/0+$/, "");
  return decimals ? `${integer}.${decimals}` : integer;
};

export interface SellerPaymentMatch {
  payerAddress: string;
  network: PaymentNetwork;
  amount: string;
  assetAddress?: string | null;
}

const sellerPaymentPayload = (input: CreateSellerApprovalInput) => ({
  customerId: input.customerId,
  payerAddress: input.payerAddress.toLowerCase(),
  network: input.network,
  assetAddress: input.assetAddress?.toLowerCase() ?? null,
  amount: normalizeAmount(input.amount),
  resource: input.resource,
  reason: input.reason,
});

export const customerInProject = async (
  orgId: string,
  projectId: string,
  id: string,
): Promise<boolean> =>
  (await prisma.customer.count({
    where: { id, organizationId: orgId, projectId, deletedAt: null },
  })) > 0;

export const SELLER_APPROVAL_SELECT = {
  id: true,
  status: true,
  expiresAt: true,
  decidedAt: true,
} as const;

export const createSellerApproval = async (
  key: { id: string; orgId: string; projectId: string },
  input: CreateSellerApprovalInput,
  summary: string,
) => {
  const settings = await prisma.governanceSettings.findUnique({
    where: { organizationId: key.orgId },
    select: { approvalsRequired: true, approvalTtlHours: true },
  });
  const payload = sellerPaymentPayload(input);
  const ttl = settings?.approvalTtlHours ?? DEFAULT_APPROVAL_TTL_HOURS;

  return prisma.approvalRequest.create({
    data: {
      organizationId: key.orgId,
      projectId: key.projectId,
      kind: "SELLER_PAYMENT",
      action: SELLER_PAYMENT_ACTION,
      summary,
      payload,
      payloadHash: payloadHash(SELLER_PAYMENT_ACTION, payload),
      requestedByApiKeyId: key.id,
      requiredApprovals: Math.max(1, settings?.approvalsRequired ?? 1),
      expiresAt: new Date(Date.now() + ttl * HOUR_MS),
    },
    select: SELLER_APPROVAL_SELECT,
  });
};

export const findSellerApproval = async (
  orgId: string,
  projectId: string,
  id: string,
) => {
  await expireStaleApprovals(orgId, id);
  return prisma.approvalRequest.findFirst({
    where: { id, organizationId: orgId, projectId, kind: "SELLER_PAYMENT" },
    select: SELLER_APPROVAL_SELECT,
  });
};

const payloadField = (payload: Prisma.JsonValue, field: string) =>
  payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload[field]
    : undefined;

export const consumeSellerApproval = async (
  orgId: string,
  id: string,
  match: SellerPaymentMatch,
): Promise<boolean> => {
  const row = await prisma.approvalRequest.findFirst({
    where: {
      id,
      organizationId: orgId,
      kind: "SELLER_PAYMENT",
      status: "APPROVED",
      executedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true, payload: true },
  });
  if (!row) {
    return false;
  }

  const payer = payloadField(row.payload, "payerAddress");
  const network = payloadField(row.payload, "network");
  const amount = payloadField(row.payload, "amount");
  const asset = payloadField(row.payload, "assetAddress") ?? null;
  if (
    typeof payer !== "string" ||
    typeof amount !== "string" ||
    payer !== match.payerAddress.toLowerCase() ||
    network !== match.network ||
    normalizeAmount(amount) !== normalizeAmount(match.amount) ||
    asset !== (match.assetAddress?.toLowerCase() ?? null)
  ) {
    return false;
  }

  const { count } = await prisma.approvalRequest.updateMany({
    where: {
      id: row.id,
      status: "APPROVED",
      executedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { executedAt: new Date() },
  });
  return count > 0;
};

export const GOVERNANCE_DEFAULTS = {
  approvalsRequired: 0,
  governedActions: [] as string[],
  approvalTtlHours: DEFAULT_APPROVAL_TTL_HOURS,
  financeRecipientIds: [] as string[],
  auditRetentionDays: null as number | null,
};

const GOVERNANCE_SELECT = {
  approvalsRequired: true,
  governedActions: true,
  approvalTtlHours: true,
  financeRecipientIds: true,
  auditRetentionDays: true,
} as const;

export const getGovernance = async (orgId: string) =>
  (await prisma.governanceSettings.findUnique({
    where: { organizationId: orgId },
    select: GOVERNANCE_SELECT,
  })) ?? GOVERNANCE_DEFAULTS;

export const nonMembers = async (
  orgId: string,
  userIds: string[],
): Promise<string[]> => {
  if (userIds.length === 0) {
    return [];
  }
  const rows = await prisma.membership.findMany({
    where: { organizationId: orgId, userId: { in: userIds } },
    select: { userId: true },
  });
  const members = new Set(rows.map((row) => row.userId));
  return userIds.filter((id) => !members.has(id));
};

export const saveGovernance = (orgId: string, input: UpdateGovernanceInput) =>
  prisma.governanceSettings.upsert({
    where: { organizationId: orgId },
    create: { ...GOVERNANCE_DEFAULTS, ...input, organizationId: orgId },
    update: input,
    select: GOVERNANCE_SELECT,
  });
