import type { FastifyPluginCallback } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authenticateRequest, getUser, findUnique, upsert, apiKeyFind } =
  vi.hoisted(() => ({
    authenticateRequest: vi.fn(),
    getUser: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
    apiKeyFind: vi.fn(),
  }));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({
    authenticateRequest,
    users: { getUser },
  })),
}));

vi.mock("@4mica/db", () => ({
  prisma: {
    $queryRaw: vi.fn(async () => [{ "?column?": 1 }]),
    user: { findUnique, upsert },
    apiKey: {
      findUnique: apiKeyFind,
      update: vi.fn(async () => ({})),
    },
  },
  disconnect: vi.fn(async () => {}),
}));

const userRow = (clerkUserId: string) => ({
  id: `db_${clerkUserId}`,
  clerkUserId,
  email: `${clerkUserId}@example.com`,
  name: clerkUserId,
  avatarUrl: null,
  banned: false,
  locked: false,
  deletedAt: null,
});

const signedInAs = (clerkUserId: string) => ({
  isAuthenticated: true,
  status: "signed-in",
  reason: null,
  toAuth: () => ({
    tokenType: "session_token",
    userId: clerkUserId,
    sessionId: `sess_${clerkUserId}`,
    sessionClaims: {
      sub: clerkUserId,
      sid: `sess_${clerkUserId}`,
      email: `${clerkUserId}@example.com`,
      name: clerkUserId,
    },
  }),
});

const loadApp = async (limits: Record<string, string>) => {
  vi.resetModules();
  vi.stubEnv("RATE_LIMIT_ENABLED", "true");
  vi.stubEnv("RATE_LIMIT_WINDOW_MS", "60000");
  vi.stubEnv("RATE_LIMIT_IP_MAX", limits.ip ?? "1000");
  vi.stubEnv("RATE_LIMIT_USER_MAX", limits.user ?? "1000");
  vi.stubEnv("RATE_LIMIT_SENSITIVE_MAX", limits.sensitive ?? "1000");
  vi.stubEnv("RATE_LIMIT_API_KEY_MAX", limits.apiKey ?? "1000");

  const [
    { initApp },
    { healthRoutes },
    { guards },
    { apiKeyRateLimit, sensitiveRateLimit },
    { authenticateApiKey },
  ] = await Promise.all([
    import("@/server"),
    import("@routes/health"),
    import("@routes/guards"),
    import("./rate-limit"),
    import("@auth/api-key"),
  ]);

  const testRoutes: FastifyPluginCallback = (app, _opts, done) => {
    const base = guards(app);

    app.get("/open", async () => ({ ok: true }));
    app.get("/protected", { ...base }, async () => ({ ok: true }));
    app.post(
      "/sensitive",
      {
        onRequest: base.onRequest,
        preHandler: [...base.preHandler, sensitiveRateLimit(app)],
      },
      async () => ({ ok: true }),
    );
    app.post(
      "/v1/thing",
      {
        onRequest: [authenticateApiKey],
        preHandler: [apiKeyRateLimit(app)],
      },
      async () => ({ ok: true }),
    );

    done();
  };

  return initApp([{ plugin: healthRoutes }, { plugin: testRoutes }]);
};

const AUTH = { authorization: "Bearer good" };

