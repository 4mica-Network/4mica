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
