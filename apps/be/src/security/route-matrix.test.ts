import type { FastifyPluginCallback, RouteOptions } from "fastify";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { authenticateRequest, getUser, touched, userRow } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getUser: vi.fn(),
  touched: new Set<string>(),
  userRow: {
    current: null as Record<string, unknown> | null,
  },
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({ authenticateRequest, users: { getUser } })),
}));

vi.mock("@4mica/db", () => {
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_target, method: string) =>
          vi.fn(async () => {
            touched.add(name);
            if (name === "user") {
              return userRow.current;
            }
            if (method === "findMany" || method === "groupBy") {
              return [];
            }
            if (method === "count") {
              return 0;
            }
            return null;
          }),
      },
    );

  const prisma = new Proxy(
    {},
    {
      get: (_target, name: string) => {
        if (name === "$transaction") {
          return vi.fn(async () => {
            touched.add("$transaction");
            return [];
          });
        }
        if (name === "$queryRaw") {
          return vi.fn(async () => {
            touched.add("$queryRaw");
            return [];
          });
        }
        return model(name);
      },
    },
  );

  return {
    prisma,
    Prisma: {
      join: (values: unknown[]) => ({ values }),
      sql: (strings: TemplateStringsArray) => ({ strings }),
      empty: {},
    },
    disconnect: vi.fn(async () => {}),
  };
});

const PUBLIC = new Set([
  "GET /health",
  "GET /verify-email",
  "GET /unsubscribe",
  "POST /unsubscribe",
  "POST /v1/cli/device/code",
  "POST /v1/cli/device/token",
  "GET /v1/invitations/:token/preview",
]);

const API_KEY_ROUTES = new Set([
  "POST /v1/payments",
  "POST /v1/customers/resolve",
  "GET /v1/resource",
  "POST /v1/approvals",
  "GET /v1/approvals/:id",
  "POST /v1/spend/authorize",
  "GET /v1/spend/authorizations/:id",
  "POST /v1/spend/authorizations/:id/consume",
  "POST /v1/spend/authorizations/:id/release",
]);

const SCIM_ROUTES = new Set([
  "GET /scim/v2/ServiceProviderConfig",
  "GET /scim/v2/ResourceTypes",
  "GET /scim/v2/ResourceTypes/:id",
  "GET /scim/v2/Schemas",
  "GET /scim/v2/Schemas/:id",
  "GET /scim/v2/Users",
  "POST /scim/v2/Users",
  "GET /scim/v2/Users/:id",
  "PUT /scim/v2/Users/:id",
  "PATCH /scim/v2/Users/:id",
  "DELETE /scim/v2/Users/:id",
  "GET /scim/v2/Groups",
  "POST /scim/v2/Groups",
  "GET /scim/v2/Groups/:id",
  "PUT /scim/v2/Groups/:id",
  "PATCH /scim/v2/Groups/:id",
  "DELETE /scim/v2/Groups/:id",
]);

const CLI_TOKEN_ROUTES = new Set([
  "GET /v1/cli/session",
  "DELETE /v1/cli/session",
]);

const ID = "019fce62-0000-7000-8000-00000000beef";

interface Route {
  method: string;
  url: string;
}

const signedOut = (reason: string) => ({
  isAuthenticated: false,
  status: "signed-out",
  reason,
  toAuth: () => ({ tokenType: null, userId: null }),
});

const signedIn = () => ({
  isAuthenticated: true,
  status: "signed-in",
  reason: null,
  toAuth: () => ({
    tokenType: "session_token",
    userId: "user_matrix",
    sessionId: "sess_matrix",
    sessionClaims: { sub: "user_matrix", sid: "sess_matrix" },
  }),
});

const withIds = (url: string): string => url.replace(/:[A-Za-z]+/g, ID);

const keyOf = ({ method, url }: Route): string => `${method} ${url}`;

const routes: Route[] = [];

const recordRoutes = Object.assign(
  ((app, _opts, done) => {
    app.addHook("onRoute", (options: RouteOptions) => {
      const methods = Array.isArray(options.method)
        ? options.method
        : [options.method];
      for (const method of methods) {
        if (method !== "HEAD" && method !== "OPTIONS") {
          routes.push({ method, url: options.url });
        }
      }
    });
    done();
  }) as FastifyPluginCallback,
  { [Symbol.for("skip-override")]: true },
);

let clearCachedUsers: () => void = () => {};

let inject: (
  route: Route,
  headers: Record<string, string>,
) => Promise<{ statusCode: number; body: string }>;

