import { describe, expect, it } from "vitest";
import { parseEnv } from "./index";

const VALID: NodeJS.ProcessEnv = {
  NODE_ENV: "development",
  HOST: "0.0.0.0",
  PORT: "4100",
  LOG_LEVEL: "info",
  LOG_DIR: "logs",
  RESEND_API_KEY: "re_test_key",
  EMAIL_DRY_RUN: "false",
  EMAIL_FROM_NAME: "4Mica",
  EMAIL_FROM_ADDRESS: "no-reply@4mica.io",
  EMAIL_REPLY_TO: "support@4mica.io",
  SHUTDOWN_DRAIN_MS: "5000",
  SHUTDOWN_TIMEOUT_MS: "20000",
  RATE_LIMIT_ENABLED: "true",
  RATE_LIMIT_WINDOW_MS: "60000",
  RATE_LIMIT_IP_MAX: "300",
};

describe("parseEnv", () => {
  it("parses a complete environment and coerces numerics", () => {
    const env = parseEnv(VALID);

    expect(env.PORT).toBe(4100);
    expect(env.SHUTDOWN_DRAIN_MS).toBe(5000);
    expect(env.EMAIL_DRY_RUN).toBe("false");
  });

  it("defaults to a dry run outside production, so no key is needed", () => {
    const env = parseEnv({ NODE_ENV: "development" });

    expect(env.EMAIL_DRY_RUN).toBe("true");
    expect(env.PORT).toBe(4100);
    expect(env.RESEND_API_KEY).toBe("");
  });

  it("refuses to boot live without a Resend key", () => {
    expect(() => parseEnv({ ...VALID, RESEND_API_KEY: "" })).toThrow(
      /RESEND_API_KEY/,
    );
  });

  it("refuses a Resend key that is not a real key", () => {
    expect(() => parseEnv({ ...VALID, RESEND_API_KEY: "sk_wrong" })).toThrow(
      /must start with re_/,
    );
  });

  it("allows an empty key while dry-running", () => {
    const env = parseEnv({
      ...VALID,
      RESEND_API_KEY: "",
      EMAIL_DRY_RUN: "true",
    });

    expect(env.EMAIL_DRY_RUN).toBe("true");
  });

  it("rejects a drain window that is not shorter than the hard timeout", () => {
    expect(() => parseEnv({ ...VALID, SHUTDOWN_DRAIN_MS: "20000" })).toThrow(
      /SHUTDOWN_DRAIN_MS/,
    );
  });

  it("rejects a malformed sender address", () => {
    expect(() =>
      parseEnv({ ...VALID, EMAIL_FROM_ADDRESS: "not-an-address" }),
    ).toThrow(/EMAIL_FROM_ADDRESS/);
  });

  it("rejects an out-of-range port", () => {
    expect(() => parseEnv({ ...VALID, PORT: "0" })).toThrow(/PORT/);
  });

  it("disables rate limiting under NODE_ENV=test by default", () => {
    expect(parseEnv({ NODE_ENV: "test" }).RATE_LIMIT_ENABLED).toBe("false");
  });
});
