import { clearUserCache } from "@auth/user-store";
import { cliRoutes } from "@routes/cli";
import { developerRoutes } from "@routes/developer";
import { walletRoutes } from "@routes/wallets";
import { hashSecret } from "@utils/secrets";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";
import { redeemDeviceRequest } from "./repository";
import { DEVICE_GRANT_TYPE } from "./schema";

type Row = Record<string, unknown>;

const { authenticateRequest, getUser, db } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getUser: vi.fn(),
  db: {
    users: [] as Record<string, unknown>[],
    requests: [] as Record<string, unknown>[],
    sessions: [] as Record<string, unknown>[],
  },
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({ authenticateRequest, users: { getUser } })),
}));

vi.mock("@4mica/db", () => {
  const matches = (row: Row, where: Row): boolean =>
    Object.entries(where).every(([key, expected]) => {
      if (key === "OR") {
        return (expected as Row[]).some((branch) => matches(row, branch));
      }
      const actual = row[key];
      if (
        expected !== null &&
        typeof expected === "object" &&
        !(expected instanceof Date)
      ) {
        const { gt, lt } = expected as { gt?: Date; lt?: Date };
        const time = (actual as Date).getTime();
        return (
          (gt === undefined || time > gt.getTime()) &&
          (lt === undefined || time < lt.getTime())
        );
      }
      return actual === expected;
    });

  const table = (rows: () => Row[], defaults: () => Row) => ({
    create: vi.fn(async ({ data }: { data: Row }) => {
      const row = {
        id: `id_${rows().length + 1}`,
        createdAt: new Date(),
        ...defaults(),
        ...data,
      };
      rows().push(row);
      return row;
    }),
    findUnique: vi.fn(
      async ({ where }: { where: Row }) =>
        rows().find((row) => matches(row, where)) ?? null,
    ),
    findFirst: vi.fn(
      async ({ where }: { where: Row }) =>
        rows().find((row) => matches(row, where)) ?? null,
    ),
    findMany: vi.fn(async ({ where }: { where: Row }) =>
      rows().filter((row) => matches(row, where)),
    ),
    update: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const row = rows().find((candidate) => matches(candidate, where));
      return row ? Object.assign(row, data) : null;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const hit = rows().filter((row) => matches(row, where));
      for (const row of hit) {
        Object.assign(row, data);
      }
      return { count: hit.length };
    }),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  });

  const userOf = (row: Row | null) =>
    row
      ? {
          ...row,
          user: db.users.find((user) => user.id === row.userId) ?? null,
        }
      : null;

  const cliDeviceRequest = table(
    () => db.requests,
    () => ({
      status: "PENDING",
      userId: null,
      lastPolledAt: null,
      consumedAt: null,
    }),
  );
  const cliSession = table(
    () => db.sessions,
    () => ({ revokedAt: null, lastUsedAt: null }),
  );

  const withUser =
    (find: (args: { where: Row }) => Promise<Row | null>) =>
    async (args: { where: Row }) =>
      userOf(await find(args));

  cliDeviceRequest.findUnique = vi.fn(withUser(cliDeviceRequest.findUnique));
  cliSession.findUnique = vi.fn(withUser(cliSession.findUnique));

  const prisma = {
    cliDeviceRequest,
    cliSession,
    membership: {
      findFirst: vi.fn(async ({ where }: { where: { userId: string } }) => ({
        role: "OWNER",
        organization: { id: `org_${where.userId}`, personal: true },
      })),
    },
    auditLog: { create: vi.fn(async () => ({ id: "audit" })) },
    user: {
      findUnique: vi.fn(
        async ({ where }: { where: Row }) =>
          db.users.find((user) => matches(user, where)) ?? null,
      ),
      upsert: vi.fn(async ({ where }: { where: Row }) =>
        db.users.find((user) => matches(user, where)),
      ),
    },
    wallet: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
    },
    apiKey: { findMany: vi.fn(async () => []) },
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: unknown) => unknown)(prisma)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  };

  return { prisma, disconnect: vi.fn(async () => {}) };
});

