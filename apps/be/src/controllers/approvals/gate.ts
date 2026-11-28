import type { Prisma } from "@4mica/db";
import { withAudit } from "@controllers/shared";
import { appLogger } from "@logger/index";
import { payloadHash } from "@utils/canonical";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  consumeApproval,
  createGovernanceRequest,
  findPendingGovernanceRequest,
  governanceSettingsFor,
} from "./gate-repository";
import { APPROVAL_HEADER, type GovernedAction } from "./governance";

export interface GateContext {
  orgId: string;
  userId: string;
  projectId?: string | null;
}

export type GateResult =
  | { proceed: true; approvalId: string | null }
  | { proceed: false };

const HOUR_MS = 3_600_000;

const headerValue = (request: FastifyRequest): string | null => {
  const raw = request.headers[APPROVAL_HEADER];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
};

export const requireApproval = async (
  request: FastifyRequest,
  reply: FastifyReply,
  context: GateContext,
  action: GovernedAction,
  payload: Prisma.InputJsonValue,
  summary: string,
): Promise<GateResult> => {
  const settings = await governanceSettingsFor(context.orgId);
  if (
    !settings ||
    settings.approvalsRequired < 1 ||
    !settings.governedActions.includes(action)
  ) {
    return { proceed: true, approvalId: null };
  }

  const hash = payloadHash(action, payload);
  const approvalId = headerValue(request);

  if (approvalId) {
    if (
      await consumeApproval(
        context.orgId,
        approvalId,
        context.userId,
        action,
        hash,
      )
    ) {
      appLogger.info("Governed action approved", {
        orgId: context.orgId,
        action,
        approvalId,
      });
      return { proceed: true, approvalId };
    }
    reply.code(409).send({
      error: "approval_invalid",
      message:
        "That approval is not valid for this change. It must be approved, unused, unexpired, yours, and for exactly this request.",
    });
    return { proceed: false };
  }

  const existing = await findPendingGovernanceRequest(
    context.orgId,
    context.userId,
    action,
    hash,
  );
  const pending =
    existing ??
    (await withAudit(
      request,
      context,
      (tx) =>
        createGovernanceRequest(
          {
            orgId: context.orgId,
            projectId: context.projectId ?? null,
            userId: context.userId,
            action,
            summary,
            payload,
            hash,
            requiredApprovals: settings.approvalsRequired,
            expiresAt: new Date(
              Date.now() + settings.approvalTtlHours * HOUR_MS,
            ),
          },
          tx,
        ),
      (created) => ({
        projectId: context.projectId ?? null,
        action: "approval.requested",
        targetType: "approval_request",
        targetId: created.id,
        metadata: { governedAction: action },
      }),
    ));

  reply.code(202).send({
    status: "approval_required",
    message: `This change needs ${settings.approvalsRequired} approval${settings.approvalsRequired === 1 ? "" : "s"} from someone else. Repeat the request with the ${APPROVAL_HEADER} header once it is approved.`,
    approvalRequest: pending,
  });
  return { proceed: false };
};
