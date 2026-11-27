import type { OrganizationRole, Permission } from "@stores/organization/type";
import type { PendingMeta } from "@stores/utils";
import actionTypes from "./actionTypes";
import type {
  AuditStreamInput,
  AuditStreamUpdate,
  ComplianceReport,
  CustomRoleInput,
  RevealSecuritySecret,
  ScimGroupMapping,
  SecurityCollections,
  SecurityFailure,
  SecurityResource,
  SecuritySettings,
  SsoConnectionInput,
  SsoConnectionUpdate,
} from "./type";

export type SecurityOp =
  | { op: "createDomain"; domain: string }
  | { op: "verifyDomain"; id: string }
  | {
      op: "updateDomain";
      id: string;
      data: { autoJoin?: boolean; autoJoinRole?: OrganizationRole };
    }
  | { op: "deleteDomain"; id: string }
  | { op: "createSso"; data: SsoConnectionInput }
  | { op: "updateSso"; id: string; data: SsoConnectionUpdate }
  | { op: "deleteSso"; id: string }
  | { op: "saveRole"; id?: string; data: CustomRoleInput }
  | { op: "deleteRole"; id: string }
  | { op: "createScimToken"; name: string }
  | { op: "revokeScimToken"; id: string }
  | { op: "updateScimGroup"; id: string; data: ScimGroupMapping }
  | { op: "createStream"; data: AuditStreamInput }
  | { op: "updateStream"; id: string; data: AuditStreamUpdate }
  | { op: "rotateStream"; id: string }
  | { op: "testStream"; id: string }
  | { op: "resumeStream"; id: string }
  | { op: "deleteStream"; id: string };

export type SecurityOpName = SecurityOp["op"];

export const securityPendingKeys = {
  op: (op: SecurityOpName, id?: string) => (id ? `${op}:${id}` : op),
  settings: "saveSettings",
} as const;

const keyFor = (operation: SecurityOp) =>
  securityPendingKeys.op(
    operation.op,
    "id" in operation ? operation.id : undefined,
  );

export const fetchSecurity = (resource: SecurityResource) => ({
  type: actionTypes.FETCH_SECURITY_REQUESTED,
  payload: { resource },
});

export const fetchSecurityPending = (resource: SecurityResource) => ({
  type: actionTypes.FETCH_SECURITY_PENDING,
  payload: { resource },
});

export const fetchSecuritySucceeded = <R extends SecurityResource>(payload: {
  resource: R;
  items: SecurityCollections[R][];
  assignablePermissions?: Permission[];
}) => ({
  type: actionTypes.FETCH_SECURITY_SUCCEEDED,
  payload,
});

export const fetchSecurityFailed = (
  resource: SecurityResource,
  message: string,
) => ({
  type: actionTypes.FETCH_SECURITY_FAILED,
  payload: { resource, message },
});

export const fetchSecuritySettings = () => ({
  type: actionTypes.FETCH_SETTINGS_REQUESTED,
});

export const fetchSecuritySettingsPending = () => ({
  type: actionTypes.FETCH_SETTINGS_PENDING,
});

export const fetchSecuritySettingsSucceeded = (settings: SecuritySettings) => ({
  type: actionTypes.FETCH_SETTINGS_SUCCEEDED,
  payload: settings,
});

export const fetchSecuritySettingsFailed = (message: string) => ({
  type: actionTypes.FETCH_SETTINGS_FAILED,
  payload: { message },
});

export const saveSecuritySettings = (settings: SecuritySettings) => ({
  type: actionTypes.SAVE_SETTINGS_REQUESTED,
  payload: settings,
  meta: { pendingKey: securityPendingKeys.settings },
});

export const saveSecuritySettingsSucceeded = (
  settings: SecuritySettings,
  meta: PendingMeta,
) => ({
  type: actionTypes.SAVE_SETTINGS_SUCCEEDED,
  payload: settings,
  meta,
});

export const fetchComplianceReport = () => ({
  type: actionTypes.FETCH_REPORT_REQUESTED,
});

export const fetchComplianceReportPending = () => ({
  type: actionTypes.FETCH_REPORT_PENDING,
});

export const fetchComplianceReportSucceeded = (report: ComplianceReport) => ({
  type: actionTypes.FETCH_REPORT_SUCCEEDED,
  payload: report,
});

export const fetchComplianceReportFailed = (message: string) => ({
  type: actionTypes.FETCH_REPORT_FAILED,
  payload: { message },
});

export const runSecurityOp = (
  operation: SecurityOp,
  onReveal?: RevealSecuritySecret,
) => ({
  type: actionTypes.SECURITY_OP_REQUESTED,
  payload: operation,
  meta: { pendingKey: keyFor(operation) },
  onReveal,
});

export interface SecurityOpOutcome {
  resource: SecurityResource;
  item?: SecurityCollections[SecurityResource];
  removedId?: string;
  refresh?: SecurityResource[];
}

export const securityOpSucceeded = (
  outcome: SecurityOpOutcome,
  meta: PendingMeta,
) => ({
  type: actionTypes.SECURITY_OP_SUCCEEDED,
  payload: outcome,
  meta,
});

export const securityOpFailed = (
  failure: Omit<SecurityFailure, "key">,
  meta: PendingMeta,
) => ({
  type: actionTypes.SECURITY_OP_FAILED,
  payload: failure,
  meta,
});

export const clearSecurityFailure = () => ({
  type: actionTypes.CLEAR_SECURITY_FAILURE,
});
