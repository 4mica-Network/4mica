import { type Prisma, prisma } from "@4mica/db";

export const governanceSettingsFor = (orgId: string) =>
  prisma.governanceSettings.findUnique({
    where: { organizationId: orgId },
    select: {
      approvalsRequired: true,
      governedActions: true,
      approvalTtlHours: true,
    },
  });

export const consumeApproval = async (
  orgId: string,
  approvalId: string,
  userId: string,
  action: string,
  hash: string,
): Promise<boolean> => {
  const { count } = await prisma.approvalRequest.updateMany({
    where: {
      id: approvalId,
      organizationId: orgId,
      kind: "GOVERNANCE",
      action,
      payloadHash: hash,
      requestedById: userId,
      status: "APPROVED",
      executedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { executedAt: new Date() },
  });
  return count > 0;
};

export const APPROVAL_SUMMARY_SELECT = {
  id: true,
  kind: true,
  action: true,
  summary: true,
  status: true,
  requiredApprovals: true,
  expiresAt: true,
  createdAt: true,
} as const;

export const findPendingGovernanceRequest = (
  orgId: string,
  userId: string,
  action: string,
  hash: string,
) =>
  prisma.approvalRequest.findFirst({
    where: {
      organizationId: orgId,
      kind: "GOVERNANCE",
      action,
      payloadHash: hash,
      requestedById: userId,
      status: "PENDING",
      expiresAt: { gt: new Date() },
    },
    select: APPROVAL_SUMMARY_SELECT,
  });

export const createGovernanceRequest = (data: {
  orgId: string;
  projectId: string | null;
  userId: string;
  action: string;
  summary: string;
  payload: Prisma.InputJsonValue;
  hash: string;
  requiredApprovals: number;
  expiresAt: Date;
}) =>
  prisma.approvalRequest.create({
    data: {
      organizationId: data.orgId,
      projectId: data.projectId,
      kind: "GOVERNANCE",
      action: data.action,
      summary: data.summary,
      payload: data.payload,
      payloadHash: data.hash,
      requestedById: data.userId,
      requiredApprovals: data.requiredApprovals,
      expiresAt: data.expiresAt,
    },
    select: APPROVAL_SUMMARY_SELECT,
  });
