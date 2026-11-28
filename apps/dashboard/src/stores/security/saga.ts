import { HttpError } from "@4mica/http";
import * as api from "@api/security";
import i18n from "@i18n";
import { handledAsApproval } from "@stores/approvalRequired";
import type { Permission } from "@stores/organization/type";
import { fetchMembers } from "@stores/team/actions";
import type { PendingMeta } from "@stores/utils";
import { toIssueMap, toMessage } from "@utils/http-errors";
import { call, put, takeEvery } from "redux-saga/effects";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  fetchComplianceReportFailed,
  fetchComplianceReportPending,
  fetchComplianceReportSucceeded,
  fetchSecurity,
  fetchSecurityFailed,
  fetchSecurityPending,
  fetchSecuritySettingsFailed,
  fetchSecuritySettingsPending,
  fetchSecuritySettingsSucceeded,
  fetchSecuritySucceeded,
  type SecurityOp,
  type SecurityOpName,
  type SecurityOpOutcome,
  saveSecuritySettingsSucceeded,
  securityOpFailed,
  securityOpSucceeded,
} from "./actions";
import actionTypes from "./actionTypes";
import type {
  AuditStream,
  ComplianceReport,
  CustomRole,
  OrganizationDomain,
  RevealSecuritySecret,
  ScimGroup,
  ScimToken,
  SecurityCollections,
  SecurityResource,
  SecuritySettings,
  SsoConnection,
} from "./type";

const t = (key: string, defaultValue: string, options = {}) =>
  i18n.t(key, { defaultValue, ...options });

const LOADERS: {
  [R in SecurityResource]: () => Promise<{
    items: SecurityCollections[R][];
    assignablePermissions?: Permission[];
  }>;
} = {
  domains: api.getDomains,
  sso: api.getSsoConnections,
  roles: api.getCustomRoles,
  scimTokens: api.getScimTokens,
  scimGroups: api.getScimGroups,
  streams: api.getAuditStreams,
};

const NOTICES: Partial<Record<SecurityOpName, [string, string]>> = {
  verifyDomain: ["security.notice.verifyDomain", "Domain verified"],
  deleteDomain: ["security.notice.deleteDomain", "Domain removed"],
  createSso: ["security.notice.createSso", "Connection created"],
  deleteSso: ["security.notice.deleteSso", "Connection deleted"],
  saveRole: ["security.notice.saveRole", "Role saved"],
  deleteRole: ["security.notice.deleteRole", "Role deleted"],
  revokeScimToken: ["security.notice.revokeScimToken", "Token revoked"],
  testStream: ["security.notice.testStream", "Test event sent"],
  deleteStream: ["security.notice.deleteStream", "Stream deleted"],
};

export const errorBody = (error: unknown): Record<string, unknown> =>
  error instanceof HttpError &&
  error.body !== null &&
  typeof error.body === "object"
    ? (error.body as Record<string, unknown>)
    : {};

export const securityFailureMessage = (
  error: unknown,
  fallback: string,
): string => {
  const body = errorBody(error);
  switch (body.error) {
    case "sso_unavailable":
      return t(
        "security.errors.ssoUnavailable",
        "Enterprise SSO is not enabled for the 4mica sign-in service yet, so nothing was saved.",
      );
    case "would_lock_out":
      if (typeof body.ip !== "string") {
        return t(
          "security.errors.ssoWouldLockOut",
          "Sign in through this connection before requiring it. Requiring single sign-on needs the sso_connection_id session token claim, and your current session does not carry it for this connection.",
        );
      }
      return t(
        "security.errors.wouldLockOut",
        "This allowlist would lock you out. Add your current IP ({{ip}}) first.",
        { ip: typeof body.ip === "string" ? body.ip : "?" },
      );
    case "identity_not_managed":
      return t(
        "security.errors.identityNotManaged",
        "Only members whose email is on one of your verified domains can be signed out everywhere.",
      );
    default:
      return toMessage(error, fallback);
  }
};

