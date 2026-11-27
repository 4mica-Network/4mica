import type { OrgRole } from "@4mica/db";
import type { ComplianceSnapshot } from "./repository";

const DAY_MS = 86_400_000;
const ROLES: readonly OrgRole[] = [
  "OWNER",
  "ADMIN",
  "FINANCE",
  "DEVELOPER",
  "VIEWER",
];
export const KEY_MAX_AGE_DAYS = 365;
export const KEY_ROTATION_DAYS = 90;
export const KEY_STALE_DAYS = 90;
export const MIN_RETENTION_DAYS = 365;

export interface ClerkIdentity {
  twoFactorEnabled: boolean;
  samlConnectionIds: string[];
}

export type CheckStatus = "pass" | "warn" | "fail";

export interface Check {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
}

const percent = (part: number, whole: number): number | null =>
  whole === 0 ? null : Math.round((part / whole) * 1000) / 10;

const ageDays = (from: Date, now: Date) =>
  Math.floor((now.getTime() - from.getTime()) / DAY_MS);

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

const identityOf = (
  snapshot: ComplianceSnapshot,
  clerk: ReadonlyMap<string, ClerkIdentity>,
) => {
  const active = snapshot.memberships.filter((m) => m.suspendedAt === null);
  const byRole = Object.fromEntries(
    ROLES.map((role) => [
      role,
      snapshot.memberships.filter((m) => m.role === role).length,
    ]),
  ) as Record<OrgRole, number>;

  const ssoIds = new Set(
    snapshot.ssoConnections.flatMap((connection) =>
      connection.active && connection.clerkConnectionId
        ? [connection.clerkConnectionId]
        : [],
    ),
  );

  let mfaEnrolled = 0;
  let ssoCovered = 0;
  let unknown = 0;
  for (const member of active) {
    const identity = clerk.get(member.user.clerkUserId);
    if (!identity) {
      unknown++;
      continue;
    }
    if (identity.twoFactorEnabled) {
      mfaEnrolled++;
    }
    if (identity.samlConnectionIds.some((id) => ssoIds.has(id))) {
      ssoCovered++;
    }
  }
  const known = active.length - unknown;

  return {
    totalMembers: snapshot.memberships.length,
    activeMembers: active.length,
    suspended: snapshot.memberships.length - active.length,
    byRole,
    byCustomRole: snapshot.customRoles.map((role) => ({
      id: role.id,
      name: role.name,
      members: role._count.memberships,
    })),
    mfa: {
      enrolled: mfaEnrolled,
      unknown,
      percent: known === 0 ? null : percent(mfaEnrolled, known),
    },
    sso: {
      covered: ssoCovered,
      unknown,
      percent: known === 0 ? null : percent(ssoCovered, known),
    },
  };
};

const apiKeysOf = (snapshot: ComplianceSnapshot, now: Date) =>
  snapshot.apiKeys.map((key) => ({
    id: key.id,
    name: key.name,
    environment: key.environment.kind,
    scopes: key.scopes,
    serviceAccount: key.serviceAccount,
    createdAt: key.createdAt,
    lastUsedAt: key.lastUsedAt,
    expiresAt: key.expiresAt,
    ageDays: ageDays(key.createdAt, now),
    ipRestricted: key.ipAllowlist.length > 0,
  }));

export type ApiKeyInventory = ReturnType<typeof apiKeysOf>;

const approvalStats = (snapshot: ComplianceSnapshot) => {
  const counts = Object.fromEntries(
    snapshot.approvals.map((row) => [row.status, row._count._all]),
  ) as Record<string, number>;
  const get = (status: string) => counts[status] ?? 0;
  return {
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    approved: get("APPROVED"),
    rejected: get("REJECTED"),
    expired: get("EXPIRED"),
    cancelled: get("CANCELLED"),
    pending: get("PENDING"),
  };
};

const streamStats = (snapshot: ComplianceSnapshot) => ({
  total: snapshot.streams.length,
  active: snapshot.streams.filter((s) => s.status === "ACTIVE").length,
  failing: snapshot.streams.filter((s) => s.status === "FAILING").length,
  paused: snapshot.streams.filter((s) => s.status === "PAUSED").length,
});

type Identity = ReturnType<typeof identityOf>;

