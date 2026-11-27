import type {
  LoadStatus,
  OrganizationRole,
  Permission,
} from "@stores/organization/type";
import type { ProjectRole } from "@stores/project/type";

export interface VerificationRecord {
  type: "TXT";
  name: string;
  value: string;
}

export interface OrganizationDomain {
  id: string;
  domain: string;
  verified: boolean;
  verifiedAt: string | null;
  verificationRecord: VerificationRecord;
  autoJoin: boolean;
  autoJoinRole: OrganizationRole;
  lastCheckedAt: string | null;
  createdAt: string;
}

export const SSO_PROVIDERS = [
  "OKTA",
  "MICROSOFT_ENTRA",
  "GOOGLE_WORKSPACE",
  "CUSTOM",
] as const;

export type SsoProvider = (typeof SSO_PROVIDERS)[number];

export interface ServiceProviderValues {
  acsUrl: string;
  entityId: string;
  metadataUrl: string;
}

export interface SsoConnection {
  id: string;
  domainId: string;
  domain: string;
  provider: SsoProvider;
  name: string;
  active: boolean;
  enforced: boolean;
  jitProvisioning: boolean;
  defaultRole: OrganizationRole;
  idpEntityId: string | null;
  idpSsoUrl: string | null;
  idpMetadataUrl: string | null;
  serviceProvider: ServiceProviderValues | null;
  createdAt: string;
}

export interface SsoConnectionInput {
  domainId: string;
  provider: SsoProvider;
  name: string;
  idpMetadataUrl?: string;
  idpEntityId?: string;
  idpSsoUrl?: string;
  idpCertificate?: string;
  defaultRole?: OrganizationRole;
  jitProvisioning?: boolean;
}

export type SsoConnectionUpdate = Partial<
  Omit<SsoConnectionInput, "domainId" | "provider">
> & {
  active?: boolean;
  enforced?: boolean;
};

export interface SecuritySettings {
  requireMfa: boolean;
  sessionMaxAgeHours: number | null;
  reauthWindowMinutes: number;
  ipAllowlist: string[];
  enforceIpAllowlistForApiKeys: boolean;
}

export interface CustomRole {
  id: string;
  name: string;
  description: string | null;
  permissions: Permission[];
  projectRole: ProjectRole;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomRoleInput {
  name: string;
  description: string | null;
  permissions: Permission[];
  projectRole: ProjectRole;
}

export interface ScimToken {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface ScimGroup {
  id: string;
  displayName: string;
  memberCount: number;
  role: OrganizationRole | null;
  customRoleId: string | null;
  priority: number;
}

export interface ScimGroupMapping {
  role: OrganizationRole | null;
  customRoleId: string | null;
  priority: number;
}

export const AUDIT_STREAM_STATUSES = ["ACTIVE", "PAUSED", "FAILING"] as const;

export type AuditStreamStatus = (typeof AUDIT_STREAM_STATUSES)[number];

export interface AuditStream {
  id: string;
  name: string;
  url: string;
  status: AuditStreamStatus;
  actionPrefixes: string[];
  secretPrefix: string;
  lastDeliveryAt: string | null;
  lastStatusCode: number | null;
  lastError: string | null;
  consecutiveFailures: number;
  nextAttemptAt: string | null;
  createdAt: string;
}

export interface AuditStreamInput {
  name: string;
  url: string;
  actionPrefixes: string[];
  backfillFrom?: string;
}

export type AuditStreamUpdate = Partial<
  Omit<AuditStreamInput, "backfillFrom">
> & { status?: "ACTIVE" | "PAUSED" };

export type CheckStatus = "pass" | "warn" | "fail";

export interface ComplianceCheck {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
}

export interface ComplianceApiKey {
  id: string;
  name: string;
  environment: string;
  scopes: string[];
  serviceAccount: { id: string; name: string } | string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  ageDays: number;
  ipRestricted: boolean;
}

export interface ComplianceReport {
  generatedAt: string;
  organization: { id: string; name: string; handle?: string | null };
  checks: ComplianceCheck[];
  identity: Record<string, unknown>;
  access: Record<string, unknown>;
  credentials: {
    apiKeys: ComplianceApiKey[];
    cliSessions?: unknown;
    scimTokens?: unknown;
  } & Record<string, unknown>;
  financial: Record<string, unknown>;
  logging: Record<string, unknown>;
}

export interface Collection<T> {
  items: T[];
  status: LoadStatus;
  error: string | null;
}

export interface SecurityCollections {
  domains: OrganizationDomain;
  sso: SsoConnection;
  roles: CustomRole;
  scimTokens: ScimToken;
  scimGroups: ScimGroup;
  streams: AuditStream;
}

export type SecurityResource = keyof SecurityCollections;

export interface SecurityFailure {
  key: string;
  code: string | null;
  message: string;
  issues: Record<string, string>;
  detail: Record<string, unknown>;
}

export type RevealedSecuritySecret =
  | { kind: "scimToken"; secret: string; baseUrl: string; name: string }
  | { kind: "streamSecret"; secret: string; streamId: string; name: string };

export type RevealSecuritySecret = (secret: RevealedSecuritySecret) => void;

export type SecurityState = {
  [K in SecurityResource]: Collection<SecurityCollections[K]>;
} & {
  assignablePermissions: Permission[];
  settings: SecuritySettings | null;
  settingsStatus: LoadStatus;
  report: ComplianceReport | null;
  reportStatus: LoadStatus;
  reportError: string | null;
  pending: Record<string, boolean>;
  failure: SecurityFailure | null;
};
