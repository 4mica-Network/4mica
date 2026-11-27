import { clearUserCache } from "@auth/user-store";
import { resourceKeyRoutes } from "@routes/resource-keys";
import { serviceAccountRoutes } from "@routes/service-accounts";
import { hashSecret } from "@utils/secrets";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";
import {
  actAs,
  ORG_ID,
  OTHER_PROJECT_ID,
  PRODUCTION_ENV_ID,
  PROJECT_ID,
  SANDBOX_ENV_ID,
} from "@/test-support/tenancy";

const {
  authenticateRequest,
  getUser,
  findUnique,
  upsert,
  serviceAccount,
  apiKey,
  apiListing,
  $transaction,
  tenancy,
} = vi.hoisted(() => ({
  tenancy: {
    membership: { findFirst: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
    project: { findFirst: vi.fn() },
  },
  authenticateRequest: vi.fn(),
  getUser: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  serviceAccount: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  apiKey: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  apiListing: { findFirst: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({ authenticateRequest, users: { getUser } })),
}));

vi.mock("@4mica/db", () => ({
  prisma: {
    ...tenancy,
    user: { findUnique, upsert, update: vi.fn() },
    business: { findUnique: vi.fn(), upsert: vi.fn() },
    serviceAccount,
    apiKey,
    apiListing,
    agent: { findFirst: vi.fn() },
    resourcePolicy: { findFirst: vi.fn() },
    faqItem: { findMany: vi.fn() },
    $transaction,
  },
  disconnect: vi.fn(async () => {}),
}));

const USER_ID = "019fce62-0000-7000-8000-000000000000";
const ACCOUNT_ID = "019fce62-6666-7000-8000-000000000000";
const KEY_ID = "019fce62-7777-7000-8000-000000000000";
const NEW_KEY_ID = "019fce62-7777-7000-8000-000000000001";
const LISTING_ID = "019fce62-1111-7000-8000-000000000000";
const API_KEY = "4mica_sk_test_abcdefghijklmnop";
const NOW = new Date("2026-11-27T12:00:00Z");

const AUTH_USER = {
  id: USER_ID,
  clerkUserId: "user_123",
  email: "ada@example.com",
  name: "Ada Lovelace",
  avatarUrl: null,
  banned: false,
  locked: false,
  deletedAt: null,
};

const signedIn = () => ({
  isAuthenticated: true,
  status: "signed-in",
  reason: null,
  toAuth: () => ({
    tokenType: "session_token",
    userId: "user_123",
    sessionId: "sess_123",
    sessionClaims: { sub: "user_123", sid: "sess_123" },
  }),
});

const AUTH = { authorization: "Bearer good" };
const BASE = "/me/service-accounts";

const storedAccount = (over: Record<string, unknown> = {}) => ({
  id: ACCOUNT_ID,
  name: "CI",
  description: null,
  suspendedAt: null,
  createdAt: NOW,
  createdBy: { id: USER_ID, name: "Ada Lovelace" },
  _count: { apiKeys: 1 },
  ...over,
});

const storedKey = (over: Record<string, unknown> = {}) => ({
  id: KEY_ID,
  name: "Deploys",
  prefix: "4mica_sk_test_ab12",
  last4: "wxyz",
  scopes: ["PAYMENTS_WRITE"],
  serviceAccountId: ACCOUNT_ID,
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  environment: { kind: "SANDBOX" },
  ...over,
});

const authRecord = (over: Record<string, unknown> = {}) => ({
  id: KEY_ID,
  organizationId: ORG_ID,
  projectId: PROJECT_ID,
  environmentId: SANDBOX_ENV_ID,
  serviceAccountId: ACCOUNT_ID,
  scopes: ["RESOURCE_READ"],
  listingId: LISTING_ID,
  agentId: null,
  revokedAt: null,
  expiresAt: null,
  organization: { deletedAt: null },
  project: { deletedAt: null, archivedAt: null },
  environment: { kind: "SANDBOX" },
  serviceAccount: { suspendedAt: null, deletedAt: null },
  listing: { deletedAt: null },
  agent: null,
  ...over,
});

const app = () =>
  initApp([{ plugin: serviceAccountRoutes }, { plugin: resourceKeyRoutes }]);

const call = async (
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  payload?: Record<string, unknown>,
  headers: Record<string, string> = {},
) => {
  const instance = await app();
  const res = await instance.inject({
    method,
    url,
    headers: { ...AUTH, ...headers },
    ...(payload ? { payload } : {}),
  });
  await instance.close();
  return res;
};

const auditActions = () =>
  tenancy.auditLog.create.mock.calls.map(([arg]) => arg.data.action);

describe("service account routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const group of [serviceAccount, apiKey]) {
      for (const fn of Object.values(group)) {
        fn.mockReset();
      }
    }
    clearUserCache();
    actAs(tenancy);

    authenticateRequest.mockResolvedValue(signedIn());
    upsert.mockResolvedValue(AUTH_USER);
    findUnique.mockResolvedValue(AUTH_USER);
    serviceAccount.findMany.mockResolvedValue([storedAccount()]);
    serviceAccount.findFirst.mockResolvedValue(storedAccount());
    serviceAccount.create.mockResolvedValue(storedAccount());
    serviceAccount.updateMany.mockResolvedValue({ count: 1 });
    apiKey.findMany.mockResolvedValue([storedKey()]);
    apiKey.findFirst.mockResolvedValue(storedKey());
    apiKey.findUnique.mockResolvedValue(storedKey());
    apiKey.create.mockImplementation(async () => storedKey({ id: NEW_KEY_ID }));
    apiKey.update.mockResolvedValue({});
    apiKey.updateMany.mockResolvedValue({ count: 1 });
    $transaction.mockImplementation(async (arg: unknown) =>
      Promise.all(arg as Promise<unknown>[]),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists the project's live service accounts with their key counts", async () => {
    const res = await call("GET", BASE);

    expect(res.statusCode).toBe(200);
    expect(res.json().items).toEqual([
      {
        id: ACCOUNT_ID,
        name: "CI",
        description: null,
        suspendedAt: null,
        createdAt: NOW.toISOString(),
        createdBy: { id: USER_ID, name: "Ada Lovelace" },
        keyCount: 1,
      },
    ]);
    const args = serviceAccount.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      deletedAt: null,
    });
    expect(args.select._count.select.apiKeys.where).toEqual({
      environmentId: SANDBOX_ENV_ID,
      revokedAt: null,
    });
  });

  it("creates a service account in the active project and audits it", async () => {
    const res = await call("POST", BASE, {
      name: "CI",
      description: "Deploys",
    });

    expect(res.statusCode).toBe(201);
    expect(serviceAccount.create.mock.calls[0][0].data).toEqual({
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      createdById: USER_ID,
      name: "CI",
      description: "Deploys",
    });
    expect(tenancy.auditLog.create.mock.calls[0][0].data).toMatchObject({
      action: "service_account.created",
      targetId: ACCOUNT_ID,
      metadata: { projectId: PROJECT_ID, environment: "SANDBOX" },
    });
  });

  it("renames a service account", async () => {
    const res = await call("PATCH", `${BASE}/${ACCOUNT_ID}`, { name: "Bots" });

    expect(res.statusCode).toBe(200);
    expect(serviceAccount.updateMany.mock.calls[0][0]).toEqual({
      where: {
        id: ACCOUNT_ID,
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        deletedAt: null,
      },
      data: { name: "Bots" },
    });
    expect(auditActions()).toEqual(["service_account.updated"]);
  });

  it("suspends and reactivates, auditing each", async () => {
    const suspended = await call("POST", `${BASE}/${ACCOUNT_ID}/suspend`);
    expect(suspended.statusCode).toBe(200);
    expect(
      serviceAccount.updateMany.mock.calls[0][0].data.suspendedAt,
    ).toBeInstanceOf(Date);

    serviceAccount.findFirst.mockResolvedValue(
      storedAccount({ suspendedAt: NOW }),
    );
    const reactivated = await call("POST", `${BASE}/${ACCOUNT_ID}/reactivate`);
    expect(reactivated.statusCode).toBe(200);
    expect(serviceAccount.updateMany.mock.calls[1][0].data).toEqual({
      suspendedAt: null,
    });

    expect(auditActions()).toEqual([
      "service_account.suspended",
      "service_account.reactivated",
    ]);
  });

  it("soft-deletes and revokes its keys in one transaction", async () => {
    const res = await call("DELETE", `${BASE}/${ACCOUNT_ID}`);

    expect(res.statusCode).toBe(204);
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(serviceAccount.update.mock.calls[0][0]).toMatchObject({
      where: { id: ACCOUNT_ID },
      data: { deletedAt: expect.any(Date) },
    });
    expect(apiKey.updateMany.mock.calls[0][0]).toMatchObject({
      where: { serviceAccountId: ACCOUNT_ID, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(auditActions()).toEqual(["service_account.deleted"]);
  });

  it("404s on a service account outside the project", async () => {
    serviceAccount.findFirst.mockResolvedValue(null);
    serviceAccount.updateMany.mockResolvedValue({ count: 0 });

    for (const [method, url] of [
      ["PATCH", `${BASE}/${ACCOUNT_ID}`],
      ["POST", `${BASE}/${ACCOUNT_ID}/suspend`],
      ["DELETE", `${BASE}/${ACCOUNT_ID}`],
      ["GET", `${BASE}/${ACCOUNT_ID}/keys`],
      ["POST", `${BASE}/${ACCOUNT_ID}/keys`],
    ] as const) {
      const res = await call(
        method,
        url,
        method === "PATCH"
          ? { name: "x" }
          : url.endsWith("/keys") && method === "POST"
            ? { name: "x", scopes: ["PAYMENTS_WRITE"] }
            : undefined,
      );
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
    expect($transaction).not.toHaveBeenCalled();
    expect(apiKey.create).not.toHaveBeenCalled();
  });

  it("404s on a foreign X-Project-Id without reading anything", async () => {
    const res = await call("GET", BASE, undefined, {
      "x-project-id": OTHER_PROJECT_ID,
    });

    expect(res.statusCode).toBe(404);
    expect(serviceAccount.findMany).not.toHaveBeenCalled();
  });

  it("lets a viewer read but refuses every write", async () => {
    actAs(tenancy, "VIEWER");

    expect((await call("GET", BASE)).statusCode).toBe(200);
    expect((await call("GET", `${BASE}/${ACCOUNT_ID}/keys`)).statusCode).toBe(
      200,
    );

    for (const [method, url, payload, permission] of [
      ["POST", BASE, { name: "CI" }, "service_accounts.manage"],
      [
        "PATCH",
        `${BASE}/${ACCOUNT_ID}`,
        { name: "x" },
        "service_accounts.manage",
      ],
      [
        "POST",
        `${BASE}/${ACCOUNT_ID}/suspend`,
        undefined,
        "service_accounts.manage",
      ],
      [
        "POST",
        `${BASE}/${ACCOUNT_ID}/reactivate`,
        undefined,
        "service_accounts.manage",
      ],
      ["DELETE", `${BASE}/${ACCOUNT_ID}`, undefined, "service_accounts.manage"],
      [
        "POST",
        `${BASE}/${ACCOUNT_ID}/keys`,
        { name: "x", scopes: ["PAYMENTS_WRITE"] },
        "keys.manage",
      ],
      [
        "POST",
        `${BASE}/${ACCOUNT_ID}/keys/${KEY_ID}/revoke`,
        undefined,
        "keys.manage",
      ],
      [
        "POST",
        `${BASE}/${ACCOUNT_ID}/keys/${KEY_ID}/rotate`,
        {},
        "keys.manage",
      ],
    ] as const) {
      const res = await call(method, url, payload);
      expect(res.statusCode, `${method} ${url}`).toBe(403);
      expect(res.json()).toMatchObject({ error: "forbidden", permission });
    }

    expect(serviceAccount.create).not.toHaveBeenCalled();
    expect(serviceAccount.updateMany).not.toHaveBeenCalled();
    expect(apiKey.create).not.toHaveBeenCalled();
    expect(apiKey.updateMany).not.toHaveBeenCalled();
  });

  describe("keys", () => {
    it("lists the account's keys in the active environment only", async () => {
      const res = await call("GET", `${BASE}/${ACCOUNT_ID}/keys`, undefined, {
        "x-environment": "production",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().items[0]).toMatchObject({
        id: KEY_ID,
        environment: "SANDBOX",
        scopes: ["PAYMENTS_WRITE"],
        serviceAccountId: ACCOUNT_ID,
      });
      expect(apiKey.findMany.mock.calls[0][0].where).toEqual({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        environmentId: PRODUCTION_ENV_ID,
        serviceAccountId: ACCOUNT_ID,
      });
    });

    it("mints a key carrying the project, environment, scopes and account", async () => {
      const res = await call("POST", `${BASE}/${ACCOUNT_ID}/keys`, {
        name: "Deploys",
        scopes: ["PAYMENTS_WRITE", "CUSTOMERS_READ"],
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.secret).toMatch(/^4mica_sk_test_/);
      expect(body).toMatchObject({
        id: NEW_KEY_ID,
        environment: "SANDBOX",
        serviceAccountId: ACCOUNT_ID,
      });

      const data = apiKey.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        environmentId: SANDBOX_ENV_ID,
        serviceAccountId: ACCOUNT_ID,
        createdById: USER_ID,
        scopes: ["PAYMENTS_WRITE", "CUSTOMERS_READ"],
        expiresAt: null,
      });
      expect(data.hashedKey).toBe(hashSecret(body.secret));
      expect(JSON.stringify(data)).not.toContain(body.secret);

      const entry = tenancy.auditLog.create.mock.calls[0][0].data;
      expect(entry).toMatchObject({
        action: "api_key.created",
        targetId: NEW_KEY_ID,
      });
      expect(JSON.stringify(entry)).not.toContain(body.secret);
    });

    it("prefixes a production key as live", async () => {
      const res = await call(
        "POST",
        `${BASE}/${ACCOUNT_ID}/keys`,
        { name: "Deploys", scopes: ["PAYMENTS_WRITE"] },
        { "x-environment": "production" },
      );

      expect(res.statusCode).toBe(201);
      expect(res.json().secret).toMatch(/^4mica_sk_live_/);
      expect(apiKey.create.mock.calls[0][0].data.environmentId).toBe(
        PRODUCTION_ENV_ID,
      );
    });

    it("requires at least one known scope", async () => {
      for (const scopes of [undefined, [], ["EVERYTHING"]]) {
        const res = await call("POST", `${BASE}/${ACCOUNT_ID}/keys`, {
          name: "Deploys",
          ...(scopes ? { scopes } : {}),
        });
        expect(res.statusCode).toBe(400);
      }
      expect(apiKey.create).not.toHaveBeenCalled();
    });

    it("refuses new keys for a suspended account", async () => {
      serviceAccount.findFirst.mockResolvedValue(
        storedAccount({ suspendedAt: NOW }),
      );

      const res = await call("POST", `${BASE}/${ACCOUNT_ID}/keys`, {
        name: "Deploys",
        scopes: ["PAYMENTS_WRITE"],
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("service_account_suspended");
      expect(apiKey.create).not.toHaveBeenCalled();
    });

    it("revokes only a key of this account in the active environment", async () => {
      const res = await call(
        "POST",
        `${BASE}/${ACCOUNT_ID}/keys/${KEY_ID}/revoke`,
      );

      expect(res.statusCode).toBe(200);
      expect(apiKey.updateMany.mock.calls[0][0].where).toEqual({
        id: KEY_ID,
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        environmentId: SANDBOX_ENV_ID,
        serviceAccountId: ACCOUNT_ID,
        revokedAt: null,
      });
      expect(auditActions()).toEqual(["api_key.revoked"]);
    });

    it("rotates immediately by default, revoking the old key", async () => {
      const res = await call(
        "POST",
        `${BASE}/${ACCOUNT_ID}/keys/${KEY_ID}/rotate`,
        {},
      );

      expect(res.statusCode).toBe(201);
      expect(res.json().secret).toMatch(/^4mica_sk_test_/);
      expect(apiKey.updateMany.mock.calls[0][0]).toMatchObject({
        where: { id: KEY_ID, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(apiKey.create.mock.calls[0][0].data).toMatchObject({
        name: "Deploys",
        scopes: ["PAYMENTS_WRITE"],
        serviceAccountId: ACCOUNT_ID,
        projectId: PROJECT_ID,
        environmentId: SANDBOX_ENV_ID,
      });
      expect(tenancy.auditLog.create.mock.calls[0][0].data).toMatchObject({
        action: "api_key.rotated",
        targetId: KEY_ID,
        metadata: { replacedBy: NEW_KEY_ID },
      });
    });

    it("keeps the old key alive until the grace period ends", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(NOW);

      const res = await call(
        "POST",
        `${BASE}/${ACCOUNT_ID}/keys/${KEY_ID}/rotate`,
        { expireOldInHours: 24 },
      );

      expect(res.statusCode).toBe(201);
      const update = apiKey.updateMany.mock.calls[0][0].data;
      expect(update).not.toHaveProperty("revokedAt");
      expect(update.expiresAt).toEqual(
        new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
      );
    });

    it("never extends an old key past its own expiry", async () => {
      const soon = new Date(Date.now() + 60 * 60 * 1000);
      apiKey.findFirst.mockResolvedValue(storedKey({ expiresAt: soon }));

      await call("POST", `${BASE}/${ACCOUNT_ID}/keys/${KEY_ID}/rotate`, {
        expireOldInHours: 48,
      });

      expect(apiKey.updateMany.mock.calls[0][0].data.expiresAt).toEqual(soon);
    });

    it("refuses a grace period over a week", async () => {
      const res = await call(
        "POST",
        `${BASE}/${ACCOUNT_ID}/keys/${KEY_ID}/rotate`,
        { expireOldInHours: 169 },
      );

      expect(res.statusCode).toBe(400);
      expect(apiKey.create).not.toHaveBeenCalled();
    });

    it("404s rotating a key that is not active", async () => {
      apiKey.findFirst.mockResolvedValue(null);

      const res = await call(
        "POST",
        `${BASE}/${ACCOUNT_ID}/keys/${KEY_ID}/rotate`,
        {},
      );

      expect(res.statusCode).toBe(404);
      expect(apiKey.create).not.toHaveBeenCalled();
    });
  });

  describe("using a service account key", () => {
    const presentKey = async () => {
      apiListing.findFirst.mockResolvedValue(null);
      const instance = await app();
      const res = await instance.inject({
        method: "GET",
        url: "/v1/resource",
        headers: { authorization: `Bearer ${API_KEY}` },
      });
      await instance.close();
      return res;
    };

    it("is accepted while the account is active", async () => {
      apiKey.findUnique.mockResolvedValue(authRecord());

      expect((await presentKey()).statusCode).toBe(404);
      expect(apiKey.findUnique.mock.calls[0][0].where).toEqual({
        hashedKey: hashSecret(API_KEY),
      });
    });

    it("is rejected once the account is suspended or deleted", async () => {
      for (const state of [
        { suspendedAt: NOW, deletedAt: null },
        { suspendedAt: null, deletedAt: NOW },
      ]) {
        apiKey.findUnique.mockResolvedValue(
          authRecord({ serviceAccount: state }),
        );
        expect((await presentKey()).statusCode).toBe(401);
      }
      expect(apiListing.findFirst).not.toHaveBeenCalled();
    });

    it("is refused without the scope the route needs", async () => {
      apiKey.findUnique.mockResolvedValue(
        authRecord({ scopes: ["PAYMENTS_WRITE"] }),
      );

      const res = await presentKey();

      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({
        error: "insufficient_scope",
        scope: "RESOURCE_READ",
      });
      expect(apiListing.findFirst).not.toHaveBeenCalled();
    });

    it("keeps working through a rotation grace period and stops after it", async () => {
      apiKey.findUnique.mockResolvedValue(
        authRecord({ expiresAt: new Date(Date.now() + 60_000) }),
      );
      expect((await presentKey()).statusCode).toBe(404);

      apiKey.findUnique.mockResolvedValue(
        authRecord({ expiresAt: new Date(Date.now() - 1) }),
      );
      expect((await presentKey()).statusCode).toBe(401);
    });
  });
});
