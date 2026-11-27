import type { OrgRole } from "@4mica/db";
import { vi } from "vitest";

export const ORG_ID = "019fce62-0000-7000-8000-0000000000a1";
export const OTHER_ORG_ID = "019fce62-0000-7000-8000-0000000000b2";

export const membershipRow = (
  role: OrgRole = "OWNER",
  orgId: string = ORG_ID,
  personal = true,
) => ({ role, organization: { id: orgId, personal } });

export const tenancyMocks = () => ({
  membership: { findFirst: vi.fn(), create: vi.fn() },
  auditLog: { create: vi.fn() },
});

export type TenancyMocks = ReturnType<typeof tenancyMocks>;

export const actAs = (
  mocks: TenancyMocks,
  role: OrgRole = "OWNER",
  orgId: string = ORG_ID,
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
};
