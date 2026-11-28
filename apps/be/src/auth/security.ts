import {
  DEFAULT_SECURITY_SETTINGS,
  findSecuritySettings,
  type SecuritySettingsRow,
} from "@controllers/security/repository";
import { ssoRequirement } from "@controllers/sso/enforcement";
import { ipAllowed } from "@utils/ip-allowlist";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Tenant } from "./tenant";

const memo = new WeakMap<
  FastifyRequest,
  Map<string, Promise<SecuritySettingsRow>>
>();

export const securitySettingsFor = (
  request: FastifyRequest,
  tenant: Pick<Tenant, "orgId" | "personal">,
): Promise<SecuritySettingsRow> => {
  if (tenant.personal) {
    return Promise.resolve(DEFAULT_SECURITY_SETTINGS);
  }
  const byOrg = memo.get(request) ?? new Map();
  memo.set(request, byOrg);
  const pending = byOrg.get(tenant.orgId) ?? findSecuritySettings(tenant.orgId);
  byOrg.set(tenant.orgId, pending);
  return pending;
};

export interface FactorAges {
  firstFactorMinutes: number;
  secondFactorMinutes: number;
}

export const factorAges = (request: FastifyRequest): FactorAges | null => {
  const fva = request.auth?.claims.fva;
  if (!Array.isArray(fva) || fva.length < 2) {
    return null;
  }
  const [first, second] = fva;
  if (
    typeof first !== "number" ||
    typeof second !== "number" ||
    !Number.isFinite(first) ||
    !Number.isFinite(second)
  ) {
    return null;
  }
  return { firstFactorMinutes: first, secondFactorMinutes: second };
};

const isClerkSession = (request: FastifyRequest): boolean =>
  !request.cliSession && !request.apiKey;

export const enforceAccessPolicy = async (
  request: FastifyRequest,
  reply: FastifyReply,
  tenant: Tenant,
): Promise<boolean> => {
  if (tenant.suspended) {
    reply.code(403).send({
      error: "member_suspended",
      message: "Your access to this organization is suspended.",
    });
    return false;
  }

  const settings = await securitySettingsFor(request, tenant);

  if (
    settings.ipAllowlist.length > 0 &&
    !ipAllowed(request.ip, settings.ipAllowlist)
  ) {
    reply.code(403).send({
      error: "ip_not_allowed",
      message: "This organization does not allow access from your network.",
    });
    return false;
  }

  if (request.apiKey) {
    return true;
  }

  const cli = request.cliSession;
  const ages = cli ? null : factorAges(request);
  const mfaVerified = cli
    ? cli.mfaVerified
    : ages !== null && ages.secondFactorMinutes >= 0;

  if (settings.requireMfa && !mfaVerified) {
    reply.code(403).send({
      error: "mfa_required",
      message: cli
        ? "This organization requires multi-factor authentication. Sign in to the CLI again from a dashboard session that used it."
        : "This organization requires multi-factor authentication. Enable it and sign in again.",
    });
    return false;
  }

  const maxAgeMinutes =
    settings.sessionMaxAgeHours === null
      ? null
      : settings.sessionMaxAgeHours * 60;
  const ageMinutes = cli
    ? (Date.now() - cli.createdAt.getTime()) / 60_000
    : (ages?.firstFactorMinutes ?? null);

  if (
    maxAgeMinutes !== null &&
    (ageMinutes === null || ageMinutes < 0 || ageMinutes > maxAgeMinutes)
  ) {
    reply.code(401).send({
      error: "session_too_old",
      message: cli
        ? "This CLI session is older than this organization allows. Sign in again with `4mica auth login`."
        : "Your session is older than this organization allows. Sign in again.",
    });
    return false;
  }

  const sso = await ssoRequirement(request, tenant);
  if (sso) {
    reply.code(403).send({
      error: "sso_required",
      message: `Members with an @${sso.domain} email must sign in with single sign-on.`,
      domain: sso.domain,
    });
    return false;
  }

  return true;
};

export const requireRecentAuth = async (
  request: FastifyRequest,
  reply: FastifyReply,
  tenant: Tenant,
): Promise<boolean> => {
  const settings = await securitySettingsFor(request, tenant);
  const window = settings.reauthWindowMinutes;
  const ages = isClerkSession(request) ? factorAges(request) : null;

  const fresh = (minutes: number) => minutes >= 0 && minutes <= window;

  if (
    ages &&
    fresh(ages.firstFactorMinutes) &&
    (!settings.requireMfa || fresh(ages.secondFactorMinutes))
  ) {
    return true;
  }

  reply.code(403).send({
    error: "reauth_required",
    message: request.cliSession
      ? "This action needs a recent sign-in in the dashboard. CLI tokens cannot perform it."
      : `Confirm your identity to continue. Sign in again within the last ${window} minutes.`,
    reauthWithinMinutes: window,
  });
  return false;
};
