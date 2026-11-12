import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  clerkFrontendApi,
  createNonce,
  sentryEndpoints,
} from "./csp";

const keyFor = (host: string, env = "test") => `pk_${env}_${btoa(`${host}$`)}`;

const directive = (policy: string, name: string): string[] =>
  policy
    .split("; ")
    .find((entry) => entry.startsWith(`${name} `))
    ?.split(" ")
    .slice(1) ?? [];

describe("clerkFrontendApi", () => {
  it("decodes the Frontend API host from a publishable key", () => {
    expect(
      clerkFrontendApi(keyFor("adapted-magpie-32.clerk.accounts.dev")),
    ).toBe("adapted-magpie-32.clerk.accounts.dev");
    expect(clerkFrontendApi(keyFor("clerk.4mica.io", "live"))).toBe(
      "clerk.4mica.io",
    );
  });

  it("rejects anything that is not a publishable key", () => {
    expect(clerkFrontendApi(undefined)).toBeNull();
    expect(clerkFrontendApi("sk_test_abc")).toBeNull();
    expect(clerkFrontendApi("pk_test_!!!")).toBeNull();
    expect(
      clerkFrontendApi(`pk_test_${btoa("evil.com; script-src *$")}`),
    ).toBeNull();
  });
});

describe("createNonce", () => {
  it("is fresh on every call", () => {
    expect(createNonce()).not.toBe(createNonce());
    expect(createNonce()).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});

describe("buildContentSecurityPolicy", () => {
  const policy = buildContentSecurityPolicy({
    nonce: "abc123",
    clerkHost: "clerk.4mica.io",
    development: false,
  });

  it("only runs scripts carrying this response's nonce", () => {
    const scripts = directive(policy, "script-src");

    expect(scripts).toContain("'nonce-abc123'");
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
  });

  it("lets Clerk load and talk to its Frontend API", () => {
    expect(directive(policy, "script-src")).toContain("https://clerk.4mica.io");
    expect(directive(policy, "connect-src")).toContain(
      "https://clerk.4mica.io",
    );
  });

  it("keeps the framing and plugin lockdown", () => {
    expect(directive(policy, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(policy, "object-src")).toEqual(["'none'"]);
    expect(directive(policy, "base-uri")).toEqual(["'self'"]);
  });

  it("allows eval only in development", () => {
    const dev = buildContentSecurityPolicy({
      nonce: "n",
      clerkHost: null,
      development: true,
    });

    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
  });
});

describe("sentryEndpoints", () => {
  const dsn = "https://abc123@o42.ingest.us.sentry.io/4507";

  it("derives the ingest origin and the CSP report endpoint from a DSN", () => {
    expect(sentryEndpoints(dsn, "prod")).toEqual({
      origin: "https://o42.ingest.us.sentry.io",
      reportUri:
        "https://o42.ingest.us.sentry.io/api/4507/security/?sentry_key=abc123&sentry_environment=prod",
    });
  });

  it("returns null for a missing or malformed DSN", () => {
    expect(sentryEndpoints(undefined)).toBeNull();
    expect(sentryEndpoints("")).toBeNull();
    expect(sentryEndpoints("not a url")).toBeNull();
    expect(sentryEndpoints("http://abc@o42.ingest.sentry.io/1")).toBeNull();
    expect(sentryEndpoints("https://o42.ingest.sentry.io/1")).toBeNull();
    expect(sentryEndpoints("https://abc@o42.ingest.sentry.io/x")).toBeNull();
  });

  it("is added to connect-src and report-uri only when configured", () => {
    const sentry = sentryEndpoints(dsn);
    const policy = buildContentSecurityPolicy({
      nonce: "n",
      clerkHost: null,
      sentry,
      development: false,
    });
    expect(directive(policy, "connect-src")).toContain(
      "https://o42.ingest.us.sentry.io",
    );
    expect(directive(policy, "report-uri")).toEqual([sentry?.reportUri]);

    const without = buildContentSecurityPolicy({
      nonce: "n",
      clerkHost: null,
      development: false,
    });
    expect(without).not.toContain("report-uri");
    expect(without).not.toContain("sentry");
  });
});
