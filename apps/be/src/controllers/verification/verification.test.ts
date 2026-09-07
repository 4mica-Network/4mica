import { clearUserCache } from "@auth/user-store";
import { verificationRoutes } from "@routes/verification";
import { hashSecret } from "@services/secrets";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";

const {
  authenticateRequest,
  getUser,
  findUnique,
  upsert,
  update,
  tokenFindUnique,
  tokenCreate,
  tokenDeleteMany,
  tokenUpdate,
  transaction,
  sendAccountVerification,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getUser: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  tokenFindUnique: vi.fn(),
  tokenCreate: vi.fn(),
  tokenDeleteMany: vi.fn(),
  tokenUpdate: vi.fn(),
  transaction: vi.fn(),
  sendAccountVerification: vi.fn(),
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
    emailVerificationToken: {
      findUnique: tokenFindUnique,
      create: tokenCreate,
      deleteMany: tokenDeleteMany,
      update: tokenUpdate,
    },
    $transaction: transaction,
  },
  disconnect: vi.fn(async () => {}),
}));

vi.mock("@services/email", () => ({
  getEmailClient: () => ({ sendAccountVerification }),
  resetEmailClient: vi.fn(),
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

const PROFILE = {
  ...AUTH_USER,
  username: "ada",
  emailVerified: false,
  phoneNumber: null,
  phoneNumberVerified: false,
  verified: false,
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

const app = () => initApp([{ plugin: verificationRoutes }]);

const tokenRow = (overrides: Record<string, unknown> = {}) => ({
  id: "tok_1",
  email: "ada@example.com",
  expiresAt: new Date(Date.now() + 60_000),
  consumedAt: null,
  user: { id: AUTH_USER.id, email: "ada@example.com" },
  ...overrides,
});

describe("verification routes", () => {
  beforeEach(() => {
    for (const m of [
      authenticateRequest,
      getUser,
      findUnique,
      upsert,
      update,
      tokenFindUnique,
      tokenCreate,
      tokenDeleteMany,
      tokenUpdate,
      transaction,
      sendAccountVerification,
    ]) {
      m.mockReset();
    }
    clearUserCache();

    authenticateRequest.mockResolvedValue(signedIn());
    findUnique.mockResolvedValue(PROFILE);
    upsert.mockResolvedValue(AUTH_USER);
    transaction.mockResolvedValue([]);
    sendAccountVerification.mockResolvedValue({
      id: "msg_1",
      templateId: "account-verification",
    });
  });

  describe("POST /me/email/verification", () => {
    it("mints a token and emails a link to the account address", async () => {
      const instance = await app();
      const res = await instance.inject({
        method: "POST",
        url: "/me/email/verification",
        headers: AUTH,
      });

      expect(res.statusCode).toBe(202);
      expect(res.json()).toEqual({ sent: true });

      const payload = sendAccountVerification.mock.calls[0][0];
      expect(payload.to).toBe("ada@example.com");
      expect(payload.userName).toBe("Ada Lovelace");
      expect(payload.expiresInHours).toBe(24);
      expect(payload.verifyUrl).toMatch(
        /^http:\/\/api\.test\/verify-email\?token=4mica_ev_/,
      );

      const created = tokenCreate.mock.calls[0][0].data;
      const sentToken = new URL(payload.verifyUrl).searchParams.get("token");
      expect(created.tokenHash).toBe(hashSecret(sentToken as string));
      expect(created.tokenHash).not.toBe(sentToken);
      expect(created.email).toBe("ada@example.com");

      await instance.close();
    });

    it("drops any outstanding token so only one link is ever live", async () => {
      const instance = await app();
      await instance.inject({
        method: "POST",
        url: "/me/email/verification",
        headers: AUTH,
      });

      expect(tokenDeleteMany).toHaveBeenCalledWith({
        where: { userId: AUTH_USER.id, consumedAt: null },
      });

      await instance.close();
    });

    it("lets an empty name fall through to the template's default", async () => {
      findUnique.mockResolvedValue({ ...PROFILE, name: "" });
      upsert.mockResolvedValue({ ...AUTH_USER, name: "" });

      const instance = await app();
      await instance.inject({
        method: "POST",
        url: "/me/email/verification",
        headers: AUTH,
      });

      expect(sendAccountVerification.mock.calls[0][0].userName).toBeUndefined();

      await instance.close();
    });

    it("refuses when the address is already verified", async () => {
      findUnique.mockResolvedValue({ ...PROFILE, emailVerified: true });

      const instance = await app();
      const res = await instance.inject({
        method: "POST",
        url: "/me/email/verification",
        headers: AUTH,
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("already_verified");
      expect(sendAccountVerification).not.toHaveBeenCalled();

      await instance.close();
    });

    it("refuses when the account has no address", async () => {
      findUnique.mockResolvedValue({ ...PROFILE, email: null });
      upsert.mockResolvedValue({ ...AUTH_USER, email: null });

      const instance = await app();
      const res = await instance.inject({
        method: "POST",
        url: "/me/email/verification",
        headers: AUTH,
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("email_missing");
      expect(tokenCreate).not.toHaveBeenCalled();

      await instance.close();
    });

    it("reports a failed send rather than claiming one", async () => {
      sendAccountVerification.mockResolvedValue(null);

      const instance = await app();
      const res = await instance.inject({
        method: "POST",
        url: "/me/email/verification",
        headers: AUTH,
      });

      expect(res.statusCode).toBe(502);
      expect(res.json().error).toBe("email_send_failed");

      await instance.close();
    });

    it("requires authentication", async () => {
      authenticateRequest.mockResolvedValue(signedOut());

      const instance = await app();
      const res = await instance.inject({
        method: "POST",
        url: "/me/email/verification",
      });

      expect(res.statusCode).toBe(401);
      expect(tokenCreate).not.toHaveBeenCalled();

      await instance.close();
    });
  });

  describe("GET /verify-email", () => {
    const follow = async (query: string) => {
      const instance = await app();
      const res = await instance.inject({
        method: "GET",
        url: `/verify-email${query}`,
      });
      await instance.close();
      return res;
    };

    it("verifies the account and sends the browser back to the dashboard", async () => {
      tokenFindUnique.mockResolvedValue(tokenRow());

      const res = await follow("?token=4mica_ev_good");

      expect(res.statusCode).toBe(303);
      expect(res.headers.location).toBe(
        "http://app.test/settings/profile?verify=success",
      );

      expect(tokenFindUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tokenHash: hashSecret("4mica_ev_good") },
        }),
      );
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: AUTH_USER.id },
          data: { emailVerified: true },
        }),
      );
      expect(tokenUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "tok_1" } }),
      );
    });

    it("needs no session — the token is the credential", async () => {
      authenticateRequest.mockResolvedValue(signedOut());
      tokenFindUnique.mockResolvedValue(tokenRow());

      const res = await follow("?token=4mica_ev_good");

      expect(res.statusCode).toBe(303);
      expect(res.headers.location).toContain("verify=success");
    });

    it("reports an expired link without spending it", async () => {
      tokenFindUnique.mockResolvedValue(
        tokenRow({ expiresAt: new Date(Date.now() - 1_000) }),
      );

      const res = await follow("?token=4mica_ev_old");

      expect(res.headers.location).toBe(
        "http://app.test/settings/profile?verify=expired",
      );
      expect(update).not.toHaveBeenCalled();
    });

    it("rejects an unknown token", async () => {
      tokenFindUnique.mockResolvedValue(null);

      const res = await follow("?token=4mica_ev_nope");

      expect(res.headers.location).toBe(
        "http://app.test/settings/profile?verify=invalid",
      );
      expect(update).not.toHaveBeenCalled();
    });

    it("rejects a token that was already spent", async () => {
      tokenFindUnique.mockResolvedValue(
        tokenRow({ consumedAt: new Date("2026-09-01T00:00:00.000Z") }),
      );

      const res = await follow("?token=4mica_ev_used");

      expect(res.headers.location).toContain("verify=invalid");
      expect(update).not.toHaveBeenCalled();
    });

    it("rejects a token minted for an address the user has since changed", async () => {
      tokenFindUnique.mockResolvedValue(
        tokenRow({
          email: "old@example.com",
          user: { id: AUTH_USER.id, email: "new@example.com" },
        }),
      );

      const res = await follow("?token=4mica_ev_stale");

      expect(res.headers.location).toContain("verify=invalid");
      expect(update).not.toHaveBeenCalled();
    });

    it("redirects rather than 400s when the token is missing", async () => {
      const res = await follow("");

      expect(res.statusCode).toBe(303);
      expect(res.headers.location).toContain("verify=invalid");
      expect(tokenFindUnique).not.toHaveBeenCalled();
    });
  });
});
