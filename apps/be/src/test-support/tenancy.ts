import type { OrgRole, ProjectRole } from "@4mica/db";
import { vi } from "vitest";

export const ORG_ID = "019fce62-0000-7000-8000-0000000000a1";
export const OTHER_ORG_ID = "019fce62-0000-7000-8000-0000000000b2";
export const PROJECT_ID = "019fce62-0000-7000-8000-0000000000d1";
export const OTHER_PROJECT_ID = "019fce62-0000-7000-8000-0000000000d2";
export const SANDBOX_ENV_ID = "019fce62-0000-7000-8000-0000000000e1";
export const PRODUCTION_ENV_ID = "019fce62-0000-7000-8000-0000000000e2";

export const membershipRow = (
  role: OrgRole = "OWNER",
  orgId: string = ORG_ID,
  personal = true,
) => ({ role, organization: { id: orgId, personal } });

export interface ProjectRowOptions {
  id?: string;
  restricted?: boolean;
  restrictProduction?: boolean;
  archived?: boolean;
  memberRole?: ProjectRole | null;
  isDefault?: boolean;
}

export const projectRow = ({
  id = PROJECT_ID,
  restricted = false,
  restrictProduction = false,
  archived = false,
  memberRole = null,
  isDefault = id === PROJECT_ID,
}: ProjectRowOptions = {}) => ({
  id,
  slug: isDefault ? "default" : "other",
  isDefault,
  restricted,
  restrictProduction,
  archivedAt: archived ? new Date("2026-11-01T00:00:00Z") : null,
  members: memberRole ? [{ role: memberRole }] : [],
  environments: [
    { id: SANDBOX_ENV_ID, kind: "SANDBOX" },
    { id: PRODUCTION_ENV_ID, kind: "PRODUCTION" },
  ],
});

export const tenancyMocks = () => ({
  membership: { findFirst: vi.fn(), create: vi.fn() },
  auditLog: { create: vi.fn() },
  project: { findFirst: vi.fn(), findMany: vi.fn() },
});

export interface TenancyMocks {
  membership: { findFirst: ReturnType<typeof vi.fn> };
  auditLog: { create: ReturnType<typeof vi.fn> };
  project?: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany?: ReturnType<typeof vi.fn>;
  };
}

export const actAs = (
  mocks: TenancyMocks,
  role: OrgRole = "OWNER",
  orgId: string = ORG_ID,
  project: ProjectRowOptions = {},
) => {
  mocks.membership.findFirst.mockReset();
  mocks.membership.findFirst.mockImplementation(
    async ({ where }: { where: { organization?: { id?: string } } }) => {
      const requested = where.organization?.id;
      return requested === undefined || requested === orgId
        ? membershipRow(role, orgId)
        : null;
    },
  );
  mocks.auditLog.create.mockReset();
  mocks.auditLog.create.mockResolvedValue({ id: "audit" });

  if (mocks.project) {
    const row = projectRow(project);
    mocks.project.findFirst.mockReset();
    mocks.project.findFirst.mockImplementation(
      async ({
        where,
      }: {
        where: { organizationId?: string; id?: string; isDefault?: boolean };
      }) => {
        if (where.organizationId !== orgId) {
          return null;
        }
        if (where.id !== undefined) {
          return where.id === row.id ? row : null;
        }
        return where.isDefault && row.isDefault ? row : null;
      },
    );
    mocks.project.findMany?.mockReset();
    mocks.project.findMany?.mockImplementation(
      async ({ where }: { where: { organizationId?: string } }) =>
        where.organizationId === orgId ? [row] : [],
    );
  }
};

interface LockableTenancy {
  membership: { findFirst: ReturnType<typeof vi.fn> };
  project?: { findMany?: ReturnType<typeof vi.fn> };
}

interface MemberRow {
  role: OrgRole;
  suspendedAt?: Date | null;
  customRole?: {
    id: string;
    permissions: string[];
    projectRole: ProjectRole;
    deletedAt: Date | null;
  } | null;
}

interface ProjectAccessRow {
  id: string;
  restricted: boolean;
  members: { role: ProjectRole }[];
}

type Lookup<T> = (args: unknown) => Promise<T>;

const memberOf = (
  mocks: LockableTenancy,
  orgId: string,
  userId: string,
): Promise<MemberRow | null> =>
  (mocks.membership.findFirst as unknown as Lookup<MemberRow | null>)({
    where: { userId, organization: { id: orgId, deletedAt: null } },
  });

const projectsOf = async (
  mocks: LockableTenancy,
  orgId: string,
  userId: string,
): Promise<ProjectAccessRow[]> =>
  (await (
    mocks.project?.findMany as unknown as Lookup<ProjectAccessRow[]> | undefined
  )?.({
    where: { organizationId: orgId },
    select: {
      id: true,
      restricted: true,
      members: { where: { userId }, select: { role: true } },
    },
  })) ?? [];

export const visibilityRows = async (
  mocks: LockableTenancy,
  strings: TemplateStringsArray,
  values: unknown[],
): Promise<unknown[] | null> => {
  const sql = strings.join("?");
  if (sql.includes("FROM memberships m")) {
    const [orgId, userId] = values as [string, string];
    const row = await memberOf(mocks, orgId, userId);
    return row
      ? [
          {
            role: row.role,
            customRoleId: row.customRole?.id ?? null,
            suspended: Boolean(row.suspendedAt),
          },
        ]
      : [];
  }
  if (sql.includes("FROM custom_roles")) {
    const [id] = values as [string];
    const last = (await mocks.membership.findFirst.mock.results.at(-1)
      ?.value) as MemberRow | null;
    const custom = last?.customRole;
    return custom && custom.id === id && custom.deletedAt === null
      ? [
          {
            id: custom.id,
            permissions: custom.permissions,
            projectRole: custom.projectRole,
          },
        ]
      : [];
  }
  if (sql.includes("FROM project_memberships")) {
    const [userId, orgId] = values as [string, string];
    return (await projectsOf(mocks, orgId, userId)).flatMap((project) =>
      project.members[0]
        ? [{ projectId: project.id, role: project.members[0].role }]
        : [],
    );
  }
  if (sql.includes("FROM projects")) {
    const [orgId] = values as [string];
    return (await projectsOf(mocks, orgId, "")).map(({ id, restricted }) => ({
      id,
      restricted,
    }));
  }
  return null;
};