beforeAll(async () => {
  vi.stubEnv("RATE_LIMIT_ENABLED", "false");

  const [{ initApp }, { routes: appRoutes }, { clearUserCache }] =
    await Promise.all([
      import("@/server"),
      import("@routes/index"),
      import("@auth/user-store"),
    ]);
  clearCachedUsers = clearUserCache;
  const app = await initApp([{ plugin: recordRoutes }, ...appRoutes]);

  inject = async ({ method, url }, headers) => {
    const hasBody = method !== "GET" && method !== "DELETE";
    const response = await app.inject({
      method: method as "GET",
      url: withIds(url),
      headers: hasBody
        ? { ...headers, "content-type": "application/json" }
        : headers,
      ...(hasBody ? { payload: "{}" } : {}),
    });
    return { statusCode: response.statusCode, body: response.body };
  };
});

const protectedRoutes = () => routes.filter((r) => !PUBLIC.has(keyOf(r)));
const sessionRoutes = () =>
  protectedRoutes().filter(
    (r) =>
      !API_KEY_ROUTES.has(keyOf(r)) &&
      !CLI_TOKEN_ROUTES.has(keyOf(r)) &&
      !SCIM_ROUTES.has(keyOf(r)),
  );

describe("route inventory", () => {
  it("registers every route the audit expects, and no surprises", () => {
    const keys = routes.map(keyOf);

    expect(keys.length).toBeGreaterThanOrEqual(80);
    expect(new Set(keys).size).toBe(keys.length);

    for (const expected of [
      ...PUBLIC,
      ...API_KEY_ROUTES,
      ...CLI_TOKEN_ROUTES,
      ...SCIM_ROUTES,
    ]) {
      expect(keys).toContain(expected);
    }
    expect(
      keys.filter(
        (key) =>
          key !== "POST /me/organization/audit-streams/:id/test" &&
          !SCIM_ROUTES.has(key) &&
          /\/(admin|internal|debug|metrics|docs|v2|legacy|test)\b/.test(key),
      ),
    ).toEqual([]);
    expect(
      keys.filter((key) => /^[A-Z]+ \/scim(\/|$)/.test(key)).sort(),
    ).toEqual([...SCIM_ROUTES].sort());
    expect(
      keys.filter(
        (key) =>
          !PUBLIC.has(key) &&
          !SCIM_ROUTES.has(key) &&
          !/^[A-Z]+ \/(me|v1)(\/|$)/.test(key) &&
          !/^[A-Z]+ \/(banners|config|webhook-events)(\/|$)/.test(key),
      ),
    ).toEqual([]);
  });
});