function* fail(error: unknown, fallback: string, meta: PendingMeta) {
  const body = errorBody(error);
  const failure = {
    code: typeof body.error === "string" ? body.error : null,
    message: securityFailureMessage(error, fallback),
    issues: toIssueMap(error),
    detail: body,
  };
  if (yield* handledAsApproval(error, securityOpFailed({ ...failure }, meta))) {
    return;
  }
  yield put(securityOpFailed(failure, meta));
  notifyError({
    title: t("security.failedTitle", "Something went wrong"),
    content: failure.message,
  });
}

export function* loadSecurity(action: {
  type: string;
  payload: { resource: SecurityResource };
}): Generator {
  const { resource } = action.payload;
  try {
    yield put(fetchSecurityPending(resource));
    const result = (yield call(LOADERS[resource])) as {
      items: SecurityCollections[typeof resource][];
      assignablePermissions?: Permission[];
    };
    yield put(
      fetchSecuritySucceeded({
        resource,
        items: result.items,
        ...(result.assignablePermissions
          ? { assignablePermissions: result.assignablePermissions }
          : {}),
      }),
    );
  } catch (error) {
    yield put(
      fetchSecurityFailed(
        resource,
        toMessage(error, t("security.loadFailed", "Couldn't load this.")),
      ),
    );
  }
}

export function* loadSettings(): Generator {
  try {
    yield put(fetchSecuritySettingsPending());
    const settings = (yield call(api.getSecuritySettings)) as SecuritySettings;
    yield put(fetchSecuritySettingsSucceeded(settings));
  } catch (error) {
    yield put(
      fetchSecuritySettingsFailed(
        toMessage(error, t("security.loadFailed", "Couldn't load this.")),
      ),
    );
  }
}

export function* saveSettings(action: {
  type: string;
  payload: SecuritySettings;
  meta: PendingMeta;
}): Generator {
  try {
    const settings = (yield call(
      api.updateSecuritySettings,
      action.payload,
    )) as SecuritySettings;
    yield put(saveSecuritySettingsSucceeded(settings, action.meta));
    notifySuccess({
      title: t("security.notice.saveSettings", "Security policies saved"),
      content: "",
    });
  } catch (error) {
    yield* fail(
      error,
      t("security.saveFailed", "Couldn't save the changes."),
      action.meta,
    );
  }
}

export function* loadReport(): Generator {
  try {
    yield put(fetchComplianceReportPending());
    const report = (yield call(api.getComplianceReport)) as ComplianceReport;
    yield put(fetchComplianceReportSucceeded(report));
  } catch (error) {
    yield put(
      fetchComplianceReportFailed(
        toMessage(
          error,
          t("security.report.loadFailed", "Couldn't build the report."),
        ),
      ),
    );
  }
}

type Item<R extends SecurityResource> = SecurityCollections[R];

