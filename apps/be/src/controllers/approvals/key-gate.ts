import type { Prisma } from "@4mica/db";
import type { ProjectScope } from "@auth/project";
import type { FastifyReply, FastifyRequest } from "fastify";
import { type GateResult, requireApproval } from "./gate";

export const requireProductionKeyApproval = (
  request: FastifyRequest,
  reply: FastifyReply,
  scope: ProjectScope,
  payload: { [key: string]: Prisma.InputJsonValue | null | undefined },
  summary: string,
): Promise<GateResult> | GateResult =>
  scope.environment === "PRODUCTION"
    ? requireApproval(
        request,
        reply,
        {
          orgId: scope.orgId,
          userId: scope.userId,
          projectId: scope.projectId,
        },
        "api_key.create_production",
        { projectId: scope.projectId, ...payload },
        `${summary} in ${scope.projectSlug} production`,
      )
    : { proceed: true, approvalId: null };
