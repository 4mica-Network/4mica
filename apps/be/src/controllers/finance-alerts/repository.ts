import {
  type FinancialAlertKind,
  type OrgRole,
  type Prisma,
  prisma,
} from "@4mica/db";
import { can, ROLE_PERMISSIONS } from "@auth/permissions";
import {
  lockVisibility,
  type Visibility,
  visibleWhere,
} from "@auth/visibility";

type Db = Pick<Prisma.TransactionClient, "financialAlert">;

export const ALERT_SELECT = {
  id: true,
  organizationId: true,
  projectId: true,
  kind: true,
  policyId: true,
  title: true,
  detail: true,
  createdAt: true,
  acknowledgedAt: true,
  acknowledgedById: true,
} satisfies Prisma.FinancialAlertSelect;

export type AlertRow = Prisma.FinancialAlertGetPayload<{
  select: typeof ALERT_SELECT;
}>;

export interface AlertInput {
  orgId: string;
  projectId?: string | null;
  kind: FinancialAlertKind;
  policyId?: string | null;
  title: string;
  detail: Prisma.InputJsonValue;
  dedupeKey: string;
}

export const raiseAlerts = async (
  db: Db,
  inputs: AlertInput[],
): Promise<AlertRow[]> => {
  if (inputs.length === 0) {
    return [];
  }
  return db.financialAlert.createManyAndReturn({
    data: inputs.map((input) => ({
      organizationId: input.orgId,
      projectId: input.projectId ?? null,
      kind: input.kind,
      policyId: input.policyId ?? null,
      title: input.title.slice(0, 160),
      detail: input.detail,
      dedupeKey: input.dedupeKey.slice(0, 160),
    })),
    skipDuplicates: true,
    select: ALERT_SELECT,
  });
};

const FINANCE_ROLES = (Object.keys(ROLE_PERMISSIONS) as OrgRole[]).filter(
  (role) => can(role, "finance.manage"),
);

const FINANCE_MANAGERS = {
  OR: [
    { role: { in: FINANCE_ROLES }, customRoleId: null },
    { role: "OWNER" },
    {
      customRole: { deletedAt: null, permissions: { has: "finance.manage" } },
    },
  ],
} satisfies Prisma.MembershipWhereInput;

export const financeRecipients = async (orgId: string) => {
  const [organization, settings] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true, handle: true },
    }),
    prisma.governanceSettings.findUnique({
      where: { organizationId: orgId },
      select: { financeRecipientIds: true },
    }),
  ]);

  const chosen = settings?.financeRecipientIds ?? [];
  const members = await prisma.membership.findMany({
    where: {
      organizationId: orgId,
      suspendedAt: null,
      ...(chosen.length > 0 ? { userId: { in: chosen } } : FINANCE_MANAGERS),
    },
    select: {
      role: true,
      customRole: {
        select: {
          id: true,
          permissions: true,
          projectRole: true,
          deletedAt: true,
        },
      },
      user: {
        select: {
          name: true,
          email: true,
          emailVerified: true,
          deletedAt: true,
        },
      },
    },
  });

  return {
    workspaceName: organization?.name || organization?.handle || "Workspace",
    recipients: members
      .filter(
        (member) =>
          chosen.length > 0 ||
          can(
            {
              role: member.role,
              custom:
                member.customRole && member.customRole.deletedAt === null
                  ? member.customRole
                  : null,
            },
            "finance.manage",
          ),
      )
      .map((member) => member.user)
      .filter(
        (user): user is typeof user & { email: string } =>
          user.email !== null && user.emailVerified && user.deletedAt === null,
      ),
  };
};

export interface ListAlertsFilter {
  acknowledged?: boolean;
  kind?: FinancialAlertKind;
  cursor?: string;
  limit: number;
}

export const listAlerts = async (
  scope: Visibility,
  filter: ListAlertsFilter,
) => {
  const rows = await prisma.financialAlert.findMany({
    where: {
      ...visibleWhere(scope),
      ...(filter.acknowledged === undefined
        ? {}
        : { acknowledgedAt: filter.acknowledged ? { not: null } : null }),
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(filter.cursor ? { id: { lt: filter.cursor } } : {}),
    },
    orderBy: { id: "desc" },
    take: filter.limit + 1,
    select: ALERT_SELECT,
  });

  const items = rows.slice(0, filter.limit);
  return {
    items,
    nextCursor: rows.length > filter.limit ? (items.at(-1)?.id ?? null) : null,
  };
};

export const acknowledgeAlert = async (
  tx: Prisma.TransactionClient,
  scope: Visibility,
  id: string,
): Promise<{ row: AlertRow; acknowledged: boolean } | null> => {
  const access = await lockVisibility(tx, scope, "finance.manage");
  if (!access) {
    return null;
  }
  const where = { id, ...visibleWhere(access.visibility) };
  const { count } = await tx.financialAlert.updateMany({
    where: { ...where, acknowledgedAt: null },
    data: { acknowledgedAt: new Date(), acknowledgedById: scope.userId },
  });
  const row = await tx.financialAlert.findFirst({
    where,
    select: ALERT_SELECT,
  });
  return row ? { row, acknowledged: count > 0 } : null;
};

export const userNames = async (
  ids: string[],
): Promise<Map<string, string>> => {
  const unique = [...new Set(ids)];
  if (unique.length === 0) {
    return new Map();
  }
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return new Map(users.map((user) => [user.id, user.name]));
};
