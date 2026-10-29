import { clearUserCache } from "@auth/user-store";
import { supportRoutes } from "@routes/support";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";

const {
  authenticateRequest,
  getUser,
  findUnique,
  upsert,
  supportRequest,
  supportMessage,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getUser: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  supportRequest: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  supportMessage: { create: vi.fn() },
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({ authenticateRequest, users: { getUser } })),
}));

vi.mock("@4mica/db", () => ({
  prisma: {
    user: { findUnique, upsert, update: vi.fn() },
    business: { findUnique: vi.fn(), upsert: vi.fn() },
    supportRequest,
    supportMessage,
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: unknown) => unknown)({ supportRequest, supportMessage })
        : Promise.all(arg as Promise<unknown>[]),
    ),
  },
  disconnect: vi.fn(async () => {}),
}));

const USER_ID = "019fce62-0000-7000-8000-000000000000";
const REQUEST_ID = "019fce62-3333-7000-8000-000000000000";

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

const stored = (over: Record<string, unknown> = {}) => ({
  id: REQUEST_ID,
  number: 1001,
  subject: "Payments stuck in pending",
  category: "PAYMENTS",
  priority: "HIGH",
  status: "OPEN",
  description: "Two payments have been pending for an hour.",
  reference: null,
  firstRespondedAt: null,
  resolvedAt: null,
  lastActivityAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  messages: [],
  ...over,
});

const MESSAGE = {
  id: "019fce62-4444-7000-8000-000000000000",
  author: "CUSTOMER",
  body: "Any update?",
  createdAt: new Date(),
};

