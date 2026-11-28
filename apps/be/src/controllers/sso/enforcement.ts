import type { Tenant } from "@auth/tenant";
import { appLogger } from "@logger/index";
import { getClerkUser, primaryEmailDomain } from "@services/clerk-users";
import type { FastifyRequest } from "fastify";
import { SSO_SESSION_CLAIM, sessionSsoConnection } from "./provenance";
import { enforcedConnections } from "./repository";

export interface EnforcedConnection {
  clerkConnectionId: string | null;
  domain: { domain: string };
}

export interface SsoRequirement {
  domain: string;
}

export const unmetRequirement = (
  domains: readonly string[],
  provenance: string | null,
  connections: EnforcedConnection[],
): SsoRequirement | null => {
  const matching = connections.filter((c) => domains.includes(c.domain.domain));
  const first = matching[0];
  if (!first) {
    return null;
  }
  return provenance !== null &&
    matching.some((c) => c.clerkConnectionId === provenance)
    ? null
    : { domain: first.domain.domain };
};

const emailDomain = (email: string | null | undefined): string | null => {
  const at = email?.lastIndexOf("@") ?? -1;
  return email && at > 0 ? email.slice(at + 1).toLowerCase() : null;
};

export const callerDomains = async (
  request: FastifyRequest,
  orgId: string | null,
): Promise<string[]> => {
  const clerkUserId = request.user?.clerkUserId;
  if (clerkUserId) {
    try {
      const primary = primaryEmailDomain(await getClerkUser(clerkUserId));
      return primary ? [primary] : [];
    } catch (error) {
      appLogger.warn("Could not load Clerk user for SSO enforcement", {
        orgId,
        clerkUserId,
        error,
      });
    }
  }
  const local = emailDomain(request.user?.email);
  return local ? [local] : [];
};

export const ssoRequirement = async (
  request: FastifyRequest,
  tenant: Tenant,
): Promise<SsoRequirement | null> => {
  if (tenant.personal || request.apiKey) {
    return null;
  }
  if (!request.user?.clerkUserId) {
    return null;
  }

  const connections = await enforcedConnections(tenant.orgId);
  if (connections.length === 0) {
    return null;
  }

  const provenance = sessionSsoConnection(request);
  const unmet = unmetRequirement(
    await callerDomains(request, tenant.orgId),
    provenance,
    connections,
  );
  if (unmet) {
    appLogger.warn("SSO enforcement denied a session without SSO provenance", {
      orgId: tenant.orgId,
      domain: unmet.domain,
      via: request.cliSession ? "cli" : "browser",
      cliSessionId: request.cliSession?.id ?? null,
      provenance,
      claim: SSO_SESSION_CLAIM,
      claimPresent: request.auth?.claims[SSO_SESSION_CLAIM] !== undefined,
    });
  }
  return unmet;
};
