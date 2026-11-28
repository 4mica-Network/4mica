import { HttpError } from "@4mica/http";
import { runSaga } from "redux-saga";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  SCIM_BASE_URL: "https://api.test/scim/v2",
  getDomains: vi.fn(),
  createDomain: vi.fn(),
  verifyDomain: vi.fn(),
  updateDomain: vi.fn(),
  deleteDomain: vi.fn(),
  getSsoConnections: vi.fn(),
  createSsoConnection: vi.fn(),
  updateSsoConnection: vi.fn(),
  deleteSsoConnection: vi.fn(),
  getSecuritySettings: vi.fn(),
  updateSecuritySettings: vi.fn(),
  getCustomRoles: vi.fn(),
  createCustomRole: vi.fn(),
  updateCustomRole: vi.fn(),
  deleteCustomRole: vi.fn(),
  getScimTokens: vi.fn(),
  createScimToken: vi.fn(),
  revokeScimToken: vi.fn(),
  getScimGroups: vi.fn(),
  updateScimGroup: vi.fn(),
  getAuditStreams: vi.fn(),
  createAuditStream: vi.fn(),
  updateAuditStream: vi.fn(),
  rotateAuditStreamSecret: vi.fn(),
  testAuditStream: vi.fn(),
  resumeAuditStream: vi.fn(),
  deleteAuditStream: vi.fn(),
  getComplianceReport: vi.fn(),
}));
vi.mock("@api/security", () => api);

const { notifyError, notifySuccess } = vi.hoisted(() => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}));
vi.mock("@/lib/notify", () => ({ notifyError, notifySuccess }));

const saga = await import("./saga");
const actions = await import("./actions");
const actionTypes = (await import("./actionTypes")).default;
const reducerModule = await import("./reducer");
const reducer = reducerModule.default;
const { INITIAL_STATE } = reducerModule;
const teamTypes = (await import("@stores/team/actionTypes")).default;

interface Dispatched {
  type: string;
  payload?: unknown;
  meta?: { pendingKey: string };
}

const record = async (
  worker: (action: never) => Generator,
  action: unknown,
) => {
  const dispatched: Dispatched[] = [];
  await runSaga(
    {
      dispatch: (next: Dispatched) => dispatched.push(next),
      getState: () => ({ security: INITIAL_STATE }),
    },
    worker as (a: unknown) => Generator,
    action,
  ).toPromise();
  return dispatched;
};

const types = (dispatched: Dispatched[]) => dispatched.map((a) => a.type);

const DOMAIN = {
  id: "dom_1",
  domain: "acme.com",
  verified: false,
  verifiedAt: null,
  verificationRecord: {
    type: "TXT" as const,
    name: "_4mica-verification.acme.com",
    value: "4mica-verification=abc",
  },
  autoJoin: false,
  autoJoinRole: "VIEWER" as const,
  lastCheckedAt: null,
  createdAt: "2026-11-01T00:00:00.000Z",
};

const STREAM = {
  id: "str_1",
  name: "SIEM",
  url: "https://siem.example.com",
  status: "ACTIVE" as const,
  actionPrefixes: [],
  secretPrefix: "abc",
  lastDeliveryAt: null,
  lastStatusCode: null,
  lastError: null,
  consecutiveFailures: 0,
  nextAttemptAt: null,
  createdAt: "2026-11-01T00:00:00.000Z",
};

const run = (
  operation: Parameters<typeof actions.runSecurityOp>[0],
  reveal?: (s: unknown) => void,
) => record(saga.runOp, actions.runSecurityOp(operation, reveal));

