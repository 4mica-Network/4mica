import { clearUserCache } from "@auth/user-store";
import { configRoutes } from "@routes/config";
import { clearConfigCache } from "@utils/config/index";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";
import { CONFIG_CACHE_CONTROL } from "./index";

const { authenticateRequest, getUser, findUnique, upsert } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getUser: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({ authenticateRequest, users: { getUser } })),
}));

vi.mock("@4mica/db", () => ({
  prisma: {
    agent: { count: vi.fn() },
    user: { findUnique, upsert, update: vi.fn() },
  },
  disconnect: vi.fn(async () => {}),
}));

const AUTH_USER = {
  id: "019fce62-0000-7000-8000-000000000000",
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

describe("GET /config", () => {
  beforeEach(() => {
    for (const mock of [authenticateRequest, getUser, findUnique, upsert]) {
      mock.mockReset();
    }
    clearUserCache();
    clearConfigCache();

    authenticateRequest.mockResolvedValue(signedIn());
    upsert.mockResolvedValue(AUTH_USER);
  });

  it("requires authentication", async () => {
    authenticateRequest.mockResolvedValue(signedOut());
    const app = await initApp([{ plugin: configRoutes }]);

    const res = await app.inject({ method: "GET", url: "/config" });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("returns every option list with caching headers", async () => {
    const app = await initApp([{ plugin: configRoutes }]);

    const res = await app.inject({
      method: "GET",
      url: "/config",
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe(CONFIG_CACHE_CONTROL);
    const body = res.json();
    expect(res.headers.etag).toBe(`"${body.version}"`);
    expect(body.countries).toContainEqual({ code: "DE", name: "Germany" });
    expect(body.timezones.length).toBeGreaterThan(100);
    expect(body.currencies).toContain("USD");
    expect(body.businessTypes).toContain("LLC");
    expect(body.ownerRoles).toContain("DIRECTOR");
    expect(body.networks).toContain("BASE");

    await app.close();
  });

  it("answers 304 when the client already holds the current version", async () => {
    const app = await initApp([{ plugin: configRoutes }]);
    const first = await app.inject({
      method: "GET",
      url: "/config",
      headers: AUTH,
    });

    const res = await app.inject({
      method: "GET",
      url: "/config",
      headers: { ...AUTH, "if-none-match": first.headers.etag as string },
    });

    expect(res.statusCode).toBe(304);
    expect(res.body).toBe("");
    expect(res.headers["cache-control"]).toBe(CONFIG_CACHE_CONTROL);

    await app.close();
  });

  it("sends the full config when the client version is stale", async () => {
    const app = await initApp([{ plugin: configRoutes }]);

    const res = await app.inject({
      method: "GET",
      url: "/config",
      headers: { ...AUTH, "if-none-match": '"outdated"' },
    });

    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
