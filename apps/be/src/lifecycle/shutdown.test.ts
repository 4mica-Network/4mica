import type { FastifyPluginCallback } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { healthRoutes } from "../routes/health";
import { initApp } from "../server";
import { resetServiceState, setServiceState } from "./state";

const { count } = vi.hoisted(() => ({ count: vi.fn() }));

vi.mock("@4mica/db", () => ({
  prisma: { agent: { count } },
  disconnect: vi.fn(async () => {}),
}));

const echoRoutes: FastifyPluginCallback = (app, _opts, done) => {
  app.get("/echo", async () => ({ ok: true }));
  done();
};

describe("draining", () => {
  beforeEach(() => {
    count.mockReset();
    count.mockResolvedValue(1);
  });

  afterEach(() => {
    resetServiceState();
  });

  it("serves normally while ready", async () => {
    const app = await initApp([
      { plugin: healthRoutes },
      { plugin: echoRoutes },
    ]);

    const health = await app.inject({ method: "GET", url: "/health" });
    const echo = await app.inject({ method: "GET", url: "/echo" });

    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ status: "ok", state: "ready" });
    expect(echo.statusCode).toBe(200);

    await app.close();
  });

  it("refuses new requests with a retryable 503 once draining", async () => {
    const app = await initApp([{ plugin: echoRoutes }]);

    setServiceState("draining");

    const response = await app.inject({ method: "GET", url: "/echo" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: "service_unavailable" });
    expect(response.headers["retry-after"]).toBeDefined();
    expect(response.headers.connection).toBe("close");

    await app.close();
  });

  it("reports draining on /health without touching the database", async () => {
    const app = await initApp([{ plugin: healthRoutes }]);

    setServiceState("draining");

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: "draining",
      state: "draining",
      db: "unknown",
    });
    expect(count).not.toHaveBeenCalled();

    await app.close();
  });

  it("keeps reporting draining while closing", async () => {
    const app = await initApp([{ plugin: healthRoutes }]);

    setServiceState("closing");

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: "draining",
      state: "closing",
    });

    await app.close();
  });

  it("disconnects the database when the app closes", async () => {
    const { disconnect } = await import("@4mica/db");
    const app = await initApp([{ plugin: healthRoutes }]);

    await app.close();

    expect(disconnect).toHaveBeenCalled();
  });
});
