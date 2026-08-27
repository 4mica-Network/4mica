import { templateIds } from "@4mica/email-client";
import { resetServiceState, setServiceState } from "@lifecycle/index";
import { afterEach, describe, expect, it } from "vitest";
import { initApp } from "@/server";
import { healthRoutes } from "./health";

afterEach(() => {
  resetServiceState();
});

describe("GET /health", () => {
  it("reports ok and the number of registered templates while ready", async () => {
    const app = await initApp([{ plugin: healthRoutes }]);

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "ok",
      state: "ready",
      templates: templateIds.length,
      dryRun: true,
    });

    await app.close();
  });

  it("answers 503 as soon as the instance starts draining", async () => {
    const app = await initApp([{ plugin: healthRoutes }]);
    setServiceState("draining");

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: "draining",
      state: "draining",
    });

    await app.close();
  });
});
