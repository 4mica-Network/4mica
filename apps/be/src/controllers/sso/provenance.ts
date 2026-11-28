import type { FastifyRequest } from "fastify";

export const SSO_SESSION_CLAIM = "sso_connection_id";

const browserProvenance = (request: FastifyRequest): string | null => {
  const claims = request.auth?.claims;
  if (!claims || claims.act !== undefined) {
    return null;
  }
  const value = claims[SSO_SESSION_CLAIM];
  return typeof value === "string" && value !== "" ? value : null;
};

export const sessionSsoConnection = (request: FastifyRequest): string | null =>
  request.apiKey
    ? null
    : request.cliSession
      ? request.cliSession.clerkSsoConnectionId
      : browserProvenance(request);
