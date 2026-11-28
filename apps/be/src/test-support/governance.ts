import type { GovernedAction } from "@controllers/approvals/governance";
import { payloadHash } from "@utils/canonical";
import type { vi } from "vitest";

type Mock = ReturnType<typeof vi.fn>;

export const APPROVAL_ID = "019fce62-9999-7000-8000-0000000000a1";
export const APPROVAL_HEADERS = { "x-approval-id": APPROVAL_ID };

export interface GovernanceMocks {
  governanceSettings: { findUnique: Mock };
  approvalRequest: { findFirst: Mock; create: Mock; updateMany: Mock };
}

export const governOff = (mocks: GovernanceMocks) => {
  mocks.governanceSettings.findUnique.mockReset();
  mocks.governanceSettings.findUnique.mockResolvedValue(null);
  mocks.approvalRequest.findFirst.mockReset();
  mocks.approvalRequest.create.mockReset();
  mocks.approvalRequest.updateMany.mockReset();
};

export const governOn = (
  mocks: GovernanceMocks,
  action: GovernedAction,
  approvalsRequired = 1,
) => {
  governOff(mocks);
  mocks.governanceSettings.findUnique.mockResolvedValue({
    approvalsRequired,
    governedActions: [action],
    approvalTtlHours: 72,
  });
  mocks.approvalRequest.findFirst.mockResolvedValue(null);
  mocks.approvalRequest.create.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: APPROVAL_ID,
      kind: data.kind,
      action: data.action,
      summary: data.summary,
      status: "PENDING",
      requiredApprovals: data.requiredApprovals,
      expiresAt: data.expiresAt,
      createdAt: new Date(),
    }),
  );
  mocks.approvalRequest.updateMany.mockResolvedValue({ count: 0 });
};

export const approvedFor = (
  mocks: GovernanceMocks,
  action: GovernedAction,
  payload: unknown,
) => {
  const hash = payloadHash(action, payload);
  mocks.approvalRequest.updateMany.mockImplementation(
    async ({ where }: { where: { id: string; payloadHash: string } }) => ({
      count: where.id === APPROVAL_ID && where.payloadHash === hash ? 1 : 0,
    }),
  );
};
