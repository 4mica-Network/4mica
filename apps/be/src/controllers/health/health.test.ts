import { healthRoutes } from "@routes/health";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("@4mica/db", () => ({
  prisma: { $queryRaw: queryRaw },
  disconnect: vi.fn(async () => {}),
}));

describe("GET /health", () => {
  beforeEach(() => {
    queryRaw.mockReset();
  });

  it("reports ok when the database responds, and nothing about its contents", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const app = await initApp([{ plugin: healthRoutes }]);
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      db: "ok",
    });
    expect(response.json()).not.toHaveProperty("agents");
    expect(typeof response.json().uptime).toBe("number");

    await app.close();
  });

  it("reports degraded with a 503 when the database is unreachable", async () => {
    queryRaw.mockRejectedValue(new Error("ECONNREFUSED"));

    const app = await initApp([{ plugin: healthRoutes }]);
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: "degraded", db: "down" });

    await app.close();
  });

  it("stays reachable without any credentials", async () => {
    queryRaw.mockResolvedValue([]);

    const app = await initApp([{ plugin: healthRoutes }]);
    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: {},
    });

    expect(response.statusCode).toBe(200);

    await app.close();
  });
});
