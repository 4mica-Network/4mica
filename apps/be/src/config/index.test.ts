import { afterEach, describe, expect, it, vi } from "vitest";
import { parseEnv } from "./index";

const VALID: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test",
  CLERK_PUBLISHABLE_KEY: "pk_test_abc",
  CLERK_SECRET_KEY: "sk_test_abc",
};

describe("parseEnv", () => {
  it("names the offending key when a Clerk secret is missing", () => {
    expect(() => parseEnv({ ...VALID, CLERK_SECRET_KEY: undefined })).toThrow(
      /CLERK_SECRET_KEY/,
    );
  });

  it("rejects a secret key that is not a Clerk secret key", () => {
    expect(() =>
      parseEnv({ ...VALID, CLERK_SECRET_KEY: "pk_test_abc" }),
    ).toThrow(/must start with sk_/);
  });

  it("rejects a publishable key that is not a Clerk publishable key", () => {
    expect(() =>
      parseEnv({ ...VALID, CLERK_PUBLISHABLE_KEY: "sk_test_abc" }),
    ).toThrow(/must start with pk_/);
  });

  it("names the offending key when the publishable key is missing", () => {
    expect(() =>
      parseEnv({ ...VALID, CLERK_PUBLISHABLE_KEY: undefined }),
    ).toThrow(/CLERK_PUBLISHABLE_KEY/);
  });

  it("treats the optional Clerk variables as empty by default", () => {
    const env = parseEnv(VALID);

    expect(env.CLERK_JWT_KEY).toBe("");
    expect(env.CLERK_AUTHORIZED_PARTIES).toBe("");
  });

  it("defaults the shutdown and rate-limit knobs", () => {
    const env = parseEnv(VALID);

    expect(env.SHUTDOWN_DRAIN_MS).toBe(5000);
    expect(env.SHUTDOWN_TIMEOUT_MS).toBe(20000);
    expect(env.RATE_LIMIT_WINDOW_MS).toBe(60000);
    expect(env.RATE_LIMIT_IP_MAX).toBe(300);
    expect(env.RATE_LIMIT_USER_MAX).toBe(120);
    expect(env.RATE_LIMIT_SENSITIVE_MAX).toBe(10);
  });

  it("turns rate limiting off under NODE_ENV=test but on elsewhere", () => {
    expect(parseEnv(VALID).RATE_LIMIT_ENABLED).toBe("false");
    expect(
      parseEnv({ ...VALID, NODE_ENV: "production" }).RATE_LIMIT_ENABLED,
    ).toBe("true");
    expect(
      parseEnv({ ...VALID, RATE_LIMIT_ENABLED: "true" }).RATE_LIMIT_ENABLED,
    ).toBe("true");
  });

  it("rejects a drain window that outlasts the shutdown deadline", () => {
    expect(() =>
      parseEnv({
        ...VALID,
        SHUTDOWN_DRAIN_MS: "30000",
        SHUTDOWN_TIMEOUT_MS: "20000",
      }),
    ).toThrow(/SHUTDOWN_DRAIN_MS: must be less than SHUTDOWN_TIMEOUT_MS/);
  });

  it("rejects a non-numeric rate limit", () => {
    expect(() => parseEnv({ ...VALID, RATE_LIMIT_IP_MAX: "many" })).toThrow(
      /RATE_LIMIT_IP_MAX must be numeric/,
    );
  });
});

describe("config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("unescapes the PEM newlines that dotenv flattens", async () => {
    vi.stubEnv(
      "CLERK_JWT_KEY",
      "-----BEGIN PUBLIC KEY-----\\nMIIB\\n-----END-----",
    );
    vi.resetModules();

    const { config } = await import("./index");

    expect(config.clerkJwtKey).toBe(
      "-----BEGIN PUBLIC KEY-----\nMIIB\n-----END-----",
    );
  });

  it("leaves the jwt key undefined when unset", async () => {
    vi.stubEnv("CLERK_JWT_KEY", "");
    vi.resetModules();

    const { config } = await import("./index");

    expect(config.clerkJwtKey).toBeUndefined();
  });

  it("splits, trims and filters the authorized parties", async () => {
    vi.stubEnv(
      "CLERK_AUTHORIZED_PARTIES",
      " http://localhost:4173 , https://app.4mica.io ,",
    );
    vi.resetModules();

    const { config } = await import("./index");

    expect(config.clerkAuthorizedParties).toEqual([
      "http://localhost:4173",
      "https://app.4mica.io",
    ]);
  });
});