describe("support routes", () => {
  beforeEach(() => {
    for (const m of [authenticateRequest, getUser, findUnique, upsert]) {
      m.mockReset();
    }
    for (const group of [supportRequest, supportMessage]) {
      for (const fn of Object.values(group)) {
        fn.mockReset();
      }
    }
    clearUserCache();

    authenticateRequest.mockResolvedValue(signedIn());
    upsert.mockResolvedValue(AUTH_USER);

    supportRequest.findMany.mockResolvedValue([stored()]);
    supportRequest.findFirst.mockResolvedValue(stored());
    supportRequest.count.mockResolvedValue(1);
    supportRequest.create.mockResolvedValue(stored());
    supportRequest.update.mockResolvedValue(stored());
    supportRequest.deleteMany.mockResolvedValue({ count: 1 });
    supportMessage.create.mockResolvedValue(MESSAGE);
  });

  it("requires authentication on every support route", async () => {
    authenticateRequest.mockResolvedValue(signedOut());
    const app = await initApp([{ plugin: supportRoutes }]);

    for (const [method, url] of [
      ["GET", "/me/support-requests"],
      ["GET", "/me/support-requests/stats"],
      ["GET", `/me/support-requests/${REQUEST_ID}`],
      ["POST", "/me/support-requests"],
      ["PATCH", `/me/support-requests/${REQUEST_ID}`],
      ["POST", `/me/support-requests/${REQUEST_ID}/messages`],
      ["DELETE", `/me/support-requests/${REQUEST_ID}`],
      ["POST", "/me/support-requests/batch-delete"],
    ] as const) {
      const res = await app.inject({ method, url, payload: {} });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }

    await app.close();
  });

  it("scopes the list to the caller and matches a #reference number", async () => {
    const app = await initApp([{ plugin: supportRoutes }]);

    const res = await app.inject({
      method: "GET",
      url: "/me/support-requests?q=%231001&status=OPEN",
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ total: 1, page: 1 });

    const where = supportRequest.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ ownerId: USER_ID, status: "OPEN" });
    expect(where.OR).toContainEqual({ number: 1001 });

    await app.close();
  });

  it("opens a request with a default priority", async () => {
    const app = await initApp([{ plugin: supportRoutes }]);

    const res = await app.inject({
      method: "POST",
      url: "/me/support-requests",
      headers: AUTH,
      payload: {
        subject: "  Payments stuck in pending ",
        category: "PAYMENTS",
        description: "Two payments have been pending for an hour.",
        reference: "",
      },
    });

    expect(res.statusCode).toBe(201);
    expect(supportRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerId: USER_ID,
          subject: "Payments stuck in pending",
          priority: "NORMAL",
          reference: null,
        }),
      }),
    );

    await app.close();
  });

  it("rejects an unknown category and a blank description", async () => {
    const app = await initApp([{ plugin: supportRoutes }]);

    const res = await app.inject({
      method: "POST",
      url: "/me/support-requests",
      headers: AUTH,
      payload: { subject: "Hi", category: "NOPE", description: "  " },
    });

    expect(res.statusCode).toBe(400);
    const paths = res.json().issues.map((i: { path: string }) => i.path);
    expect(paths).toEqual(expect.arrayContaining(["category", "description"]));
    expect(supportRequest.create).not.toHaveBeenCalled();

    await app.close();
  });

  it("returns 404 for a request the caller does not own", async () => {
    supportRequest.findFirst.mockResolvedValue(null);
    const app = await initApp([{ plugin: supportRoutes }]);

    const res = await app.inject({
      method: "GET",
      url: `/me/support-requests/${REQUEST_ID}`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(404);
    expect(supportRequest.findFirst.mock.calls[0][0].where).toEqual({
      id: REQUEST_ID,
      ownerId: USER_ID,
    });

    await app.close();
  });

  it("does not let the customer set a support-only status", async () => {
    const app = await initApp([{ plugin: supportRoutes }]);

    const res = await app.inject({
      method: "PATCH",
      url: `/me/support-requests/${REQUEST_ID}`,
      headers: AUTH,
      payload: { status: "RESOLVED" },
    });

    expect(res.statusCode).toBe(400);
    expect(supportRequest.update).not.toHaveBeenCalled();

    await app.close();
  });

  it("closes a request and stamps when it was resolved", async () => {
    const app = await initApp([{ plugin: supportRoutes }]);

    const res = await app.inject({
      method: "PATCH",
      url: `/me/support-requests/${REQUEST_ID}`,
      headers: AUTH,
      payload: { status: "CLOSED" },
    });

    expect(res.statusCode).toBe(200);
    expect(supportRequest.update.mock.calls[0][0].data).toMatchObject({
      status: "CLOSED",
      resolvedAt: expect.any(Date),
    });

    await app.close();
  });

  it("refuses edits to a closed request but allows reopening it", async () => {
    supportRequest.findFirst.mockResolvedValue(stored({ status: "CLOSED" }));
    const app = await initApp([{ plugin: supportRoutes }]);

    const edit = await app.inject({
      method: "PATCH",
      url: `/me/support-requests/${REQUEST_ID}`,
      headers: AUTH,
      payload: { subject: "New subject" },
    });
    expect(edit.statusCode).toBe(409);
    expect(edit.json().error).toBe("request_closed");

    const reopen = await app.inject({
      method: "PATCH",
      url: `/me/support-requests/${REQUEST_ID}`,
      headers: AUTH,
      payload: { status: "OPEN" },
    });
    expect(reopen.statusCode).toBe(200);
    expect(supportRequest.update.mock.calls[0][0].data).toMatchObject({
      status: "OPEN",
      resolvedAt: null,
    });

    await app.close();
  });

  it("moves a request waiting on the customer back to OPEN on reply", async () => {
    supportRequest.findFirst.mockResolvedValue(
      stored({ status: "WAITING_ON_CUSTOMER" }),
    );
    const app = await initApp([{ plugin: supportRoutes }]);

    const res = await app.inject({
      method: "POST",
      url: `/me/support-requests/${REQUEST_ID}/messages`,
      headers: AUTH,
      payload: { body: "Any update?" },
    });

    expect(res.statusCode).toBe(201);
    expect(supportMessage.create.mock.calls[0][0].data).toEqual({
      requestId: REQUEST_ID,
      author: "CUSTOMER",
      body: "Any update?",
    });
    expect(supportRequest.update.mock.calls[0][0].data).toMatchObject({
      status: "OPEN",
    });

    await app.close();
  });

  it("refuses a reply on a closed request", async () => {
    supportRequest.findFirst.mockResolvedValue(stored({ status: "CLOSED" }));
    const app = await initApp([{ plugin: supportRoutes }]);

    const res = await app.inject({
      method: "POST",
      url: `/me/support-requests/${REQUEST_ID}/messages`,
      headers: AUTH,
      payload: { body: "Hello?" },
    });

    expect(res.statusCode).toBe(409);
    expect(supportMessage.create).not.toHaveBeenCalled();

    await app.close();
  });

  it("reports counts and the median first response time", async () => {
    const created = new Date("2026-10-01T10:00:00.000Z");
    const at = (minutes: number) =>
      new Date(created.getTime() + minutes * 60_000);
    supportRequest.count
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(5);
    supportRequest.findMany.mockResolvedValue([
      { createdAt: created, firstRespondedAt: at(30) },
      { createdAt: created, firstRespondedAt: at(90) },
      { createdAt: created, firstRespondedAt: at(10) },
    ]);
    const app = await initApp([{ plugin: supportRoutes }]);

    const res = await app.inject({
      method: "GET",
      url: "/me/support-requests/stats",
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      active: 3,
      awaitingYou: 1,
      resolved: 5,
      medianFirstResponseMinutes: 30,
    });

    await app.close();
  });

  it("deletes only requests the caller owns in a batch", async () => {
    const OTHER = "019fce62-5555-7000-8000-000000000000";
    supportRequest.findMany.mockResolvedValue([{ id: REQUEST_ID }]);
    const app = await initApp([{ plugin: supportRoutes }]);

    const res = await app.inject({
      method: "POST",
      url: "/me/support-requests/batch-delete",
      headers: AUTH,
      payload: { ids: [REQUEST_ID, OTHER] },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ deleted: [REQUEST_ID], notFound: [OTHER] });
    expect(supportRequest.deleteMany.mock.calls[0][0].where).toEqual({
      id: { in: [REQUEST_ID] },
      ownerId: USER_ID,
    });

    await app.close();
  });
});
