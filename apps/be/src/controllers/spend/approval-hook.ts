import type { ApprovalKind, ApprovalStatus, Prisma } from "@4mica/db";
import { resolvePendingAuthorization } from "./decide";
import { AUTHORIZATION_SELECT } from "./repository";

export interface ResolvedApproval {
  id: string;
  organizationId: string;
  kind: ApprovalKind;
  status: ApprovalStatus;
}

export const onApprovalResolved = async (
  tx: Prisma.TransactionClient,
  approval: ResolvedApproval,
): Promise<void> => {
  if (approval.kind !== "PAYMENT" || approval.status === "PENDING") {
    return;
  }

  const row = await tx.spendAuthorization.findFirst({
    where: {
      approvalRequestId: approval.id,
      organizationId: approval.organizationId,
    },
    select: AUTHORIZATION_SELECT,
  });

  if (row) {
    await resolvePendingAuthorization(tx, row, approval.status);
  }
};