export function* perform(
  operation: SecurityOp,
  onReveal?: RevealSecuritySecret,
): Generator<unknown, SecurityOpOutcome> {
  switch (operation.op) {
    case "createDomain":
      return {
        resource: "domains",
        item: (yield call(
          api.createDomain,
          operation.domain,
        )) as OrganizationDomain,
      };
    case "verifyDomain":
      return {
        resource: "domains",
        item: (yield call(api.verifyDomain, operation.id)) as Item<"domains">,
      };
    case "updateDomain":
      return {
        resource: "domains",
        item: (yield call(
          api.updateDomain,
          operation.id,
          operation.data,
        )) as Item<"domains">,
      };
    case "deleteDomain":
      yield call(api.deleteDomain, operation.id);
      return {
        resource: "domains",
        removedId: operation.id,
        refresh: ["sso"],
      };
    case "createSso":
      return {
        resource: "sso",
        item: (yield call(
          api.createSsoConnection,
          operation.data,
        )) as SsoConnection,
      };
    case "updateSso":
      return {
        resource: "sso",
        item: (yield call(
          api.updateSsoConnection,
          operation.id,
          operation.data,
        )) as SsoConnection,
      };
    case "deleteSso":
      yield call(api.deleteSsoConnection, operation.id);
      return { resource: "sso", removedId: operation.id };
    case "saveRole":
      return {
        resource: "roles",
        item: (yield operation.id
          ? call(api.updateCustomRole, operation.id, operation.data)
          : call(api.createCustomRole, operation.data)) as CustomRole,
      };
    case "deleteRole":
      yield call(api.deleteCustomRole, operation.id);
      return { resource: "roles", removedId: operation.id };
    case "createScimToken": {
      const { secret, ...token } = (yield call(
        api.createScimToken,
        operation.name,
      )) as ScimToken & { secret: string };
      onReveal?.({
        kind: "scimToken",
        secret,
        baseUrl: api.SCIM_BASE_URL,
        name: token.name,
      });
      return { resource: "scimTokens", item: token };
    }
    case "revokeScimToken":
      return {
        resource: "scimTokens",
        item: (yield call(api.revokeScimToken, operation.id)) as ScimToken,
      };
    case "updateScimGroup":
      return {
        resource: "scimGroups",
        item: (yield call(
          api.updateScimGroup,
          operation.id,
          operation.data,
        )) as ScimGroup,
      };
    case "createStream":
    case "rotateStream": {
      const { stream, secret } = (yield operation.op === "createStream"
        ? call(api.createAuditStream, operation.data)
        : call(api.rotateAuditStreamSecret, operation.id)) as {
        stream: AuditStream;
        secret: string;
      };
      onReveal?.({
        kind: "streamSecret",
        secret,
        streamId: stream.id,
        name: stream.name,
      });
      return { resource: "streams", item: stream };
    }
    case "updateStream":
      return {
        resource: "streams",
        item: (yield call(
          api.updateAuditStream,
          operation.id,
          operation.data,
        )) as AuditStream,
      };
    case "resumeStream":
      return {
        resource: "streams",
        item: (yield call(api.resumeAuditStream, operation.id)) as AuditStream,
      };
    case "testStream":
      yield call(api.testAuditStream, operation.id);
      return { resource: "streams", refresh: ["streams"] };
    case "deleteStream":
      yield call(api.deleteAuditStream, operation.id);
      return { resource: "streams", removedId: operation.id };
  }
}

const MEMBER_AFFECTING: SecurityOpName[] = ["saveRole", "deleteRole"];

export function* runOp(action: {
  type: string;
  payload: SecurityOp;
  meta: PendingMeta;
  onReveal?: RevealSecuritySecret;
}): Generator {
  const { payload: operation, meta } = action;
  try {
    const outcome = (yield* perform(operation, action.onReveal)) as
      | SecurityOpOutcome
      | undefined;
    if (!outcome) {
      return;
    }
    yield put(securityOpSucceeded(outcome, meta));
    for (const resource of outcome.refresh ?? []) {
      yield put(fetchSecurity(resource));
    }
    if (MEMBER_AFFECTING.includes(operation.op)) {
      yield put(fetchMembers());
    }
    const notice = NOTICES[operation.op];
    if (notice) {
      notifySuccess({ title: t(...notice), content: "" });
    }
  } catch (error) {
    yield* fail(
      error,
      t("security.saveFailed", "Couldn't save the changes."),
      meta,
    );
  }
}

export default [
  takeEvery(actionTypes.FETCH_SECURITY_REQUESTED, loadSecurity),
  takeEvery(actionTypes.FETCH_SETTINGS_REQUESTED, loadSettings),
  takeEvery(actionTypes.SAVE_SETTINGS_REQUESTED, saveSettings),
  takeEvery(actionTypes.FETCH_REPORT_REQUESTED, loadReport),
  takeEvery(actionTypes.SECURITY_OP_REQUESTED, runOp),
];
