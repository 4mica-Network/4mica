import { describe, expect, it } from "vitest";
import { isPublicHostname } from "./public-host";

describe("isPublicHostname", () => {
  it.each([
    "api.example.com",
    "hooks.stripe.com",
    "example.co.uk.",
  ])("accepts %s", (host) => {
    expect(isPublicHostname(host)).toBe(true);
  });

  it.each([
    "localhost",
    "app.localhost",
    "printer.local",
    "db.internal",
    "intranet",
    "127.0.0.1",
    "10.0.0.5",
    "169.254.169.254",
    "[::1]",
    "[fd00::1]",
    "",
  ])("rejects %s", (host) => {
    expect(isPublicHostname(host)).toBe(false);
  });
});