export const evaluateChecks = (
  snapshot: ComplianceSnapshot,
  identity: Identity,
  keys: ApiKeyInventory,
  now: Date,
): Check[] => {
  const { security, governance } = snapshot;
  const checks: Check[] = [];
  const add = (
    id: string,
    title: string,
    status: CheckStatus,
    detail: string,
  ) => {
    checks.push({ id, title, status, detail });
  };

  add(
    "mfa_required",
    "Multi-factor authentication is required",
    security.requireMfa ? "pass" : "warn",
    security.requireMfa
      ? "Members must sign in with a second factor."
      : "Members can sign in without a second factor.",
  );

  const notEnrolled =
    identity.activeMembers - identity.mfa.unknown - identity.mfa.enrolled;
  add(
    "mfa_coverage",
    "Every member has a second factor",
    notEnrolled > 0 ? "fail" : identity.mfa.unknown > 0 ? "warn" : "pass",
    notEnrolled > 0
      ? `${plural(notEnrolled, "member")} ha${notEnrolled === 1 ? "s" : "ve"} no second factor.`
      : identity.mfa.unknown > 0
        ? `MFA status is unknown for ${plural(identity.mfa.unknown, "member")}.`
        : "All active members have a second factor.",
  );

  const activeSso = snapshot.ssoConnections.filter((c) => c.active);
  const enforcedSso = activeSso.filter((c) => c.enforced);
  add(
    "sso_enforced",
    "Single sign-on is enforced",
    enforcedSso.length > 0 ? "pass" : "warn",
    enforcedSso.length > 0
      ? `${plural(enforcedSso.length, "connection")} enforce single sign-on.`
      : activeSso.length > 0
        ? "Single sign-on is active but not enforced."
        : "No single sign-on connection is active.",
  );

  const owners = identity.byRole.OWNER;
  add(
    "owner_redundancy",
    "More than one owner",
    owners >= 2 ? "pass" : "warn",
    owners >= 2
      ? `${plural(owners, "owner")} can recover the organization.`
      : "A single owner is a single point of failure.",
  );

  add(
    "ip_allowlist",
    "Access is limited to known networks",
    security.ipAllowlist.length > 0 ? "pass" : "warn",
    security.ipAllowlist.length > 0
      ? `${plural(security.ipAllowlist.length, "network")} allowed.`
      : "Members can sign in from any network.",
  );

  add(
    "session_max_age",
    "Sessions have a maximum age",
    security.sessionMaxAgeHours !== null ? "pass" : "warn",
    security.sessionMaxAgeHours !== null
      ? `Sessions expire after ${plural(security.sessionMaxAgeHours, "hour")}.`
      : "Sessions last as long as Clerk keeps them.",
  );

  const old = keys.filter((key) => key.ageDays > KEY_MAX_AGE_DAYS);
  const due = keys.filter((key) => key.ageDays > KEY_ROTATION_DAYS);
  add(
    "api_key_rotation",
    "API keys are rotated",
    old.length > 0 ? "fail" : due.length > 0 ? "warn" : "pass",
    old.length > 0
      ? `${plural(old.length, "key")} older than ${KEY_MAX_AGE_DAYS} days.`
      : due.length > 0
        ? `${plural(due.length, "key")} older than ${KEY_ROTATION_DAYS} days.`
        : `No active key is older than ${KEY_ROTATION_DAYS} days.`,
  );

  const staleBefore = now.getTime() - KEY_STALE_DAYS * DAY_MS;
  const stale = keys.filter(
    (key) =>
      (key.lastUsedAt ?? key.createdAt).getTime() < staleBefore &&
      key.createdAt.getTime() < staleBefore,
  );
  add(
    "api_key_usage",
    "No unused API keys",
    stale.length > 0 ? "warn" : "pass",
    stale.length > 0
      ? `${plural(stale.length, "key")} unused for ${KEY_STALE_DAYS} days.`
      : "Every active key was used recently.",
  );

  const production = keys.filter((key) => key.environment === "PRODUCTION");
  const unrestricted = production.filter(
    (key) => !key.ipRestricted && !security.enforceIpAllowlistForApiKeys,
  );
  add(
    "api_key_ip_restriction",
    "Production API keys are limited to known networks",
    unrestricted.length > 0 ? "warn" : "pass",
    unrestricted.length > 0
      ? `${plural(unrestricted.length, "production key")} accept requests from any network.`
      : "Every production key is network-restricted.",
  );

  const governed =
    governance !== null &&
    governance.approvalsRequired > 0 &&
    governance.governedActions.length > 0;
  add(
    "governance",
    "Sensitive changes need a second approver",
    governed ? "pass" : "warn",
    governed
      ? `${plural(governance.governedActions.length, "action")} need approval.`
      : "No action needs approval.",
  );

  const enforced = snapshot.policies.filter(
    (policy) => policy.enabled && policy.mode === "ENFORCE",
  );
  add(
    "spending_policies",
    "Spending is limited by policy",
    enforced.length > 0 ? "pass" : "warn",
    enforced.length > 0
      ? `${plural(enforced.length, "policy")} enforced.`
      : "No spending policy is enforced.",
  );

  const streams = streamStats(snapshot);
  add(
    "audit_streaming",
    "Audit events are streamed to an external system",
    streams.active > 0 ? "pass" : streams.total === 0 ? "warn" : "fail",
    streams.active > 0
      ? `${plural(streams.active, "stream")} delivering.`
      : streams.total === 0
        ? "No audit stream is configured."
        : "Every audit stream is failing or paused.",
  );

  const retention = governance?.auditRetentionDays ?? null;
  add(
    "audit_retention",
    "Audit history is kept for at least a year",
    retention === null || retention >= MIN_RETENTION_DAYS ? "pass" : "warn",
    retention === null
      ? "Audit history is kept indefinitely."
      : `Audit history is kept for ${plural(retention, "day")}.`,
  );

  return checks;
};

