import { can, type Permission, type RoleSubject } from "@auth/permissions";
import type { FastifyReply } from "fastify";
import { GOVERNED_PERMISSIONS } from "./schema";

export const holdsGovernedPermission = (permissions: readonly string[]) =>
  GOVERNED_PERMISSIONS.some((permission) => permissions.includes(permission));

export const ungrantable = (
  actor: RoleSubject,
  permissions: readonly Permission[],
): Permission[] => permissions.filter((permission) => !can(actor, permission));

export const cannotGrant = (reply: FastifyReply, missing: Permission[]) =>
  reply.code(403).send({
    error: "forbidden",
    message: `You cannot grant permissions you do not hold: ${missing.join(", ")}.`,
    permission: missing[0],
  });
