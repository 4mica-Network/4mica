import { clearUserCache } from "@auth/user-store";
import { meRoutes } from "@routes/me";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";

const {
  authenticateRequest,
  getUser,
  findUnique,
  upsert,
  update,
  businessFindUnique,
  businessUpsert,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getUser: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  businessFindUnique: vi.fn(),
  businessUpsert: vi.fn(),
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
    user: { findUnique, upsert, update },
    business: { findUnique: businessFindUnique, upsert: businessUpsert },
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

const OTHER_USER_ID = "019fce62-9999-7000-8000-999999999999";

const FULL_USER = {
  id: AUTH_USER.id,
  clerkUserId: AUTH_USER.clerkUserId,
  email: AUTH_USER.email,
  name: AUTH_USER.name,
  avatarUrl: AUTH_USER.avatarUrl,
  username: "ada",
  emailVerified: true,
  phoneNumber: null,
  phoneNumberVerified: false,
  description: null,
  bio: null,
  private: true,
  hidden: false,
  verified: false,
  locked: false,
  banned: false,
  theme: "dark",
  appTheme: "dark",
  language: "en",
  timeZone: "UTC",
  privacyMode: false,
  twoFactorEnabled: false,
  defaultHome: "overview",
  disableBranding: false,
  allowCustomBrandColor: false,
  primaryBrandColor: "",
  secondaryBrandColor: "",
  allowSEOIndexing: false,
  allowNotification: true,
  allowSMS: false,
  notificationPlacement: "bottomRight",
  allowMonthlyEmails: true,
  allowInviteAcceptedEmails: true,
  allowChangelogNewsletterEmails: true,
  allowMarketingOnboardingEmails: true,
  allowPrivacyLegalEmails: true,
  allowDpaEmails: true,
  allowEmailVisibility: true,
  allowPhoneNumberVisibility: true,
  completeOnboarding: false,
  lastViewed: null,
  lastLogin: new Date("2026-08-01T00:00:00.000Z"),
  usageTime: 0,
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
};

const signedIn = () => ({
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
      email: "ada@example.com",
      name: "Ada Lovelace",
    },
  }),
});

const signedOut = () => ({
  isAuthenticated: false,
  status: "signed-out",
  reason: "session-token-missing",
  toAuth: () => ({ tokenType: null, userId: null }),
});

const AUTH = { authorization: "Bearer good" };

