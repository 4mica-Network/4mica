import { clearUserCache } from "@auth/user-store";
import { bannerRoutes } from "@routes/banners";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";

const {
  authenticateRequest,
  getUser,
  findUnique,
  upsert,
  banner,
  bannerInteraction,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getUser: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  banner: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  bannerInteraction: {
    upsert: vi.fn(),
  },
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({ authenticateRequest, users: { getUser } })),
}));

vi.mock("@4mica/db", () => ({
  prisma: {
    agent: { count: vi.fn() },
    user: { findUnique, upsert, update: vi.fn() },
    banner,
    bannerInteraction,
  },
  disconnect: vi.fn(async () => {}),
}));

const USER_ID = "019fce62-0000-7000-8000-000000000000";
const BANNER_ID = "019fce62-1111-7000-8000-000000000000";

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

const STORED_BANNER = {
  id: BANNER_ID,
  title: "Instant payouts",
  message: "Settle to your wallet the moment a payment clears.",
  url: "https://4mica.io",
  thumbnailUrl: null,
  videoUrl: null,
  alt: null,
  isVideo: false,
};

describe("banner routes", () => {
  beforeEach(() => {
    for (const mock of [authenticateRequest, getUser, findUnique, upsert]) {
      mock.mockReset();
    }
    for (const group of [banner, bannerInteraction]) {
      for (const fn of Object.values(group)) {
        fn.mockReset();
      }
    }
    clearUserCache();

    authenticateRequest.mockResolvedValue(signedIn());
    upsert.mockResolvedValue(AUTH_USER);
    banner.findMany.mockResolvedValue([STORED_BANNER]);
    banner.findUnique.mockResolvedValue({ id: BANNER_ID });
    bannerInteraction.upsert.mockResolvedValue({
      id: "bi_1",
      type: "VIEWED",
      count: 1,
    });
  });

  it("requires authentication on every banner route", async () => {
    authenticateRequest.mockResolvedValue(signedOut());
    const app = await initApp([{ plugin: bannerRoutes }]);

    for (const [method, url] of [
      ["GET", "/banners"],
      ["POST", `/banners/${BANNER_ID}/interactions`],
    ] as const) {
      const res = await app.inject({
        method,
        url,
        payload: { type: "VIEWED" },
      });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }

    await app.close();
  });

  it("blocks a banned account from recording an interaction", async () => {
    upsert.mockResolvedValue({ ...AUTH_USER, banned: true });
    const app = await initApp([{ plugin: bannerRoutes }]);

    const res = await app.inject({
      method: "POST",
      url: `/banners/${BANNER_ID}/interactions`,
      headers: AUTH,
      payload: { type: "VIEWED" },
    });

    expect(res.statusCode).toBe(403);
    expect(bannerInteraction.upsert).not.toHaveBeenCalled();
    await app.close();
  });

  it("filters to the live window and drops banners the caller dismissed", async () => {
    const app = await initApp([{ plugin: bannerRoutes }]);

    const res = await app.inject({
      method: "GET",
      url: "/banners",
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);

    const { where, take, orderBy } = banner.findMany.mock.calls[0][0];
    expect(where.active).toBe(true);
    expect(where.interactions).toEqual({
      none: { userId: USER_ID, type: "DISMISSED" },
    });
    expect(where.AND).toEqual([
      { OR: [{ startsAt: null }, { startsAt: { lte: expect.any(Date) } }] },
      { OR: [{ endsAt: null }, { endsAt: { gte: expect.any(Date) } }] },
    ]);
    expect(orderBy).toEqual([{ priority: "desc" }, { createdAt: "desc" }]);
    expect(take).toBe(5);

    await app.close();
  });

  it("strips scheduling columns from the response", async () => {
    banner.findMany.mockResolvedValue([
      { ...STORED_BANNER, priority: 10, active: true, endsAt: new Date() },
    ]);
    const app = await initApp([{ plugin: bannerRoutes }]);

    const res = await app.inject({
      method: "GET",
      url: "/banners",
      headers: AUTH,
    });

    const [first] = res.json();
    expect(first.id).toBe(BANNER_ID);
    expect(first).not.toHaveProperty("priority");
    expect(first).not.toHaveProperty("active");
    expect(first).not.toHaveProperty("endsAt");

    await app.close();
  });

  it("upserts an interaction keyed on banner, user and type", async () => {
    const app = await initApp([{ plugin: bannerRoutes }]);

    const res = await app.inject({
      method: "POST",
      url: `/banners/${BANNER_ID}/interactions`,
      headers: AUTH,
      payload: { type: "DISMISSED" },
    });

    expect(res.statusCode).toBe(204);
    expect(bannerInteraction.upsert.mock.calls[0][0]).toMatchObject({
      where: {
        bannerId_userId_type: {
          bannerId: BANNER_ID,
          userId: USER_ID,
          type: "DISMISSED",
        },
      },
      create: { bannerId: BANNER_ID, userId: USER_ID, type: "DISMISSED" },
      update: { count: { increment: 1 } },
    });

    await app.close();
  });

  it("404s for a banner that does not exist", async () => {
    banner.findUnique.mockResolvedValue(null);
    const app = await initApp([{ plugin: bannerRoutes }]);

    const res = await app.inject({
      method: "POST",
      url: `/banners/${BANNER_ID}/interactions`,
      headers: AUTH,
      payload: { type: "VIEWED" },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("not_found");
    expect(bannerInteraction.upsert).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects an unknown interaction type", async () => {
    const app = await initApp([{ plugin: bannerRoutes }]);

    const res = await app.inject({
      method: "POST",
      url: `/banners/${BANNER_ID}/interactions`,
      headers: AUTH,
      payload: { type: "HOVERED" },
    });

    expect(res.statusCode).toBe(400);
    expect(bannerInteraction.upsert).not.toHaveBeenCalled();

    await app.close();
  });
});