const USER_ID = "019fce62-0000-7000-8000-000000000000";
const SESSION_AUTH = { authorization: "Bearer clerk-session" };

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

let app: FastifyInstance;

const post = (url: string, payload: unknown, headers = {}) =>
  app.inject({ method: "POST", url, payload: payload as object, headers });

const startLogin = async () =>
  (await post("/v1/cli/device/code", { client_name: "ada-laptop" })).json() as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete: string;
    expires_in: number;
    interval: number;
  };

const poll = (deviceCode: string) =>
  post("/v1/cli/device/token", {
    grant_type: DEVICE_GRANT_TYPE,
    device_code: deviceCode,
  });

const approve = (userCode: string) =>
  post("/me/cli/device/approve", { userCode }, SESSION_AUTH);

const signIn = async (): Promise<string> => {
  const login = await startLogin();
  await approve(login.user_code);
  return (await poll(login.device_code)).json().access_token as string;
};

const asCli = (token: string) => ({ authorization: `Bearer ${token}` });

describe("cli sign-in", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    db.requests.length = 0;
    db.sessions.length = 0;
    db.users.length = 0;
    db.users.push({
      id: USER_ID,
      clerkUserId: "user_123",
      email: "ada@example.com",
      name: "Ada Lovelace",
      username: "ada",
      avatarUrl: null,
      banned: false,
      locked: false,
      deletedAt: null,
    });
    authenticateRequest.mockReset();
    authenticateRequest.mockResolvedValue(signedIn());
    clearUserCache();
    app = await initApp([
      { plugin: cliRoutes },
      { plugin: walletRoutes },
      { plugin: developerRoutes },
    ]);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await app.close();
  });

  describe("device authorization", () => {
    it("hands out a code to approve at the dashboard, and stores neither secret in the clear", async () => {
      const login = await startLogin();

      expect(login.user_code).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}-[A-Z]{4}$/);
      expect(login.verification_uri).toBe("http://app.test/cli/authorize");
      expect(login.verification_uri_complete).toBe(
        `http://app.test/cli/authorize?code=${login.user_code}`,
      );
      expect(login.interval).toBe(5);
      expect(login.expires_in).toBeGreaterThan(590);

      const [stored] = db.requests;
      expect(stored.deviceCodeHash).toBe(hashSecret(login.device_code));
      expect(JSON.stringify(stored)).not.toContain(login.device_code);
    });

    it("answers authorization_pending until someone approves", async () => {
      const login = await startLogin();
      const response = await poll(login.device_code);

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe("authorization_pending");
      expect(db.sessions).toHaveLength(0);
    });

    it("tells a client that polls too fast to slow down", async () => {
      const login = await startLogin();
      await poll(login.device_code);
      vi.advanceTimersByTime(1000);

      expect((await poll(login.device_code)).json().error).toBe("slow_down");

      vi.advanceTimersByTime(5000);
      expect((await poll(login.device_code)).json().error).toBe(
        "authorization_pending",
      );
    });

    it("issues a token once approved, exactly once", async () => {
      const login = await startLogin();
      expect((await approve(login.user_code)).statusCode).toBe(204);

      const granted = await poll(login.device_code);
      expect(granted.statusCode).toBe(200);
      expect(granted.json()).toMatchObject({
        token_type: "Bearer",
        scope: "account:read wallets:read wallets:link",
      });
      const token = granted.json().access_token as string;
      expect(token).toMatch(/^4mica_cli_/);

      const [session] = db.sessions;
      expect(session).toMatchObject({
        userId: USER_ID,
        kind: "DEVICE",
        name: "ada-laptop",
        hashedToken: hashSecret(token),
      });
      expect(JSON.stringify(session)).not.toContain(token);

      vi.advanceTimersByTime(6000);
      const replay = await poll(login.device_code);
      expect(replay.statusCode).toBe(400);
      expect(replay.json().error).toBe("invalid_grant");
      expect(db.sessions).toHaveLength(1);
    });

    it("accepts the code however the user typed it", async () => {
      const login = await startLogin();
      const typed = login.user_code.replace("-", " ").toLowerCase();

      expect((await approve(typed)).statusCode).toBe(204);
    });

    it("reports a denial to the waiting CLI", async () => {
      const login = await startLogin();
      const denied = await post(
        "/me/cli/device/deny",
        { userCode: login.user_code },
        SESSION_AUTH,
      );
      expect(denied.statusCode).toBe(204);

      expect((await poll(login.device_code)).json().error).toBe(
        "access_denied",
      );
      expect((await approve(login.user_code)).statusCode).toBe(404);
    });

    it("expires a request nobody approved in time", async () => {
      const login = await startLogin();
      vi.advanceTimersByTime(11 * 60 * 1000);

      expect((await poll(login.device_code)).json().error).toBe(
        "expired_token",
      );
      expect((await approve(login.user_code)).statusCode).toBe(404);
    });

    it("asks for only the scopes the CLI names, always with account:read", async () => {
      const login = (
        await post("/v1/cli/device/code", {
          client_name: "reader",
          scope: "wallets:read",
        })
      ).json();
      await approve(login.user_code);

      const granted = await poll(login.device_code);
      expect(granted.json().scope).toBe("account:read wallets:read");
    });

    it("refuses a scope it does not know", async () => {
      const response = await post("/v1/cli/device/code", {
        scope: "wallets:read payments:send",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe("invalid_scope");
      expect(db.requests).toHaveLength(0);
    });

    it("refuses to redeem a request that expired after it was checked", async () => {
      const login = await startLogin();
      await approve(login.user_code);
      const request = db.requests[0];
      vi.advanceTimersByTime(11 * 60 * 1000);

      const redeemed = await redeemDeviceRequest({
        id: request.id as string,
        userId: USER_ID,
        clientName: "ada-laptop",
        scopes: ["account:read"],
      });

      expect(redeemed).toBeNull();
      expect(request.consumedAt).toBeNull();
      expect(db.sessions).toHaveLength(0);
    });

    it("lets only one of two simultaneous polls through the interval", async () => {
      const login = await startLogin();
      const [first, second] = await Promise.all([
        poll(login.device_code),
        poll(login.device_code),
      ]);

      expect([first.json().error, second.json().error].sort()).toEqual([
        "authorization_pending",
        "slow_down",
      ]);
    });

    it("rejects an unknown device code and any other grant type", async () => {
      expect((await poll("nope")).json().error).toBe("invalid_grant");

      const login = await startLogin();
      const wrongGrant = await post("/v1/cli/device/token", {
        grant_type: "password",
        device_code: login.device_code,
      });
      expect(wrongGrant.json().error).toBe("unsupported_grant_type");
    });

    it("cannot be approved without a signed-in dashboard session", async () => {
      const login = await startLogin();
      authenticateRequest.mockResolvedValue(signedOut());

      expect((await approve(login.user_code)).statusCode).toBe(401);
      expect(db.requests[0].status).toBe("PENDING");
    });

    it("shows the approver which device is asking", async () => {
      const login = await startLogin();
      const shown = await app.inject({
        method: "GET",
        url: `/me/cli/device?userCode=${login.user_code}`,
        headers: SESSION_AUTH,
      });

      expect(shown.statusCode).toBe(200);
      expect(shown.json()).toMatchObject({
        userCode: login.user_code,
        clientName: "ada-laptop",
        scopes: ["account:read", "wallets:read", "wallets:link"],
      });
      expect(shown.body).not.toContain(login.device_code);

      const unknown = await app.inject({
        method: "GET",
        url: "/me/cli/device?userCode=BBBB-BBBB",
        headers: SESSION_AUTH,
      });
      expect(unknown.statusCode).toBe(404);
    });

    it("gives no token to an account disabled after approving", async () => {
      const login = await startLogin();
      await approve(login.user_code);
      db.users[0].banned = true;

      expect((await poll(login.device_code)).json().error).toBe(
        "access_denied",
      );
      expect(db.sessions).toHaveLength(0);
    });
  });

  describe("cli tokens", () => {
    it("identify the account and the session", async () => {
      const token = await signIn();
      const response = await app.inject({
        method: "GET",
        url: "/v1/cli/session",
        headers: asCli(token),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        user: { id: USER_ID, email: "ada@example.com", username: "ada" },
        session: { kind: "DEVICE", name: "ada-laptop" },
      });
      expect(response.body).not.toContain(token);
    });

    it("stop working once revoked from the dashboard", async () => {
      const token = await signIn();
      const revoked = await app.inject({
        method: "DELETE",
        url: `/me/cli/sessions/${db.sessions[0].id}`,
        headers: SESSION_AUTH,
      });
      expect(revoked.statusCode).toBe(204);

      const after = await app.inject({
        method: "GET",
        url: "/v1/cli/session",
        headers: asCli(token),
      });
      expect(after.statusCode).toBe(401);
    });

    it("revoke themselves on logout", async () => {
      const token = await signIn();
      const logout = await app.inject({
        method: "DELETE",
        url: "/v1/cli/session",
        headers: asCli(token),
      });
      expect(logout.statusCode).toBe(204);
      expect(db.sessions[0].revokedAt).toBeInstanceOf(Date);

      const again = await app.inject({
        method: "DELETE",
        url: "/v1/cli/session",
        headers: asCli(token),
      });
      expect(again.statusCode).toBe(401);
    });

    it("expire", async () => {
      const token = await signIn();
      vi.advanceTimersByTime(91 * 24 * 60 * 60 * 1000);

      const response = await app.inject({
        method: "GET",
        url: "/v1/cli/session",
        headers: asCli(token),
      });
      expect(response.statusCode).toBe(401);
    });

    it("are refused for a disabled account", async () => {
      const token = await signIn();
      db.users[0].locked = true;

      const response = await app.inject({
        method: "GET",
        url: "/v1/cli/session",
        headers: asCli(token),
      });
      expect(response.statusCode).toBe(401);
    });

    it("are refused when unknown, without a Clerk round trip", async () => {
      authenticateRequest.mockClear();
      const response = await app.inject({
        method: "GET",
        url: "/v1/cli/session",
        headers: asCli("4mica_cli_made-up"),
      });

      expect(response.statusCode).toBe(401);
      expect(authenticateRequest).not.toHaveBeenCalled();
    });

    it("open the wallet routes that opted in", async () => {
      const token = await signIn();
      authenticateRequest.mockClear();

      const response = await app.inject({
        method: "GET",
        url: "/me/wallets",
        headers: asCli(token),
      });

      expect(response.statusCode).toBe(200);
      expect(authenticateRequest).not.toHaveBeenCalled();
    });

    it("open nothing else", async () => {
      const token = await signIn();
      authenticateRequest.mockResolvedValue(signedOut());

      for (const [method, url] of [
        ["GET", "/me/api-keys"],
        ["GET", "/me/cli/sessions"],
        ["POST", "/me/cli/sessions"],
        ["POST", "/me/cli/device/approve"],
        ["POST", "/me/wallets/batch-delete"],
      ] as const) {
        const response = await app.inject({
          method,
          url,
          headers: asCli(token),
          ...(method === "POST" ? { payload: {} } : {}),
        });
        expect(response.statusCode, `${method} ${url}`).toBe(401);
      }
    });

    it("cannot unlink a wallet unless the session was given wallets:unlink", async () => {
      const token = await signIn();
      authenticateRequest.mockResolvedValue(signedOut());

      const response = await app.inject({
        method: "DELETE",
        url: "/me/wallets/019fce62-0000-7000-8000-00000000beef",
        headers: asCli(token),
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error).toBe("insufficient_scope");
    });

    it("records use at most once every few minutes", async () => {
      const token = await signIn();
      const read = () =>
        app.inject({
          method: "GET",
          url: "/v1/cli/session",
          headers: asCli(token),
        });

      await read();
      await vi.waitFor(() =>
        expect(db.sessions[0].lastUsedAt).toBeInstanceOf(Date),
      );
      const first = db.sessions[0].lastUsedAt as Date;

      vi.advanceTimersByTime(60_000);
      await read();
      await new Promise((resolve) => setImmediate(resolve));
      expect(db.sessions[0].lastUsedAt).toBe(first);

      vi.advanceTimersByTime(5 * 60_000);
      await read();
      await vi.waitFor(() => expect(db.sessions[0].lastUsedAt).not.toBe(first));
    });

    it("are never cached", async () => {
      const login = await startLogin();
      await approve(login.user_code);
      const granted = await poll(login.device_code);

      expect(granted.headers["cache-control"]).toBe("no-store");
    });

    it("are held to their scopes", async () => {
      const token = await signIn();
      db.sessions[0].scopes = ["account:read"];

      const response = await app.inject({
        method: "GET",
        url: "/me/wallets",
        headers: asCli(token),
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error).toBe("insufficient_scope");
    });

    it("cannot be used to approve another sign-in", async () => {
      const token = await signIn();
      const login = await startLogin();
      authenticateRequest.mockResolvedValue(signedOut());

      const response = await post(
        "/me/cli/device/approve",
        { userCode: login.user_code },
        asCli(token),
      );
      expect(response.statusCode).toBe(401);
      expect(db.requests[1].status).toBe("PENDING");
    });
  });

  describe("session management", () => {
    it("lists active sessions without their tokens", async () => {
      const token = await signIn();
      const response = await app.inject({
        method: "GET",
        url: "/me/cli/sessions",
        headers: SESSION_AUTH,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveLength(1);
      expect(response.json()[0]).toMatchObject({
        kind: "DEVICE",
        name: "ada-laptop",
      });
      expect(response.body).not.toContain(token);
      expect(response.body).not.toContain("hashedToken");
    });

    it("mints a read-only token for CI by default, for 90 days, and shows it once", async () => {
      const created = await post(
        "/me/cli/sessions",
        { name: "GitHub Actions" },
        SESSION_AUTH,
      );

      expect(created.statusCode).toBe(201);
      const { plaintext, session } = created.json();
      expect(plaintext).toMatch(/^4mica_cli_/);
      expect(session).toMatchObject({
        kind: "TOKEN",
        name: "GitHub Actions",
        scopes: ["account:read", "wallets:read"],
      });
      const days =
        (new Date(session.expiresAt).getTime() - Date.now()) / 86_400_000;
      expect(Math.round(days)).toBe(90);

      const unlink = await app.inject({
        method: "DELETE",
        url: "/me/wallets/019fce62-0000-7000-8000-00000000beef",
        headers: asCli(plaintext),
      });
      expect(unlink.statusCode).toBe(403);

      const usable = await app.inject({
        method: "GET",
        url: "/v1/cli/session",
        headers: asCli(plaintext),
      });
      expect(usable.statusCode).toBe(200);
    });

    it("mints a token with the permissions and lifetime chosen", async () => {
      const created = await post(
        "/me/cli/sessions",
        {
          name: "deploy",
          scopes: ["wallets:link", "wallets:unlink"],
          expiresInDays: 30,
        },
        SESSION_AUTH,
      );

      const { session } = created.json();
      expect(session.scopes).toEqual([
        "account:read",
        "wallets:link",
        "wallets:unlink",
      ]);
      const days =
        (new Date(session.expiresAt).getTime() - Date.now()) / 86_400_000;
      expect(Math.round(days)).toBe(30);
    });

    it("refuses a lifetime or permission it does not offer", async () => {
      for (const body of [
        { name: "x", expiresInDays: 3650 },
        { name: "x", scopes: ["payments:send"] },
        { name: "x", scopes: [] },
      ]) {
        const response = await post("/me/cli/sessions", body, SESSION_AUTH);
        expect(response.statusCode, JSON.stringify(body)).toBe(400);
      }
      expect(db.sessions).toHaveLength(0);
    });

    it("will not revoke another account's session", async () => {
      await signIn();
      db.sessions[0].userId = "someone-else";

      const response = await app.inject({
        method: "DELETE",
        url: `/me/cli/sessions/${db.sessions[0].id}`,
        headers: SESSION_AUTH,
      });
      expect(response.statusCode).toBe(404);
      expect(db.sessions[0].revokedAt).toBeNull();
    });
  });
});
