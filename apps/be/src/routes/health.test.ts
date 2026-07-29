import { beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "../server";
import { healthRoutes } from "./health";

const { count } = vi.hoisted(() => ({ count: vi.fn() }));

vi.mock("@4mica/db", () => ({
  prisma: { agent: { count } },
  disconnect: vi.fn(async () => {}),
}));

describe("GET /health", () => {
  beforeEach(() => {
    count.mockReset();
  });

  it("reports ok and the agent count when the database responds", async () => {
    count.mockResolvedValue(3);

    const app = await initApp([{ plugin: healthRoutes }]);
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      db: "ok",
      agents: 3,
    });
    expect(typeof response.json().uptime).toBe("number");

    await app.close();
  });

  it("reports degraded with a 503 when the database is unreachable", async () => {
    count.mockRejectedValue(new Error("ECONNREFUSED"));

    const app = await initApp([{ plugin: healthRoutes }]);
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: "degraded", db: "down" });
    expect(response.json().agents).toBeUndefined();

    await app.close();
  });
});