describe("security reducer", () => {
  it("loads a collection and keeps the assignable permissions that came with roles", () => {
    const state = reducer(
      INITIAL_STATE,
      actions.fetchSecuritySucceeded({
        resource: "roles",
        items: [],
        assignablePermissions: ["audit.read"],
      }),
    );
    expect(state.roles.status).toBe("loaded");
    expect(state.assignablePermissions).toEqual(["audit.read"]);
  });

  it("upserts and removes items after an operation", () => {
    const meta = { pendingKey: "createDomain" };
    let state = reducer(
      INITIAL_STATE,
      actions.securityOpSucceeded({ resource: "domains", item: DOMAIN }, meta),
    );
    expect(state.domains.items).toEqual([DOMAIN]);
    state = reducer(
      state,
      actions.securityOpSucceeded(
        { resource: "domains", item: { ...DOMAIN, verified: true } },
        meta,
      ),
    );
    expect(state.domains.items).toHaveLength(1);
    expect(state.domains.items[0].verified).toBe(true);
    state = reducer(
      state,
      actions.securityOpSucceeded(
        { resource: "domains", removedId: DOMAIN.id },
        meta,
      ),
    );
    expect(state.domains.items).toEqual([]);
  });

  it("scopes a failure to the row that caused it", () => {
    const key = actions.securityPendingKeys.op("verifyDomain", "dom_1");
    const state = reducer(
      reducer(
        INITIAL_STATE,
        actions.runSecurityOp({ op: "verifyDomain", id: "dom_1" }),
      ),
      actions.securityOpFailed(
        {
          code: "domain_unverified",
          message: "Not found",
          issues: {},
          detail: {},
        },
        { pendingKey: key },
      ),
    );
    expect(state.pending).toEqual({});
    expect(state.failure?.key).toBe(key);
    expect(state.failure?.code).toBe("domain_unverified");
  });
});