describe("rate limiting", () => {
  beforeEach(() => {
    for (const m of [authenticateRequest, getUser, findUnique, upsert]) {
      m.mockReset();
    }
    authenticateRequest.mockResolvedValue(signedInAs("user_a"));
    findUnique.mockImplementation(async () => userRow("user_a"));
    upsert.mockImplementation(async () => userRow("user_a"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("bounds unauthenticated traffic by IP and reports it as 429", async () => {
    const app = await loadApp({ ip: "3" });

    const codes: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const response = await app.inject({ method: "GET", url: "/open" });
      codes.push(response.statusCode);
    }

    expect(codes).toEqual([200, 200, 200, 429]);

    const blocked = await app.inject({ method: "GET", url: "/open" });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toMatchObject({
      error: "rate_limit_exceeded",
      message: "Too many requests. Retry later.",
    });
    expect(blocked.headers["x-ratelimit-limit"]).toBe("3");
    expect(blocked.headers["x-ratelimit-remaining"]).toBe("0");
    expect(blocked.headers["retry-after"]).toBeDefined();

    await app.close();
  });

  it("counts requests whose token is rejected, ahead of the 401", async () => {
    authenticateRequest.mockResolvedValue({
      isAuthenticated: false,
      status: "signed-out",
      reason: "session-token-missing",
      toAuth: () => ({ tokenType: null, userId: null }),
    });

    const app = await loadApp({ ip: "3" });

    const call = () =>
      app.inject({ method: "GET", url: "/protected", headers: AUTH });

    expect((await call()).statusCode).toBe(401);
    expect((await call()).statusCode).toBe(401);
    expect((await call()).statusCode).toBe(401);

    expect((await call()).statusCode).toBe(429);

    await app.close();
  });

  it("never throttles health probes or preflights", async () => {
    const app = await loadApp({ ip: "2" });

    for (let i = 0; i < 6; i += 1) {
      const response = await app.inject({ method: "GET", url: "/health" });
      expect(response.statusCode).toBe(200);
    }

    const preflight = await app.inject({
      method: "OPTIONS",
      url: "/open",
      headers: {
        origin: "http://localhost:4173",
        "access-control-request-method": "GET",
      },
    });
    expect(preflight.statusCode).not.toBe(429);

    await app.close();
  });

  it("gives each authenticated user its own budget on a shared IP", async () => {
    const app = await loadApp({ user: "2" });

    const call = () =>
      app.inject({ method: "GET", url: "/protected", headers: AUTH });

    expect((await call()).statusCode).toBe(200);
    expect((await call()).statusCode).toBe(200);

    const exhausted = await call();
    expect(exhausted.statusCode).toBe(429);
    expect(exhausted.json()).toMatchObject({ error: "rate_limit_exceeded" });
    expect(exhausted.headers["retry-after"]).toBeDefined();

    authenticateRequest.mockResolvedValue(signedInAs("user_b"));
    findUnique.mockImplementation(async () => userRow("user_b"));
    upsert.mockImplementation(async () => userRow("user_b"));

    expect((await call()).statusCode).toBe(200);

    await app.close();
  });

  it("applies a tighter budget to sensitive endpoints", async () => {
    const app = await loadApp({ user: "50", sensitive: "1" });

    const sensitive = () =>
      app.inject({ method: "POST", url: "/sensitive", headers: AUTH });

    expect((await sensitive()).statusCode).toBe(200);
    expect((await sensitive()).statusCode).toBe(429);

    const ordinary = await app.inject({
      method: "GET",
      url: "/protected",
      headers: AUTH,
    });
    expect(ordinary.statusCode).toBe(200);

    await app.close();
  });

  it("keys the IP limit on the address nginx saw, not a forged X-Forwarded-For", async () => {
    const app = await loadApp({ ip: "3" });

    // nginx appends $remote_addr, so only the last entry is trustworthy; the
    // client controls everything before it.
    const codes: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const response = await app.inject({
        method: "GET",
        url: "/open",
        headers: { "x-forwarded-for": `10.0.0.${i}, 203.0.113.7` },
      });
      codes.push(response.statusCode);
    }

    expect(codes).toEqual([200, 200, 200, 429]);

    await app.close();
  });

  it("still budgets distinct real clients separately behind the proxy", async () => {
    const app = await loadApp({ ip: "1" });

    const first = await app.inject({
      method: "GET",
      url: "/open",
      headers: { "x-forwarded-for": "203.0.113.7" },
    });
    const second = await app.inject({
      method: "GET",
      url: "/open",
      headers: { "x-forwarded-for": "203.0.113.8" },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);

    await app.close();
  });

  it("caps each API key on its own, whichever IP it arrives from", async () => {
    apiKeyFind.mockImplementation(async () => ({
      id: "key_1",
      ownerId: "owner_1",
      revokedAt: null,
      expiresAt: null,
      owner: { banned: false, locked: false, deletedAt: null },
    }));

    const app = await loadApp({ apiKey: "2" });

    const codes: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/thing",
        headers: {
          authorization: "Bearer 4mica_sk_abc",
          "x-forwarded-for": `203.0.113.${i}`,
        },
      });
      codes.push(response.statusCode);
    }

    expect(codes).toEqual([200, 200, 429]);

    await app.close();
  });

  it("stays off by default under NODE_ENV=test", async () => {
    vi.resetModules();
    const { config } = await import("@config/index");

    expect(config.rateLimit.enabled).toBe(false);
  });
});