describe("authentication matrix", () => {
  beforeEach(() => {
    authenticateRequest.mockReset();
    getUser.mockReset();
    touched.clear();
    userRow.current = null;
    clearCachedUsers();
  });

  const credentials: [string, () => void, Record<string, string>][] = [
    [
      "no credentials",
      () =>
        authenticateRequest.mockResolvedValue(
          signedOut("session-token-missing"),
        ),
      {},
    ],
    [
      "a garbage token",
      () =>
        authenticateRequest.mockResolvedValue(
          signedOut("token-invalid-signature"),
        ),
      { authorization: "Bearer not-a-jwt" },
    ],
    [
      "an expired token",
      () => authenticateRequest.mockResolvedValue(signedOut("token-expired")),
      { authorization: "Bearer eyJhbGciOiJSUzI1NiJ9.expired.sig" },
    ],
    [
      "a token Clerk throws on",
      () => authenticateRequest.mockRejectedValue(new Error("jwks down")),
      { authorization: "Bearer whatever" },
    ],
  ];

  for (const [label, arrange, headers] of credentials) {
    it(`refuses ${label} on every protected route, before any query`, async () => {
      arrange();
      const failures: string[] = [];

      for (const route of protectedRoutes()) {
        const { statusCode, body } = await inject(route, headers);
        if (statusCode !== 401) {
          failures.push(`${keyOf(route)} → ${statusCode} ${body}`);
        }
      }

      expect(failures).toEqual([]);
      expect([...touched].filter((name) => name !== "apiKey")).toEqual([]);
    });
  }

  it("does not accept a valid Clerk session on API-key routes", async () => {
    authenticateRequest.mockResolvedValue(signedIn());
    userRow.current = {
      id: ID,
      clerkUserId: "user_matrix",
      email: null,
      name: null,
      avatarUrl: null,
      banned: false,
      locked: false,
      deletedAt: null,
    };

    for (const route of routes.filter((r) => API_KEY_ROUTES.has(keyOf(r)))) {
      const { statusCode } = await inject(route, {
        authorization: "Bearer a-valid-session-token",
      });
      expect(statusCode, keyOf(route)).toBe(401);
    }
  });

  it("lets an organization the caller does not belong to reach no tenant data", async () => {
    authenticateRequest.mockResolvedValue(signedIn());
    userRow.current = {
      id: ID,
      clerkUserId: "user_matrix",
      email: null,
      name: null,
      avatarUrl: null,
      banned: false,
      locked: false,
      deletedAt: null,
    };

    const tenantModels = [
      "agent",
      "apiListing",
      "apiKey",
      "payment",
      "customer",
      "customerCoupon",
      "customerCreditEntry",
      "customerPaymentIdentity",
      "webhook",
      "wallet",
      "business",
      "complianceProfile",
      "beneficialOwner",
      "supportRequest",
      "supportMessage",
      "resourcePolicy",
      "faqItem",
      "review",
      "report",
      "auditLog",
      "organization",
      "approvalRequest",
      "spendingPolicy",
      "spendAuthorization",
      "financialAlert",
      "approvalDecision",
      "governanceSettings",
      "scimToken",
      "scimGroup",
      "scimGroupMember",
      "securitySettings",
      "$queryRaw",
    ];
    const failures: string[] = [];

    for (const route of sessionRoutes()) {
      touched.clear();
      const { statusCode, body } = await inject(route, {
        authorization: "Bearer good",
        "x-org-id": "019fce62-0000-7000-8000-00000000f00d",
      });
      const leaked = [...touched].filter((name) => tenantModels.includes(name));
      if (statusCode < 400 && leaked.length > 0) {
        failures.push(`${keyOf(route)} → ${statusCode} ${body}`);
      }
      if (leaked.length > 0) {
        failures.push(`${keyOf(route)} touched ${leaked.join(", ")}`);
      }
    }

    expect(failures).toEqual([]);
  });

  it("accepts neither a Clerk session nor an API key on SCIM routes", async () => {
    authenticateRequest.mockResolvedValue(signedIn());
    userRow.current = {
      id: ID,
      clerkUserId: "user_matrix",
      email: null,
      name: null,
      avatarUrl: null,
      banned: false,
      locked: false,
      deletedAt: null,
    };
    const scimRoutes = routes.filter((r) => SCIM_ROUTES.has(keyOf(r)));
    expect(scimRoutes).toHaveLength(SCIM_ROUTES.size);

    for (const authorization of [
      "Bearer a-valid-session-token",
      "Bearer 4mica_sk_live_abcdefghijklmnop",
      "Bearer 4mica_cli_abcdefghijklmnop",
    ]) {
      touched.clear();
      for (const route of scimRoutes) {
        const { statusCode, body } = await inject(route, { authorization });
        expect(statusCode, `${keyOf(route)} ${authorization}`).toBe(401);
        expect(JSON.parse(body).schemas).toEqual([
          "urn:ietf:params:scim:api:messages:2.0:Error",
        ]);
      }
      expect([...touched]).toEqual([]);
    }
    expect(authenticateRequest).not.toHaveBeenCalled();
  });

  it("does not accept a valid Clerk session on CLI-token routes", async () => {
    authenticateRequest.mockResolvedValue(signedIn());

    for (const route of routes.filter((r) => CLI_TOKEN_ROUTES.has(keyOf(r)))) {
      const { statusCode } = await inject(route, {
        authorization: "Bearer a-valid-session-token",
      });
      expect(statusCode, keyOf(route)).toBe(401);
    }
    expect([...touched]).toEqual([]);
  });

  it("looks a CLI token up only on the routes that opted in", async () => {
    authenticateRequest.mockResolvedValue(signedOut("token-invalid"));
    const lookedUp: string[] = [];

    for (const route of protectedRoutes()) {
      touched.clear();
      const { statusCode } = await inject(route, {
        authorization: "Bearer 4mica_cli_not-a-real-token",
      });
      expect(statusCode, keyOf(route)).toBe(401);
      if (touched.has("cliSession")) {
        lookedUp.push(keyOf(route));
      }
    }

    expect(lookedUp.sort()).toEqual([
      "DELETE /me/wallets/:id",
      "DELETE /v1/cli/session",
      "GET /me/organizations",
      "GET /me/projects",
      "GET /me/wallets",
      "GET /v1/cli/session",
      "POST /me/wallets",
      "POST /me/wallets/siwe-nonce",
    ]);
  });

  it("lets a disabled account reach no data on any session route", async () => {
    authenticateRequest.mockResolvedValue(signedIn());
    userRow.current = {
      id: ID,
      clerkUserId: "user_banned",
      email: null,
      name: null,
      avatarUrl: null,
      banned: true,
      locked: false,
      deletedAt: null,
    };

    const failures: string[] = [];

    for (const route of sessionRoutes()) {
      const { statusCode, body } = await inject(route, {
        authorization: "Bearer good",
      });
      if (statusCode !== 403 && statusCode !== 400) {
        failures.push(`${keyOf(route)} → ${statusCode} ${body}`);
      }
    }

    expect(failures).toEqual([]);
    expect([...touched].filter((name) => name !== "user")).toEqual([]);
  });
});
