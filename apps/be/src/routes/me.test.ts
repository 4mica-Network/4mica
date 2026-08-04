import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearUserCache } from "../auth/user-store";
import { initApp } from "../server";
import { meRoutes } from "./me";

const { authenticateRequest, getUser, findUnique, upsert } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getUser: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({
    authenticateRequest,
    users: { getUser },
  })),
}));

vi.mock("@4mica/db", () => ({
  prisma: {
    agent: { count: vi.fn() },
    user: { findUnique, upsert },
  },
  disconnect: vi.fn(async () => {}),
}));

const STORED_USER = {
  id: "01931b2c-0000-7000-8000-000000000000",
  clerkUserId: "user_123",
  email: "ada@example.com",
  name: "Ada Lovelace",
  avatarUrl: "https://img.example.com/ada.png",
};

const signedIn = (claims: Record<string, unknown> = {}) => ({
  isAuthenticated: true,
  status: "signed-in",
  reason: null,
  toAuth: () => ({
    tokenType: "session_token",
    userId: "user_123",
    sessionId: "sess_123",
    sessionClaims: { sub: "user_123", sid: "sess_123", ...claims },
  }),
});

const FULL_CLAIMS = {
  email: "ada@example.com",
  name: "Ada Lovelace",
  image: "https://img.example.com/ada.png",
};

describe("GET /me", () => {
  beforeEach(() => {
    authenticateRequest.mockReset();
    getUser.mockReset();
    findUnique.mockReset();
    upsert.mockReset();
    clearUserCache();

    findUnique.mockResolvedValue(STORED_USER);
    upsert.mockResolvedValue(STORED_USER);
  });

  it("rejects an unauthenticated request without touching the database", async () => {
    authenticateRequest.mockResolvedValue({
      isAuthenticated: false,
      status: "signed-out",
      reason: "session-token-missing",
      toAuth: () => ({ tokenType: null, userId: null }),
    });

    const app = await initApp([{ plugin: meRoutes }]);
    const response = await app.inject({ method: "GET", url: "/me" });

    expect(response.statusCode).toBe(401);
    expect(upsert).not.toHaveBeenCalled();

    await app.close();
  });

  it("returns the stored user for a valid session", async () => {
    authenticateRequest.mockResolvedValue(signedIn(FULL_CLAIMS));

    const app = await initApp([{ plugin: meRoutes }]);
    const response = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: "Bearer good" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      clerkUserId: "user_123",
      email: "ada@example.com",
    });

    await app.close();
  });

  it("upserts on clerkUserId and refreshes lastSeenAt", async () => {
    authenticateRequest.mockResolvedValue(signedIn(FULL_CLAIMS));

    const app = await initApp([{ plugin: meRoutes }]);
    await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: "Bearer good" },
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { clerkUserId: "user_123" },
        create: expect.objectContaining({
          clerkUserId: "user_123",
          email: "ada@example.com",
          name: "Ada Lovelace",
          avatarUrl: "https://img.example.com/ada.png",
        }),
        update: expect.objectContaining({
          email: "ada@example.com",
          lastSeenAt: expect.any(Date),
        }),
      }),
    );

    await app.close();
  });

  it("writes once for repeated requests inside the cache window", async () => {
    authenticateRequest.mockResolvedValue(signedIn(FULL_CLAIMS));

    const app = await initApp([{ plugin: meRoutes }]);

    for (let i = 0; i < 3; i += 1) {
      await app.inject({
        method: "GET",
        url: "/me",
        headers: { authorization: "Bearer good" },
      });
    }

    expect(upsert).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it("does not null out stored profile data when claims are absent", async () => {
    authenticateRequest.mockResolvedValue(signedIn());

    const app = await initApp([{ plugin: meRoutes }]);
    await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: "Bearer good" },
    });

    const { update } = upsert.mock.calls[0][0];

    expect(update).not.toHaveProperty("email");
    expect(update).not.toHaveProperty("name");
    expect(update).not.toHaveProperty("avatarUrl");
    expect(update.lastSeenAt).toBeInstanceOf(Date);

    await app.close();
  });

  it("backfills the profile from Clerk when creating a user with no claims", async () => {
    authenticateRequest.mockResolvedValue(signedIn());
    findUnique.mockResolvedValue(null);
    getUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: "ada@example.com" },
      emailAddresses: [{ emailAddress: "ada@example.com" }],
      fullName: "Ada Lovelace",
      imageUrl: "https://img.example.com/ada.png",
    });

    const app = await initApp([{ plugin: meRoutes }]);
    await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: "Bearer good" },
    });

    expect(getUser).toHaveBeenCalledWith("user_123");
    expect(upsert.mock.calls[0][0].create).toMatchObject({
      email: "ada@example.com",
      name: "Ada Lovelace",
      avatarUrl: "https://img.example.com/ada.png",
    });

    await app.close();
  });

  it("does not call the Clerk API when the user already exists", async () => {
    authenticateRequest.mockResolvedValue(signedIn());

    const app = await initApp([{ plugin: meRoutes }]);
    await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: "Bearer good" },
    });

    expect(getUser).not.toHaveBeenCalled();

    await app.close();
  });
});
