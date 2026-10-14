import type { FastifyInstance, FastifyPluginCallback } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({
    authenticateRequest: vi.fn(),
    users: { getUser: vi.fn() },
  })),
}));

vi.mock("@4mica/db", () => ({
  prisma: { $queryRaw: vi.fn(async () => [{ "?column?": 1 }]) },
  disconnect: vi.fn(async () => {}),
}));

const LEAKY =
  "Invalid `prisma.agent.update()` invocation in /app/dist/index.js:4242 — postgres://db:5432";

const prismaError = (code: string) =>
  Object.assign(new Error(`${LEAKY} (${code})`), { code });

const testRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get("/boom", async () => {
    throw new Error(LEAKY);
  });
  app.get("/unique", async () => {
    throw prismaError("P2002");
  });
  app.get("/missing", async () => {
    throw prismaError("P2025");
  });
  app.post("/echo", async (request) => request.body);
  app.get("/cached", async (_request, reply) => {
    reply.header("cache-control", "public, max-age=60");
    return { ok: true };
  });
  done();
};

describe("http hardening", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    const { initApp } = await import("@/server");
    app = await initApp([{ plugin: testRoutes }]);
  });

  afterEach(async () => {
    await app.close();
  });

  it("answers an unexpected error with a generic body and a request id", async () => {
    const response = await app.inject({ method: "GET", url: "/boom" });

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain("prisma");
    expect(response.body).not.toContain("/app/dist");
    expect(response.body).not.toContain("postgres://");

    const body = response.json();
    expect(body).toMatchObject({ error: "internal_error" });
    expect(body.requestId).toBe(response.headers["x-request-id"]);
  });

  it("maps a unique violation to 409 and a missing record to 404, without the Prisma text", async () => {
    const unique = await app.inject({ method: "GET", url: "/unique" });
    const missing = await app.inject({ method: "GET", url: "/missing" });

    expect(unique.statusCode).toBe(409);
    expect(unique.json()).toMatchObject({ error: "conflict" });
    expect(unique.body).not.toContain("prisma");

    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: "not_found" });
    expect(missing.body).not.toContain("prisma");
  });

  it("keeps framework 4xx messages, in the same envelope", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/echo",
      headers: { "content-type": "application/json" },
      payload: "{bad",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "invalid_request",
      message: expect.stringContaining("not valid JSON"),
    });
  });

  it("answers an unknown route without echoing it back", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/<script>alert(1)</script>",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "not_found" });
    expect(response.body).not.toContain("script");
  });

  it("mints its own request id and ignores the caller's", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/boom",
      headers: { "x-request-id": "attacker-chosen" },
    });

    expect(response.headers["x-request-id"]).not.toBe("attacker-chosen");
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("sets baseline security headers on every response", async () => {
    const response = await app.inject({ method: "GET", url: "/boom" });

    expect(response.headers).toMatchObject({
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
      "cache-control": "no-store",
    });
    expect(response.headers["strict-transport-security"]).toContain("max-age=");
  });

  it("leaves a route's own cache-control alone", async () => {
    const response = await app.inject({ method: "GET", url: "/cached" });

    expect(response.headers["cache-control"]).toBe("public, max-age=60");
  });

  it("does not grant credentialed CORS", async () => {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/boom",
      headers: {
        origin: "http://localhost:4173",
        "access-control-request-method": "GET",
      },
    });

    expect(response.headers["access-control-allow-credentials"]).toBe(
      undefined,
    );
  });
});
