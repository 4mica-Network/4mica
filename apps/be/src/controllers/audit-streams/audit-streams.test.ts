import { clearUserCache } from "@auth/user-store";
import { auditStreamRoutes } from "@routes/audit-streams";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";
import { ORG_ID } from "@/test-support/tenancy";
import { streamSecret } from "./delivery";

const { authenticateRequest, db, lookup, signing, claims } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  lookup: vi.fn(),
  signing: { signingKey: "k".repeat(32) as string | undefined },
  claims: { fva: [1, -1] as number[] | undefined },
  db: {
    membership: { findFirst: vi.fn() },
    user: { findUnique: vi.fn(), upsert: vi.fn() },
    auditLog: { create: vi.fn(), findFirst: vi.fn() },
    auditStream: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    securitySettings: { findUnique: vi.fn() },
    ssoConnection: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));
const https = await vi.hoisted(async () =>
  (await import("@/test-support/https-request")).fakeHttps(),
);

vi.mock("node:https", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:https")>();
  return {
    ...actual,
    request: https.request,
    default: { ...actual, request: https.request },
  };
});

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({
    authenticateRequest,
    users: { getUser: vi.fn() },
  })),
}));

vi.mock("@4mica/db", () => ({ prisma: db, disconnect: vi.fn(async () => {}) }));

vi.mock("node:dns/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:dns/promises")>();
  return { ...actual, lookup, default: { ...actual, lookup } };
});

vi.mock("@config/index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@config/index")>();
  return { ...actual, config: { ...actual.config, auditStreams: signing } };
});

const STREAM_ID = "019fce62-0000-7000-8000-0000000000aa";
const HEADERS = { authorization: "Bearer good", "x-org-id": ORG_ID };
const URL_OK = "https://siem.example.com/ingest";

const streamRow = (over: Record<string, unknown> = {}) => ({
  id: STREAM_ID,
  organizationId: ORG_ID,
  name: "SIEM",
  url: URL_OK,
  status: "ACTIVE",
  secretVersion: 1,
  actionPrefixes: [],
  lastDeliveryAt: null,
  lastStatusCode: null,
  lastError: null,
  consecutiveFailures: 0,
  nextAttemptAt: null,
  createdAt: new Date("2026-11-01T00:00:00Z"),
  ...over,
});

const actAs = (role: string) =>
  db.membership.findFirst.mockResolvedValue({
    role,
    suspendedAt: null,
    customRole: null,
    organization: { id: ORG_ID, personal: false },
  });

