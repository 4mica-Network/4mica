import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearUserCache } from "../auth/user-store";
import { initApp } from "../server";
import { developerRoutes } from "./developer";

const { authenticateRequest, getUser, findUnique, upsert, apiKey, webhook } =
  vi.hoisted(() => ({
    authenticateRequest: vi.fn(),
    getUser: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
    apiKey: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    webhook: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  }));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({ authenticateRequest, users: { getUser } })),
}));

vi.mock("@4mica/db", () => ({
  prisma: {
    agent: { count: vi.fn() },
    user: { findUnique, upsert, update: vi.fn() },
    business: { findUnique: vi.fn(), upsert: vi.fn() },
    apiKey,
    webhook,
  },
  disconnect: vi.fn(async () => {}),
}));

const USER_ID = "019fce62-0000-7000-8000-000000000000";

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

const signedOut = () => ({
  isAuthenticated: false,
  status: "signed-out",
  reason: "session-token-missing",
  toAuth: () => ({ tokenType: null, userId: null }),
});

const AUTH = { authorization: "Bearer good" };

const STORED_KEY = {
  id: "key_1",
  name: "CI",
  prefix: "4mica_sk_ab12",
  last4: "wxyz",
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const STORED_WEBHOOK = {
  id: "wh_1",
  url: "https://example.com/hook",
  description: null,
  events: ["payment.succeeded"],
  status: "ENABLED",
  secretPrefix: "whsec_ab12",
  lastDeliveryAt: null,
  lastDeliveryStatus: null,
  failureCount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("developer routes", () => {
  beforeEach(() => {
    for (const m of [authenticateRequest, getUser, findUnique, upsert]) {
      m.mockReset();
    }
    for (const group of [apiKey, webhook]) {
      for (const fn of Object.values(group)) {
        fn.mockReset();
      }
    }
    clearUserCache();

    authenticateRequest.mockResolvedValue(signedIn());
    upsert.mockResolvedValue(AUTH_USER);
    apiKey.findMany.mockResolvedValue([STORED_KEY]);
    apiKey.create.mockResolvedValue(STORED_KEY);
    apiKey.findUnique.mockResolvedValue(STORED_KEY);
    webhook.findMany.mockResolvedValue([STORED_WEBHOOK]);
    webhook.create.mockResolvedValue(STORED_WEBHOOK);
    webhook.findUnique.mockResolvedValue(STORED_WEBHOOK);
  });

  it("lists only the caller's keys", async () => {
    const app = await initApp([{ plugin: developerRoutes }]);
    const res = await app.inject({
      method: "GET",
      url: "/me/api-keys",
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    expect(apiKey.findMany.mock.calls[0][0].where).toEqual({
      ownerId: USER_ID,
    });
    await app.close();
  });

  it("returns the plaintext key exactly once, and never stores it", async () => {
    const app = await initApp([{ plugin: developerRoutes }]);
    const res = await app.inject({
      method: "POST",
      url: "/me/api-keys",
      headers: AUTH,
      payload: { name: "CI" },
    });

    expect(res.statusCode).toBe(201);
    const { plaintext } = res.json();
    expect(plaintext).toMatch(/^4mica_sk_/);

    // What went to the database is a hash, not the key itself.
    const written = apiKey.create.mock.calls[0][0].data;
    expect(written.hashedKey).toMatch(/^[a-f0-9]{64}$/);
    expect(written.hashedKey).not.toContain(plaintext);
    expect(JSON.stringify(written)).not.toContain(plaintext);
    expect(written.ownerId).toBe(USER_ID);

    // Listing never exposes the hash.
    const list = await app.inject({
      method: "GET",
      url: "/me/api-keys",
      headers: AUTH,
    });
    expect(JSON.stringify(list.json())).not.toContain("hashedKey");

    await app.close();
  });

  it("scopes revoke, update and delete to the owner", async () => {
    apiKey.updateMany.mockResolvedValue({ count: 1 });
    apiKey.deleteMany.mockResolvedValue({ count: 1 });

    const app = await initApp([{ plugin: developerRoutes }]);

    await app.inject({
      method: "PATCH",
      url: "/me/api-keys/key_1",
      headers: AUTH,
      payload: { name: "Renamed" },
    });
    expect(apiKey.updateMany.mock.calls[0][0].where).toEqual({
      id: "key_1",
      ownerId: USER_ID,
    });

    await app.inject({
      method: "DELETE",
      url: "/me/api-keys/key_1",
      headers: AUTH,
    });
    expect(apiKey.deleteMany.mock.calls[0][0].where).toEqual({
      id: "key_1",
      ownerId: USER_ID,
    });

    await app.close();
  });

  it("404s when the record belongs to someone else", async () => {
    apiKey.updateMany.mockResolvedValue({ count: 0 });
    apiKey.deleteMany.mockResolvedValue({ count: 0 });
    webhook.updateMany.mockResolvedValue({ count: 0 });

    const app = await initApp([{ plugin: developerRoutes }]);

    for (const [method, url, payload] of [
      ["PATCH", "/me/api-keys/other", { name: "x" }],
      ["DELETE", "/me/api-keys/other", undefined],
      ["POST", "/me/api-keys/other/revoke", undefined],
      ["PATCH", "/me/webhooks/other", { status: "DISABLED" }],
    ] as const) {
      const res = await app.inject({ method, url, headers: AUTH, payload });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }

    await app.close();
  });

  it("rejects a non-https webhook url", async () => {
    const app = await initApp([{ plugin: developerRoutes }]);
    const res = await app.inject({
      method: "POST",
      url: "/me/webhooks",
      headers: AUTH,
      payload: {
        url: "http://example.com/hook",
        events: ["payment.succeeded"],
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0].path).toBe("url");
    expect(webhook.create).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects unknown events and empty subscriptions", async () => {
    const app = await initApp([{ plugin: developerRoutes }]);

    const unknown = await app.inject({
      method: "POST",
      url: "/me/webhooks",
      headers: AUTH,
      payload: { url: "https://example.com", events: ["not.a.real.event"] },
    });
    expect(unknown.statusCode).toBe(400);

    const empty = await app.inject({
      method: "POST",
      url: "/me/webhooks",
      headers: AUTH,
      payload: { url: "https://example.com", events: [] },
    });
    expect(empty.statusCode).toBe(400);
    expect(webhook.create).not.toHaveBeenCalled();

    await app.close();
  });

  it("de-duplicates the event list", async () => {
    const app = await initApp([{ plugin: developerRoutes }]);
    await app.inject({
      method: "POST",
      url: "/me/webhooks",
      headers: AUTH,
      payload: {
        url: "https://example.com/hook",
        events: ["payment.succeeded", "payment.succeeded", "payout.paid"],
      },
    });

    expect(webhook.create.mock.calls[0][0].data.events).toEqual([
      "payment.succeeded",
      "payout.paid",
    ]);

    await app.close();
  });

  it("returns a fresh signing secret on create and rotate", async () => {
    webhook.updateMany.mockResolvedValue({ count: 1 });
    const app = await initApp([{ plugin: developerRoutes }]);

    const created = await app.inject({
      method: "POST",
      url: "/me/webhooks",
      headers: AUTH,
      payload: {
        url: "https://example.com/hook",
        events: ["payment.succeeded"],
      },
    });
    expect(created.json().plaintext).toMatch(/^whsec_/);
    expect(webhook.create.mock.calls[0][0].data.secretHash).toMatch(
      /^[a-f0-9]{64}$/,
    );

    const rotated = await app.inject({
      method: "POST",
      url: "/me/webhooks/wh_1/rotate-secret",
      headers: AUTH,
    });
    expect(rotated.json().plaintext).toMatch(/^whsec_/);
    expect(rotated.json().plaintext).not.toBe(created.json().plaintext);

    await app.close();
  });

  it("exposes the event catalog", async () => {
    const app = await initApp([{ plugin: developerRoutes }]);
    const res = await app.inject({
      method: "GET",
      url: "/webhook-events",
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBeGreaterThan(0);
    expect(res.json()[0]).toHaveProperty("slug");
    expect(res.json()[0]).toHaveProperty("group");

    await app.close();
  });

  it("requires authentication on every developer route", async () => {
    authenticateRequest.mockResolvedValue(signedOut());
    const app = await initApp([{ plugin: developerRoutes }]);

    for (const [method, url] of [
      ["GET", "/webhook-events"],
      ["GET", "/me/api-keys"],
      ["POST", "/me/api-keys"],
      ["PATCH", "/me/api-keys/key_1"],
      ["POST", "/me/api-keys/key_1/revoke"],
      ["DELETE", "/me/api-keys/key_1"],
      ["GET", "/me/webhooks"],
      ["POST", "/me/webhooks"],
      ["PATCH", "/me/webhooks/wh_1"],
      ["POST", "/me/webhooks/wh_1/rotate-secret"],
      ["DELETE", "/me/webhooks/wh_1"],
    ] as const) {
      const res = await app.inject({ method, url, payload: {} });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }

    expect(apiKey.create).not.toHaveBeenCalled();
    expect(webhook.create).not.toHaveBeenCalled();

    await app.close();
  });

  it("blocks a banned account from creating credentials", async () => {
    upsert.mockResolvedValue({ ...AUTH_USER, banned: true });
    const app = await initApp([{ plugin: developerRoutes }]);

    const res = await app.inject({
      method: "POST",
      url: "/me/api-keys",
      headers: AUTH,
      payload: { name: "CI" },
    });

    expect(res.statusCode).toBe(403);
    expect(apiKey.create).not.toHaveBeenCalled();

    await app.close();
  });
});
