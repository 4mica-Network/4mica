import Fastify, { type FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clerkAuth } from "./plugin";
import type { AuthIdentity, AuthUser } from "./types";

const { authenticateRequest } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({ authenticateRequest })),
}));

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

const notSignedIn = (status: string, reason: string) => ({
  isAuthenticated: false,
  status,
  reason,
  toAuth: () => ({ tokenType: null, userId: null }),
});

const stubUser: AuthUser = {
  id: "01931b2c-0000-7000-8000-000000000000",
  clerkUserId: "user_123",
  email: null,
  name: null,
  avatarUrl: null,
};

const buildApp = async (
  loadUser = vi.fn(async (): Promise<AuthUser> => stubUser),
): Promise<{ app: FastifyInstance; loadUser: typeof loadUser }> => {
  const app = Fastify();

  await app.register(clerkAuth, {
    secretKey: "sk_test_x",
    publishableKey: "pk_test_x",
    loadUser,
  });

  app.get(
    "/protected",
    { onRequest: [app.authenticate], preHandler: [app.getUserData] },
    async (request) => ({ auth: request.auth, user: request.user }),
  );

  await app.ready();

  return { app, loadUser };
};

describe("clerkAuth", () => {
  beforeEach(() => {
    authenticateRequest.mockReset();
  });

  it("rejects a request with no Authorization header", async () => {
    authenticateRequest.mockResolvedValue(
      notSignedIn("signed-out", "session-token-missing"),
    );

    const { app, loadUser } = await buildApp();
    const response = await app.inject({ method: "GET", url: "/protected" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: "unauthorized" });
    expect(loadUser).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects an expired token", async () => {
    authenticateRequest.mockResolvedValue(
      notSignedIn("signed-out", "token-expired"),
    );

    const { app } = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer expired" },
    });

    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it("rejects a handshake rather than issuing a redirect", async () => {
    authenticateRequest.mockResolvedValue(
      notSignedIn("handshake", "session-token-without-client-uat"),
    );

    const { app } = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer handshake" },
    });

    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it("populates auth and user for a valid token", async () => {
    authenticateRequest.mockResolvedValue(signedIn());

    const { app, loadUser } = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer good" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().auth).toMatchObject({
      tokenType: "session_token",
      clerkUserId: "user_123",
      sessionId: "sess_123",
    });
    expect(response.json().user).toMatchObject({ clerkUserId: "user_123" });
    expect(loadUser).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it("maps custom profile claims onto the identity", async () => {
    authenticateRequest.mockResolvedValue(
      signedIn({
        email: "ada@example.com",
        name: "Ada Lovelace",
        image: "https://img.example.com/ada.png",
      }),
    );

    const { app, loadUser } = await buildApp();
    await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer good" },
    });

    expect(loadUser).toHaveBeenCalledWith({
      clerkUserId: "user_123",
      sessionId: "sess_123",
      email: "ada@example.com",
      name: "Ada Lovelace",
      avatarUrl: "https://img.example.com/ada.png",
    } satisfies AuthIdentity);

    await app.close();
  });

  it("uses null, not undefined, when profile claims are absent", async () => {
    authenticateRequest.mockResolvedValue(signedIn());

    const { app, loadUser } = await buildApp();
    await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer good" },
    });

    expect(loadUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: null, name: null, avatarUrl: null }),
    );

    await app.close();
  });

  it("fails closed when verification throws", async () => {
    authenticateRequest.mockRejectedValue(
      new Error("Publishable key is missing. https://dashboard.clerk.com/..."),
    );

    const { app, loadUser } = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer good" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.body).not.toContain("Publishable key");
    expect(loadUser).not.toHaveBeenCalled();

    await app.close();
  });

  it("does not leak a partial user when loadUser fails", async () => {
    authenticateRequest.mockResolvedValue(signedIn());

    const { app } = await buildApp(
      vi.fn(async (): Promise<AuthUser> => {
        throw new Error("database down");
      }),
    );

    const response = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer good" },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).not.toHaveProperty("user");

    await app.close();
  });

  it("forwards the Authorization header and restricts the accepted token", async () => {
    authenticateRequest.mockResolvedValue(signedIn());

    const { app } = await buildApp();
    await app.inject({
      method: "GET",
      url: "/protected",
      headers: { authorization: "Bearer good" },
    });

    const [webRequest, options] = authenticateRequest.mock.calls[0];

    expect(webRequest.headers.get("authorization")).toBe("Bearer good");
    expect(options).toMatchObject({ acceptsToken: "session_token" });

    await app.close();
  });
});