export const buildReport = (
  snapshot: ComplianceSnapshot,
  clerk: ReadonlyMap<string, ClerkIdentity>,
  now: Date,
) => {
  const identity = identityOf(snapshot, clerk);
  const apiKeys = apiKeysOf(snapshot, now);

  return {
    generatedAt: now,
    organization: snapshot.organization && {
      id: snapshot.organization.id,
      name: snapshot.organization.name,
      handle: snapshot.organization.handle,
      personal: snapshot.organization.personal,
    },
    checks: evaluateChecks(snapshot, identity, apiKeys, now),
    identity,
    access: {
      customRoles: snapshot.customRoles.map((role) => ({
        id: role.id,
        name: role.name,
        permissions: role.permissions,
        projectRole: role.projectRole,
        members: role._count.memberships,
      })),
      restrictedProjects: snapshot.projects
        .filter((project) => project.restricted)
        .map(({ id, name, slug }) => ({ id, name, slug })),
      productionRestrictedProjects: snapshot.projects
        .filter((project) => project.restrictProduction)
        .map(({ id, name, slug }) => ({ id, name, slug })),
    },
    credentials: {
      apiKeys,
      cliSessions: snapshot.cliSessions,
      scimTokens: snapshot.scimTokens,
    },
    financial: {
      policies: {
        total: snapshot.policies.length,
        enabled: snapshot.policies.filter((p) => p.enabled).length,
        enforced: snapshot.policies.filter(
          (p) => p.enabled && p.mode === "ENFORCE",
        ).length,
        frozen: snapshot.policies.filter((p) => p.frozenAt !== null).length,
      },
      governance: {
        approvalsRequired: snapshot.governance?.approvalsRequired ?? 0,
        governedActions: snapshot.governance?.governedActions ?? [],
      },
      approvalStats30d: approvalStats(snapshot),
    },
    logging: {
      auditRetentionDays: snapshot.governance?.auditRetentionDays ?? null,
      streams: streamStats(snapshot),
    },
  };
};

export type ComplianceReport = ReturnType<typeof buildReport>;

export const CSV_HEADER = [
  "record",
  "id",
  "name",
  "status",
  "detail",
  "environment",
  "scopes",
  "service_account",
  "created_at",
  "last_used_at",
  "expires_at",
  "age_days",
  "ip_restricted",
] as const;

export const csvRows = (report: ComplianceReport) => [
  ...report.checks.map((check) => [
    "check",
    check.id,
    check.title,
    check.status,
    check.detail,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ]),
  ...report.credentials.apiKeys.map((key) => [
    "api_key",
    key.id,
    key.name,
    null,
    null,
    key.environment,
    key.scopes.join(" "),
    key.serviceAccount?.name ?? null,
    key.createdAt,
    key.lastUsedAt,
    key.expiresAt,
    key.ageDays,
    key.ipRestricted,
  ]),
];
