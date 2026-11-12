import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  clerkFrontendApi,
  createNonce,
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