describe("security sagas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads the requested collection", async () => {
    api.getDomains.mockResolvedValue({ items: [DOMAIN] });
    const dispatched = await record(
      saga.loadSecurity,
      actions.fetchSecurity("domains"),
    );
    expect(types(dispatched)).toEqual([
      actionTypes.FETCH_SECURITY_PENDING,
      actionTypes.FETCH_SECURITY_SUCCEEDED,
    ]);
    expect(dispatched[1].payload).toEqual({
      resource: "domains",
      items: [DOMAIN],
    });
  });

  it("keeps what DNS returned when verification fails", async () => {
    api.verifyDomain.mockRejectedValue(
      new HttpError(422, "Unprocessable", {
        error: "domain_unverified",
        message: "The TXT record was not found.",
        found: ["v=spf1 -all"],
      }),
    );
    const dispatched = await run({ op: "verifyDomain", id: "dom_1" });
    const failed = dispatched.find(
      (a) => a.type === actionTypes.SECURITY_OP_FAILED,
    );
    expect(failed?.payload).toMatchObject({
      code: "domain_unverified",
      message: "The TXT record was not found.",
      detail: { found: ["v=spf1 -all"] },
    });
  });

  it("explains that Enterprise SSO must be enabled when the sign-in service refuses", async () => {
    api.createSsoConnection.mockRejectedValue(
      new HttpError(409, "Conflict", {
        error: "sso_unavailable",
        message: "Enterprise SSO is not enabled.",
      }),
    );
    const dispatched = await run({
      op: "createSso",
      data: {
        domainId: "dom_1",
        provider: "OKTA",
        name: "Okta",
        idpMetadataUrl: "https://acme.okta.com/metadata",
      },
    });
    const failed = dispatched.find(
      (a) => a.type === actionTypes.SECURITY_OP_FAILED,
    );
    expect(failed?.payload).toMatchObject({ code: "sso_unavailable" });
    expect(notifyError.mock.calls[0][0].content).toContain(
      "Enterprise SSO is not enabled for the 4mica sign-in service",
    );
  });

  it("names the caller's IP when the allowlist would lock them out", async () => {
    api.updateSecuritySettings.mockRejectedValue(
      new HttpError(409, "Conflict", {
        error: "would_lock_out",
        message: "Locked out",
        ip: "203.0.113.9",
      }),
    );
    const dispatched = await record(
      saga.saveSettings,
      actions.saveSecuritySettings({
        requireMfa: false,
        sessionMaxAgeHours: null,
        reauthWindowMinutes: 15,
        ipAllowlist: ["10.0.0.0/8"],
        enforceIpAllowlistForApiKeys: false,
      }),
    );
    const failed = dispatched.find(
      (a) => a.type === actionTypes.SECURITY_OP_FAILED,
    );
    expect(failed?.payload).toMatchObject({
      code: "would_lock_out",
      detail: { ip: "203.0.113.9" },
    });
    expect(String((failed?.payload as { message: string }).message)).toContain(
      "203.0.113.9",
    );
  });

  it("explains the session claim when requiring single sign-on would lock the caller out", () => {
    const message = saga.securityFailureMessage(
      new HttpError(409, "Conflict", {
        error: "would_lock_out",
        message: "Locked out",
      }),
      "fallback",
    );
    expect(message).toContain("sso_connection_id");
    expect(message).not.toContain("?");
  });

  it("hands a new SCIM token and the base URL to the page once, and keeps them out of the store", async () => {
    const token = {
      id: "tok_1",
      name: "Okta",
      prefix: "4mica_scim_ab",
      createdAt: "2026-11-01T00:00:00.000Z",
      lastUsedAt: null,
      revokedAt: null,
    };
    api.createScimToken.mockResolvedValue({
      ...token,
      secret: "4mica_scim_secret",
    });
    const reveal = vi.fn();
    const dispatched = await run(
      { op: "createScimToken", name: "Okta" },
      reveal,
    );

    expect(reveal).toHaveBeenCalledTimes(1);
    expect(reveal).toHaveBeenCalledWith({
      kind: "scimToken",
      secret: "4mica_scim_secret",
      baseUrl: "https://api.test/scim/v2",
      name: "Okta",
    });
    const state = dispatched.reduce(
      (current, action) => reducer(current, action),
      INITIAL_STATE,
    );
    expect(state.scimTokens.items).toEqual([token]);
    expect(JSON.stringify(state)).not.toContain("4mica_scim_secret");
  });

  it("reveals a stream secret on create and on rotation", async () => {
    api.createAuditStream.mockResolvedValue({ stream: STREAM, secret: "s1" });
    api.rotateAuditStreamSecret.mockResolvedValue({
      stream: STREAM,
      secret: "s2",
    });
    const reveal = vi.fn();

    await run(
      {
        op: "createStream",
        data: { name: "SIEM", url: STREAM.url, actionPrefixes: [] },
      },
      reveal,
    );
    await run({ op: "rotateStream", id: STREAM.id }, reveal);

    expect(reveal.mock.calls.map(([secret]) => secret.secret)).toEqual([
      "s1",
      "s2",
    ]);
  });

  it("refreshes the streams after a test delivery", async () => {
    api.testAuditStream.mockResolvedValue({ ok: true });
    const dispatched = await run({ op: "testStream", id: STREAM.id });
    expect(types(dispatched)).toEqual([
      actionTypes.SECURITY_OP_SUCCEEDED,
      actionTypes.FETCH_SECURITY_REQUESTED,
    ]);
    expect(notifySuccess).toHaveBeenCalled();
  });

  it("reloads the members after a custom role is deleted", async () => {
    api.deleteCustomRole.mockResolvedValue(undefined);
    const dispatched = await run({ op: "deleteRole", id: "role_1" });
    expect(types(dispatched)).toContain(teamTypes.FETCH_MEMBERS_REQUESTED);
    expect(dispatched[0].payload).toEqual({
      resource: "roles",
      removedId: "role_1",
    });
  });

  it("refreshes SSO connections after a domain is deleted", async () => {
    api.deleteDomain.mockResolvedValue(undefined);
    const dispatched = await run({ op: "deleteDomain", id: "dom_1" });
    expect(dispatched[1]).toEqual(actions.fetchSecurity("sso"));
  });
});
