import {
  type PaymentNetwork,
  type Prisma,
  prisma,
  type SpendingPolicyMode,
  type SpendingPolicyScope,
} from "@4mica/db";
import { usageOf } from "@controllers/spend/engine";
import {
  ENGINE_POLICY_SELECT,
  loadUsage,
  toEnginePolicy,
} from "@controllers/spend/repository";
import { optionalAmountText } from "@utils/amount";
import { fromUnits } from "@utils/units";

export const POLICY_SELECT = {
  ...ENGINE_POLICY_SELECT,
  enabled: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.SpendingPolicySelect;

export type PolicyRow = Prisma.SpendingPolicyGetPayload<{
  select: typeof POLICY_SELECT;
}>;

export interface PolicyUsage {
  asset: { network: PaymentNetwork; assetAddress: string | null };
  spentToday: string;
  spentThisMonth: string;
  reserved: string;
}

export const toPolicy = (row: PolicyRow, usage: PolicyUsage | null) => ({
  id: row.id,
  name: row.name,
  scope: row.scope,
  projectId: row.projectId,
  agentId: row.agentId,
  apiKeyId: row.apiKeyId,
  mode: row.mode,
  network: row.network,
  assetAddress: row.assetAddress,
  perPaymentLimit: optionalAmountText(row.perPaymentLimit),
  dailyLimit: optionalAmountText(row.dailyLimit),
  monthlyLimit: optionalAmountText(row.monthlyLimit),
  approvalThreshold: optionalAmountText(row.approvalThreshold),
  approvalsRequired: row.approvalsRequired,
  allowedRecipients: row.allowedRecipients,
  alertThresholds: row.alertThresholds,
  frozen: row.frozenAt !== null,
  frozenAt: row.frozenAt?.toISOString() ?? null,
  enabled: row.enabled,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  createdBy: row.createdBy,
  usage,
});

export const usageForPolicies = async (
  orgId: string,
  rows: PolicyRow[],
  now: Date = new Date(),
): Promise<Map<string, PolicyUsage>> => {
  const groups = new Map<string, PolicyRow[]>();
  for (const row of rows) {
    if (row.network === null) {
      continue;
    }
    const key = `${row.network}:${row.assetAddress ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const result = new Map<string, PolicyUsage>();
  for (const group of groups.values()) {
    const first = group[0] as PolicyRow;
    const network = first.network as PaymentNetwork;
    const data = await loadUsage(
      prisma,
      orgId,
      network,
      first.assetAddress,
      group.flatMap((row) =>
        row.scope === "AGENT" && row.agentId ? [row.agentId] : [],
      ),
      now,
    );
    for (const row of group) {
      const usage = usageOf(toEnginePolicy(row), data, now);
      result.set(row.id, {
        asset: { network, assetAddress: row.assetAddress },
        spentToday: fromUnits(usage.day),
        spentThisMonth: fromUnits(usage.month),
        reserved: fromUnits(usage.reserved),
      });
    }
  }
  return result;
};

export interface ListPoliciesFilter {
  scope?: SpendingPolicyScope;
  projectId?: string;
  mode?: SpendingPolicyMode;
}

export const listPolicies = (orgId: string, filter: ListPoliciesFilter) =>
  prisma.spendingPolicy.findMany({
    where: {
      organizationId: orgId,
      deletedAt: null,
      ...(filter.scope ? { scope: filter.scope } : {}),
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.mode ? { mode: filter.mode } : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: POLICY_SELECT,
  });

export const findPolicy = (orgId: string, id: string) =>
  prisma.spendingPolicy.findFirst({
    where: { id, organizationId: orgId, deletedAt: null },
    select: POLICY_SELECT,
  });

export const createPolicy = (data: Prisma.SpendingPolicyUncheckedCreateInput) =>
  prisma.spendingPolicy.create({ data, select: POLICY_SELECT });

export const updatePolicy = async (
  orgId: string,
  id: string,
  data: Prisma.SpendingPolicyUncheckedUpdateManyInput,
  where: Prisma.SpendingPolicyWhereInput = {},
) => {
  const { count } = await prisma.spendingPolicy.updateMany({
    where: { id, organizationId: orgId, deletedAt: null, ...where },
    data,
  });
  return count > 0 ? findPolicy(orgId, id) : null;
};

export const deletePolicy = async (orgId: string, id: string) =>
  (
    await prisma.spendingPolicy.updateMany({
      where: { id, organizationId: orgId, deletedAt: null },
      data: { deletedAt: new Date() },
    })
  ).count > 0;

const visibility = (userId: string) => ({
  restricted: true,
  members: { where: { userId }, select: { role: true } },
});

export const findProjectTarget = (orgId: string, userId: string, id: string) =>
  prisma.project.findFirst({
    where: { id, organizationId: orgId, deletedAt: null },
    select: { id: true, ...visibility(userId) },
  });

export const findAgentTarget = (orgId: string, userId: string, id: string) =>
  prisma.agent.findFirst({
    where: { id, organizationId: orgId, deletedAt: null },
    select: {
      id: true,
      projectId: true,
      project: { select: visibility(userId) },
    },
  });

export const findApiKeyTarget = (orgId: string, userId: string, id: string) =>
  prisma.apiKey.findFirst({
    where: { id, organizationId: orgId, revokedAt: null },
    select: {
      id: true,
      projectId: true,
      project: { select: visibility(userId) },
    },
  });
