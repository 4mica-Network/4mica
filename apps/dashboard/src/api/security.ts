import { HttpMethod } from "@4mica/http";
import type { OrganizationRole, Permission } from "@stores/organization/type";
import type {
  AuditStream,
  AuditStreamInput,
  AuditStreamUpdate,
  ComplianceReport,
  CustomRole,
  CustomRoleInput,
  OrganizationDomain,
  ScimGroup,
  ScimGroupMapping,
  ScimToken,
  SecuritySettings,
  SsoConnection,
  SsoConnectionInput,
  SsoConnectionUpdate,
} from "@stores/security/type";
import { saveBlob } from "@/lib/download";
import { API_URL, httpClient } from "./client";

const ORG = "/me/organization";
const at = (path: string, id: string) =>
  `${ORG}/${path}/${encodeURIComponent(id)}`;

export const SCIM_BASE_URL = `${API_URL.replace(/\/+$/, "")}/scim/v2`;

export const getDomains = () =>
  httpClient.request<{ items: OrganizationDomain[] }>({
    url: `${ORG}/domains`,
    method: HttpMethod.GET,
  });

export const createDomain = (domain: string) =>
  httpClient.request<OrganizationDomain, { domain: string }>({
    url: `${ORG}/domains`,
    method: HttpMethod.POST,
    data: { domain },
  });

export const verifyDomain = (id: string) =>
  httpClient.request<OrganizationDomain>({
    url: `${at("domains", id)}/verify`,
    method: HttpMethod.POST,
  });

export const updateDomain = (
  id: string,
  data: { autoJoin?: boolean; autoJoinRole?: OrganizationRole },
) =>
  httpClient.request<OrganizationDomain, typeof data>({
    url: at("domains", id),
    method: HttpMethod.PATCH,
    data,
  });

export const deleteDomain = (id: string) =>
  httpClient.request<void>({
    url: at("domains", id),
    method: HttpMethod.DELETE,
  });

export const getSsoConnections = () =>
  httpClient.request<{ items: SsoConnection[] }>({
    url: `${ORG}/sso`,
    method: HttpMethod.GET,
  });

export const createSsoConnection = (data: SsoConnectionInput) =>
  httpClient.request<SsoConnection, SsoConnectionInput>({
    url: `${ORG}/sso`,
    method: HttpMethod.POST,
    data,
  });

export const updateSsoConnection = (id: string, data: SsoConnectionUpdate) =>
  httpClient.request<SsoConnection, SsoConnectionUpdate>({
    url: at("sso", id),
    method: HttpMethod.PATCH,
    data,
  });

export const deleteSsoConnection = (id: string) =>
  httpClient.request<void>({ url: at("sso", id), method: HttpMethod.DELETE });

export const getSecuritySettings = () =>
  httpClient.request<SecuritySettings>({
    url: `${ORG}/security`,
    method: HttpMethod.GET,
  });

export const updateSecuritySettings = (data: SecuritySettings) =>
  httpClient.request<SecuritySettings, SecuritySettings>({
    url: `${ORG}/security`,
    method: HttpMethod.PUT,
    data,
  });

export const getCustomRoles = () =>
  httpClient.request<{
    items: CustomRole[];
    assignablePermissions: Permission[];
  }>({ url: `${ORG}/roles`, method: HttpMethod.GET });

export const createCustomRole = (data: CustomRoleInput) =>
  httpClient.request<CustomRole, CustomRoleInput>({
    url: `${ORG}/roles`,
    method: HttpMethod.POST,
    data,
  });

export const updateCustomRole = (id: string, data: CustomRoleInput) =>
  httpClient.request<CustomRole, CustomRoleInput>({
    url: at("roles", id),
    method: HttpMethod.PATCH,
    data,
  });

export const deleteCustomRole = (id: string) =>
  httpClient.request<void>({ url: at("roles", id), method: HttpMethod.DELETE });

export const getScimTokens = () =>
  httpClient.request<{ items: ScimToken[] }>({
    url: `${ORG}/scim-tokens`,
    method: HttpMethod.GET,
  });

export const createScimToken = (name: string) =>
  httpClient.request<ScimToken & { secret: string }, { name: string }>({
    url: `${ORG}/scim-tokens`,
    method: HttpMethod.POST,
    data: { name },
  });

export const revokeScimToken = (id: string) =>
  httpClient.request<ScimToken>({
    url: `${at("scim-tokens", id)}/revoke`,
    method: HttpMethod.POST,
  });

export const getScimGroups = () =>
  httpClient.request<{ items: ScimGroup[] }>({
    url: `${ORG}/scim-groups`,
    method: HttpMethod.GET,
  });

export const updateScimGroup = (id: string, data: ScimGroupMapping) =>
  httpClient.request<ScimGroup, ScimGroupMapping>({
    url: at("scim-groups", id),
    method: HttpMethod.PATCH,
    data,
  });

export const getAuditStreams = () =>
  httpClient.request<{ items: AuditStream[] }>({
    url: `${ORG}/audit-streams`,
    method: HttpMethod.GET,
  });

export interface StreamWithSecret {
  stream: AuditStream;
  secret: string;
}

export const createAuditStream = (data: AuditStreamInput) =>
  httpClient.request<StreamWithSecret, AuditStreamInput>({
    url: `${ORG}/audit-streams`,
    method: HttpMethod.POST,
    data,
  });

export const updateAuditStream = (id: string, data: AuditStreamUpdate) =>
  httpClient.request<AuditStream, AuditStreamUpdate>({
    url: at("audit-streams", id),
    method: HttpMethod.PATCH,
    data,
  });

export const rotateAuditStreamSecret = (id: string) =>
  httpClient.request<StreamWithSecret>({
    url: `${at("audit-streams", id)}/rotate-secret`,
    method: HttpMethod.POST,
  });

export const testAuditStream = (id: string) =>
  httpClient.request<{ ok?: boolean; statusCode?: number | null } | undefined>({
    url: `${at("audit-streams", id)}/test`,
    method: HttpMethod.POST,
  });

export const resumeAuditStream = (id: string) =>
  httpClient.request<AuditStream>({
    url: `${at("audit-streams", id)}/resume`,
    method: HttpMethod.POST,
  });

export const deleteAuditStream = (id: string) =>
  httpClient.request<void>({
    url: at("audit-streams", id),
    method: HttpMethod.DELETE,
  });

export const getComplianceReport = () =>
  httpClient.request<ComplianceReport>({
    url: `${ORG}/compliance-report`,
    method: HttpMethod.GET,
  });

const stamp = () => new Date().toISOString().slice(0, 10);

export const downloadComplianceJson = async (): Promise<void> => {
  const report = await getComplianceReport();
  saveBlob(
    new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json;charset=utf-8",
    }),
    `compliance-report-${stamp()}.json`,
  );
};

export const downloadComplianceCsv = async (): Promise<void> => {
  const body = await httpClient.request<unknown>({
    url: `${ORG}/compliance-report.csv`,
    method: HttpMethod.GET,
    headers: { Accept: "text/csv" },
  });
  const text = typeof body === "string" ? body : JSON.stringify(body ?? "");
  saveBlob(
    new Blob([text], { type: "text/csv;charset=utf-8" }),
    `compliance-report-${stamp()}.csv`,
  );
};
