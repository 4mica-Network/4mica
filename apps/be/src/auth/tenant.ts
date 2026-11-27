import type { OrgRole } from "@4mica/db";
import type { FastifyRequest } from "fastify";
import { ensurePersonalOrganization, findMembership } from "./repository";

export const ORG_HEADER = "x-org-id";

export interface Tenant {
  orgId: string;
  userId: string;
  role: OrgRole;
  personal: boolean;
}

const lookups = new WeakMap<FastifyRequest, Promise<Tenant | null>>();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RequestedOrg =
  | { kind: "default" }
  | { kind: "explicit"; orgId: string }
  | { kind: "invalid" };

export const requestedOrg = (request: FastifyRequest): RequestedOrg => {
  const raw = request.headers[ORG_HEADER];
  if (raw === undefined) {
    return { kind: "default" };
  }

  const value = Array.isArray(raw) ? undefined : raw.trim();
  if (!value) {
    return { kind: "invalid" };
  }

  return UUID.test(value)
    ? { kind: "explicit", orgId: value.toLowerCase() }
    : { kind: "invalid" };
};

const lookup = async (
  request: FastifyRequest,
  userId: string,
): Promise<Tenant | null> => {
  const requested = requestedOrg(request);
  if (requested.kind === "invalid") {
    return null;
  }

  const bound = request.cliSession?.organizationId ?? null;
  if (bound !== null) {
    return requested.kind === "explicit" && requested.orgId !== bound
      ? null
      : findMembership(userId, bound);
  }

  const orgId = requested.kind === "explicit" ? requested.orgId : null;
  const found = await findMembership(userId, orgId);
  if (found) {
    return found;
  }

  return orgId === null ? ensurePersonalOrganization(userId) : null;
};

export const resolveTenant = (
  request: FastifyRequest,
  userId: string,
): Promise<Tenant | null> => {
  const pending = lookups.get(request) ?? lookup(request, userId);
  lookups.set(request, pending);
  return pending;
};