const call = async (method: string, url: string, payload?: unknown) => {
  const app = await initApp([{ plugin: auditStreamRoutes }]);
  const res = await app.inject({
    method: method as "GET",
    url,
    headers: HEADERS,
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
  await app.close();
  return res;
};

describe("audit stream routes", () => {
  beforeEach(() => {
    for (const group of Object.values(db)) {
      if (typeof group === "function") {
        (group as ReturnType<typeof vi.fn>).mockReset();
        continue;
      }
      for (const fn of Object.values(group)) {
        fn.mockReset();
      }
    }
    clearUserCache();
    signing.signingKey = "k".repeat(32);
    claims.fva = [1, -1];
    authenticateRequest.mockResolvedValue({
      isAuthenticated: true,
      status: "signed-in",
      reason: null,
      toAuth: () => ({
        tokenType: "session_token",
        userId: "user_123",
        sessionId: "sess_123",
        sessionClaims: {
          sub: "user_123",
          sid: "sess_123",
          ...(claims.fva ? { fva: claims.fva } : {}),
        },
      }),
    });
    db.user.upsert.mockResolvedValue({
      id: "019fce62-0000-7000-8000-000000000000",
      clerkUserId: "user_123",
      email: "ada@example.com",
      name: "Ada",
      avatarUrl: null,
      banned: false,
      locked: false,
      deletedAt: null,
    });
    db.auditLog.create.mockResolvedValue({ id: "audit" });
    db.securitySettings.findUnique.mockResolvedValue(null);
    db.ssoConnection.findMany.mockResolvedValue([]);
    db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) =>
      fn(db),
    );
    db.auditStream.count.mockResolvedValue(0);
    db.auditStream.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) =>
        streamRow({ ...data, id: STREAM_ID }),
    );
    db.auditStream.findFirst.mockResolvedValue(streamRow());
    db.auditStream.updateMany.mockResolvedValue({ count: 1 });
    db.auditLog.findFirst.mockResolvedValue({ id: "latest-audit-id" });
    lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    https.reset();
    actAs("OWNER");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("answers 503 when no signing key is configured", async () => {
    signing.signingKey = undefined;

    const res = await call("POST", "/me/organization/audit-streams", {
      name: "SIEM",
      url: URL_OK,
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("streaming_unavailable");
    expect(db.auditStream.create).not.toHaveBeenCalled();
  });

  it("creates a stream from the latest audit row and shows the derived secret once", async () => {
    const res = await call("POST", "/me/organization/audit-streams", {
      name: "SIEM",
      url: URL_OK,
      actionPrefixes: ["Member.", "role."],
    });

    expect(res.statusCode).toBe(201);
    const secret = streamSecret("k".repeat(32), STREAM_ID, 1);
    expect(res.json()).toMatchObject({
      secret,
      stream: {
        id: STREAM_ID,
        status: "ACTIVE",
        secretPrefix: secret.slice(0, 6),
        actionPrefixes: ["member.", "role."],
      },
    });
    expect(db.auditLog.findFirst.mock.calls[0][0]).toMatchObject({
      where: { organizationId: ORG_ID },
      orderBy: { id: "desc" },
    });
    expect(db.auditStream.create.mock.calls[0][0].data).toMatchObject({
      cursorId: "latest-audit-id",
      organizationId: ORG_ID,
    });
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe(
      "audit_stream.created",
    );
  });

  it("starts from the backfill date when asked", async () => {
    const from = new Date(Date.now() - 7 * 86_400_000).toISOString();

    await call("POST", "/me/organization/audit-streams", {
      name: "SIEM",
      url: URL_OK,
      backfillFrom: from,
    });

    expect(db.auditLog.findFirst.mock.calls[0][0].where).toEqual({
      organizationId: ORG_ID,
      createdAt: { lt: new Date(from) },
    });
  });

  it("refuses a backfill older than 90 days", async () => {
    const res = await call("POST", "/me/organization/audit-streams", {
      name: "SIEM",
      url: URL_OK,
      backfillFrom: new Date(Date.now() - 100 * 86_400_000).toISOString(),
    });

    expect(res.statusCode).toBe(400);
  });

  it("refuses a URL that resolves to a private address", async () => {
    lookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);

    const res = await call("POST", "/me/organization/audit-streams", {
      name: "SIEM",
      url: URL_OK,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0]).toMatchObject({ path: "url" });
    expect(db.auditStream.create).not.toHaveBeenCalled();
  });

  it.each([
    "http://siem.example.com/ingest",
    "https://169.254.169.254/latest",
    "https://localhost/ingest",
    "https://user:pass@siem.example.com/ingest",
    "https://token@siem.example.com/ingest",
  ])("refuses %s", async (url) => {
    const res = await call("POST", "/me/organization/audit-streams", {
      name: "SIEM",
      url,
    });

    expect(res.statusCode).toBe(400);
    expect(db.auditStream.create).not.toHaveBeenCalled();
  });

  it("needs a recent sign-in to create", async () => {
    claims.fva = [90, -1];

    const res = await call("POST", "/me/organization/audit-streams", {
      name: "SIEM",
      url: URL_OK,
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("reauth_required");
  });

  it("is managed by owners only", async () => {
    actAs("ADMIN");

    const res = await call("POST", "/me/organization/audit-streams", {
      name: "SIEM",
      url: URL_OK,
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().permission).toBe("security.manage");
  });

  it("lets audit readers list streams without exposing secrets", async () => {
    actAs("ADMIN");
    db.auditStream.findMany.mockResolvedValue([streamRow()]);

    const res = await call("GET", "/me/organization/audit-streams");

    expect(res.statusCode).toBe(200);
    expect(res.json().items[0]).not.toHaveProperty("secret");
    expect(res.json().items[0].secretPrefix).toHaveLength(6);
  });

  it("sends one synthetic, signed event on test", async () => {
    const res = await call(
      "POST",
      `/me/organization/audit-streams/${STREAM_ID}/test`,
    );

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ delivered: true, statusCode: 200 });
    expect(https.request).toHaveBeenCalledOnce();
    const [sent] = https.requests;
    const body = JSON.parse(sent?.body as string);
    expect(body.events).toHaveLength(1);
    expect(body.events[0]).toMatchObject({
      action: "audit_stream.test",
      targetId: STREAM_ID,
    });
    expect(sent?.headers["x-4mica-signature"]).toMatch(
      /^t=\d+,v1=[0-9a-f]{64}$/,
    );
  });

  it("reports a redirect on test as not delivered", async () => {
    https.state.status = 301;

    const res = await call(
      "POST",
      `/me/organization/audit-streams/${STREAM_ID}/test`,
    );

    expect(res.json()).toMatchObject({ delivered: false, statusCode: 301 });
  });

  it("rotates the secret to the next version", async () => {
    db.auditStream.findFirst.mockResolvedValue(streamRow({ secretVersion: 2 }));

    const res = await call(
      "POST",
      `/me/organization/audit-streams/${STREAM_ID}/rotate-secret`,
    );

    expect(res.statusCode).toBe(200);
    expect(db.auditStream.updateMany.mock.calls[0][0].data).toEqual({
      secretVersion: { increment: 1 },
    });
    expect(res.json().secret).toBe(streamSecret("k".repeat(32), STREAM_ID, 2));
  });

  it("resumes a paused stream", async () => {
    const res = await call(
      "POST",
      `/me/organization/audit-streams/${STREAM_ID}/resume`,
    );

    expect(res.statusCode).toBe(200);
    expect(db.auditStream.updateMany.mock.calls[0][0]).toMatchObject({
      where: { organizationId: ORG_ID, deletedAt: null, id: STREAM_ID },
      data: {
        status: "ACTIVE",
        consecutiveFailures: 0,
        nextAttemptAt: expect.any(Date),
      },
    });
  });

  it("pauses a stream and refuses any other status", async () => {
    const paused = await call(
      "PATCH",
      `/me/organization/audit-streams/${STREAM_ID}`,
      { status: "PAUSED" },
    );

    expect(paused.statusCode).toBe(200);
    expect(db.auditStream.updateMany.mock.calls[0][0]).toMatchObject({
      where: { organizationId: ORG_ID, deletedAt: null, id: STREAM_ID },
      data: { status: "PAUSED" },
    });

    const active = await call(
      "PATCH",
      `/me/organization/audit-streams/${STREAM_ID}`,
      { status: "ACTIVE" },
    );
    expect(active.statusCode).toBe(400);
  });

  it("refuses to change the URL to one carrying credentials", async () => {
    const res = await call(
      "PATCH",
      `/me/organization/audit-streams/${STREAM_ID}`,
      { url: "https://user:pass@siem.example.com/ingest" },
    );

    expect(res.statusCode).toBe(400);
    expect(res.json().issues[0]).toMatchObject({ path: "url" });
    expect(db.auditStream.updateMany).not.toHaveBeenCalled();
  });

  it("answers 404 for another organization's stream", async () => {
    db.auditStream.updateMany.mockResolvedValue({ count: 0 });

    const res = await call(
      "DELETE",
      `/me/organization/audit-streams/${STREAM_ID}`,
    );

    expect(res.statusCode).toBe(404);
  });
});
