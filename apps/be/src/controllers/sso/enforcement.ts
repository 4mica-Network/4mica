import type { Tenant } from "@auth/tenant";
import { appLogger } from "@logger/index";
import {
  type ClerkUser,
  getClerkUser,
  primaryEmailDomain,
  samlConnectionIds,
} from "@services/clerk-users";
import type { FastifyRequest } from "fastify";
import { enforcedConnections } from "./repository";

export interface EnforcedConnection {
  clerkConnectionId: string | null;
  domain: { domain: string };
}

export const unmetRequirement = (
  user: ClerkUser,
  connections: EnforcedConnection[],
): { domain: string } | null => {
  const domain = primaryEmailDomain(user);
  if (!domain) {
    return null;
  }
  const matching = connections.filter((c) => c.domain.domain === domain);
  if (matching.length === 0) {
    return null;
  }
  const signedInVia = new Set(samlConnectionIds(user));
  return matching.some(
    (c) => c.clerkConnectionId !== null && signedInVia.has(c.clerkConnectionId),
  )
    ? null
    : { domain };
};

export const ssoRequirement = async (
  request: FastifyRequest,
  tenant: Tenant,
): Promise<{ domain: string } | null> => {
  if (tenant.personal || request.cliSession || request.apiKey) {
    return null;
  }
  const clerkUserId = request.user?.clerkUserId;
  if (!clerkUserId) {
    return null;
  }

  const connections = await enforcedConnections(tenant.orgId);
  if (connections.length === 0) {
    return null;
  }

  try {
    return unmetRequirement(await getClerkUser(clerkUserId), connections);
  } catch (error) {
    appLogger.warn("Could not load Clerk user for SSO enforcement", {
      orgId: tenant.orgId,
      clerkUserId,
      error,
    });
    const domain = request.user?.email?.split("@")[1]?.toLowerCase() ?? null;
    return domain && connections.some((c) => c.domain.domain === domain)
      ? { domain }
      : null;
  }
};
