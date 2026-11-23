import { describe, expect, it } from "vitest";
import { routeName, sentryOriginFromDsn } from "./telemetryConfig";

describe("routeName", () => {
  it.each([
    ["/", "/"],
    ["/payments", "/payments"],
    ["/payments/disputes", "/payments/disputes"],
    ["/settings/developer/", "/settings/developer"],
    ["/customers/cus_123", "/customers/:id"],
    ["/agents/agt_123", "/agents/:id"],
    ["/agents/agt_123/advanced", "/agents/:id/advanced"],
    ["/apis/api_123", "/apis/:id"],
    ["/help/requests/req_123", "/help/requests/:id"],
  ])("names %s as %s", (pathname, expected) => {
    expect(routeName(pathname)).toBe(expected);
  });
});

describe("sentryOriginFromDsn", () => {
  it("is off without a DSN", () => {
    expect(sentryOriginFromDsn(undefined)).toBeNull();
    expect(sentryOriginFromDsn("  ")).toBeNull();
  });

  it("returns the ingest origin without the key", () => {
    expect(
      sentryOriginFromDsn("https://abc123@o42.ingest.us.sentry.io/4500000"),
    ).toBe("https://o42.ingest.us.sentry.io");
  });

  it.each([
    "not a url",
    "http://abc@o42.ingest.sentry.io/1",
    "https://o42.ingest.sentry.io/1",
  ])("rejects %s", (dsn) => {
    expect(() => sentryOriginFromDsn(dsn)).toThrow(/VITE_SENTRY_DSN/);
  });
});
