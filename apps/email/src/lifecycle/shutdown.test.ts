import { emailRoutes } from "@routes/emails";
import { healthRoutes } from "@routes/health";
import { afterEach, describe, expect, it } from "vitest";
import { initApp } from "@/server";
import { resetServiceState, setServiceState } from "./state";

afterEach(() => {
  resetServiceState();
});

describe("draining", () => {
  it("refuses new sends with 503 and a retry hint once draining", async () => {
    const app = await initApp([{ plugin: emailRoutes }]);
    setServiceState("draining");

    const response = await app.inject({
      method: "POST",
      url: "/emails/welcome",
      payload: { to: "ada@4mica.io" },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: "service_unavailable",
      message: "The service is shutting down. Retry shortly.",
    });
    expect(response.headers["retry-after"]).toBeDefined();
    expect(response.headers.connection).toBe("close");

    await app.close();
  });

  it("keeps answering /health while draining so probes see the change", async () => {
    const app = await initApp([{ plugin: healthRoutes }]);
    setServiceState("closing");

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(503);
    expect(response.json().state).toBe("closing");

    await app.close();
  });
});