describe("account routes", () => {
  beforeEach(() => {
    for (const m of [
      authenticateRequest,
      getUser,
      findUnique,
      upsert,
      update,
      businessFindUnique,
      businessUpsert,
    ]) {
      m.mockReset();
    }
    clearUserCache();

    authenticateRequest.mockResolvedValue(signedIn());
    findUnique.mockResolvedValue(FULL_USER);
    upsert.mockResolvedValue(AUTH_USER);
    update.mockResolvedValue(FULL_USER);
    businessFindUnique.mockResolvedValue(null);
  });

  it("GET /me returns the user and business envelope", async () => {
    const app = await initApp([{ plugin: meRoutes }]);
    const res = await app.inject({ method: "GET", url: "/me", headers: AUTH });

    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({
      clerkUserId: "user_123",
      theme: "dark",
      notificationPlacement: "bottomRight",
    });
    expect(res.json().business).toBeNull();

    await app.close();
  });

  it("GET /me is rejected without a token", async () => {
    authenticateRequest.mockResolvedValue(signedOut());

    const app = await initApp([{ plugin: meRoutes }]);
    const res = await app.inject({ method: "GET", url: "/me" });

    expect(res.statusCode).toBe(401);
    expect(update).not.toHaveBeenCalled();

    await app.close();
  });

  it("PATCH /me/profile persists only whitelisted fields", async () => {
    const app = await initApp([{ plugin: meRoutes }]);
    const res = await app.inject({
      method: "PATCH",
      url: "/me/profile",
      headers: AUTH,
      payload: { bio: "  Builder  ", private: false, verified: true },
    });

    expect(res.statusCode).toBe(200);
    const data = update.mock.calls[0][0].data;
    expect(data).toEqual({ bio: "Builder", private: false });
    expect(data).not.toHaveProperty("verified");

    await app.close();
  });

  it("PATCH /me/profile rejects a malformed username", async () => {
    const app = await initApp([{ plugin: meRoutes }]);
    const res = await app.inject({
      method: "PATCH",
      url: "/me/profile",
      headers: AUTH,
      payload: { username: "Not Valid!" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("invalid_request");
    expect(res.json().issues[0].path).toBe("username");
    expect(update).not.toHaveBeenCalled();

    await app.close();
  });

  it("PATCH /me/profile rejects a non-hex brand colour", async () => {
    const app = await initApp([{ plugin: meRoutes }]);
    const res = await app.inject({
      method: "PATCH",
      url: "/me/profile",
      headers: AUTH,
      payload: { primaryBrandColor: "rebeccapurple" },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("PATCH /me/profile maps a unique violation to 409", async () => {
    update.mockRejectedValue(
      Object.assign(new Error("unique"), {
        code: "P2002",
        meta: { target: ["username"] },
      }),
    );

    const app = await initApp([{ plugin: meRoutes }]);
    const res = await app.inject({
      method: "PATCH",
      url: "/me/profile",
      headers: AUTH,
      payload: { username: "taken" },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().message).toContain("username");

    await app.close();
  });

  it("PATCH /me/account validates the email", async () => {
    const app = await initApp([{ plugin: meRoutes }]);
    const bad = await app.inject({
      method: "PATCH",
      url: "/me/account",
      headers: AUTH,
      payload: { email: "not-an-email" },
    });
    expect(bad.statusCode).toBe(400);

    const good = await app.inject({
      method: "PATCH",
      url: "/me/account",
      headers: AUTH,
      payload: { email: "ada@example.com", theme: "light" },
    });
    expect(good.statusCode).toBe(200);
    expect(update.mock.calls[0][0].data).toEqual({
      email: "ada@example.com",
      theme: "light",
    });

    await app.close();
  });

  it("PATCH /me/notifications accepts toggles and rejects a bad placement", async () => {
    const app = await initApp([{ plugin: meRoutes }]);

    const ok = await app.inject({
      method: "PATCH",
      url: "/me/notifications",
      headers: AUTH,
      payload: { allowSMS: true, notificationPlacement: "topLeft" },
    });
    expect(ok.statusCode).toBe(200);

    const bad = await app.inject({
      method: "PATCH",
      url: "/me/notifications",
      headers: AUTH,
      payload: { notificationPlacement: "middle" },
    });
    expect(bad.statusCode).toBe(400);

    await app.close();
  });

  it("PUT /me/business upserts and normalises country and currency", async () => {
    businessUpsert.mockResolvedValue({
      id: "b1",
      ownerId: AUTH_USER.id,
      legalName: "Acme Ltd",
      payoutCurrency: "EUR",
      country: "DE",
      kybStatus: "UNVERIFIED",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const app = await initApp([{ plugin: meRoutes }]);
    const res = await app.inject({
      method: "PUT",
      url: "/me/business",
      headers: AUTH,
      payload: { legalName: "Acme Ltd", country: "de", payoutCurrency: "eur" },
    });

    expect(res.statusCode).toBe(200);
    expect(businessUpsert.mock.calls[0][0].update).toMatchObject({
      country: "DE",
      payoutCurrency: "EUR",
    });

    await app.close();
  });

  it("PUT /me/business rejects an invalid country code", async () => {
    const app = await initApp([{ plugin: meRoutes }]);
    const res = await app.inject({
      method: "PUT",
      url: "/me/business",
      headers: AUTH,
      payload: { country: "DEU" },
    });

    expect(res.statusCode).toBe(400);
    expect(businessUpsert).not.toHaveBeenCalled();

    await app.close();
  });

  describe("authorization", () => {
    const MUTATIONS = [
      ["PATCH", "/me/profile"],
      ["PATCH", "/me/account"],
      ["PATCH", "/me/notifications"],
      ["PUT", "/me/business"],
    ] as const;

    it("always scopes writes to the token's user, never the request body", async () => {
      const app = await initApp([{ plugin: meRoutes }]);

      await app.inject({
        method: "PATCH",
        url: "/me/profile",
        headers: AUTH,
        payload: { id: OTHER_USER_ID, clerkUserId: "user_evil", bio: "hi" },
      });

      expect(update.mock.calls[0][0].where).toEqual({ id: AUTH_USER.id });
      expect(update.mock.calls[0][0].data).toEqual({ bio: "hi" });

      await app.inject({
        method: "PUT",
        url: "/me/business",
        headers: AUTH,
        payload: { ownerId: OTHER_USER_ID, legalName: "Evil Ltd" },
      });

      expect(businessUpsert.mock.calls[0][0].where).toEqual({
        ownerId: AUTH_USER.id,
      });
      expect(businessUpsert.mock.calls[0][0].create.ownerId).toBe(AUTH_USER.id);
      expect(businessUpsert.mock.calls[0][0].update).not.toHaveProperty(
        "ownerId",
      );

      await app.close();
    });

    it("refuses privilege fields even from an authenticated owner", async () => {
      const app = await initApp([{ plugin: meRoutes }]);

      await app.inject({
        method: "PATCH",
        url: "/me/profile",
        headers: AUTH,
        payload: { verified: true, banned: false, locked: false, hidden: true },
      });

      const data = update.mock.calls[0][0].data;
      expect(data).toEqual({ hidden: true });
      for (const field of ["verified", "banned", "locked"]) {
        expect(data).not.toHaveProperty(field);
      }

      await app.close();
    });

    it.each(
      MUTATIONS,
    )("%s %s is blocked for a banned account", async (method, url) => {
      findUnique.mockResolvedValue({ ...FULL_USER });
      upsert.mockResolvedValue({ ...AUTH_USER, banned: true });

      const app = await initApp([{ plugin: meRoutes }]);
      const res = await app.inject({ method, url, headers: AUTH, payload: {} });

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("account_disabled");
      expect(update).not.toHaveBeenCalled();
      expect(businessUpsert).not.toHaveBeenCalled();

      await app.close();
    });

    it("blocks a locked account", async () => {
      upsert.mockResolvedValue({ ...AUTH_USER, locked: true });

      const app = await initApp([{ plugin: meRoutes }]);
      const res = await app.inject({
        method: "PATCH",
        url: "/me/profile",
        headers: AUTH,
        payload: { bio: "x" },
      });

      expect(res.statusCode).toBe(403);
      expect(update).not.toHaveBeenCalled();

      await app.close();
    });

    it("blocks a soft-deleted account", async () => {
      upsert.mockResolvedValue({ ...AUTH_USER, deletedAt: new Date() });

      const app = await initApp([{ plugin: meRoutes }]);
      const res = await app.inject({
        method: "PATCH",
        url: "/me/profile",
        headers: AUTH,
        payload: { bio: "x" },
      });

      expect(res.statusCode).toBe(403);

      await app.close();
    });
  });

  it("every account route requires authentication", async () => {
    authenticateRequest.mockResolvedValue(signedOut());
    const app = await initApp([{ plugin: meRoutes }]);

    for (const [method, url] of [
      ["GET", "/me"],
      ["PATCH", "/me/profile"],
      ["PATCH", "/me/account"],
      ["PATCH", "/me/notifications"],
      ["GET", "/me/business"],
      ["PUT", "/me/business"],
    ] as const) {
      const res = await app.inject({ method, url, payload: {} });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }

    expect(update).not.toHaveBeenCalled();
    expect(businessUpsert).not.toHaveBeenCalled();

    await app.close();
  });
});
