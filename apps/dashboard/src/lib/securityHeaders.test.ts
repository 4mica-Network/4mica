import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildContentSecurityPolicy,
  clerkInstanceFromKey,
  renderSecurityHeaders,
} from "./securityHeaders";

const keyFor = (kind: "test" | "live", host: string) =>
  `pk_${kind}_${btoa(`${host}$`)}`;

const API = "https://api.app.4mica.io";
const live = { origin: "https://clerk.4mica.io", development: false };

describe("clerkInstanceFromKey", () => {
  it("reads the frontend API host out of the publishable key", () => {
    expect(clerkInstanceFromKey(keyFor("live", "clerk.4mica.io"))).toEqual(
      live,
    );
    expect(
      clerkInstanceFromKey(keyFor("test", "able-cat-1.clerk.accounts.dev")),
    ).toEqual({
      origin: "https://able-cat-1.clerk.accounts.dev",
      development: true,
    });
  });

  it.each([
    ["a missing key", undefined],
    ["an empty key", ""],
    ["a secret key", "sk_live_abc"],
    ["a key without the terminator", `pk_live_${btoa("clerk.4mica.io")}`],
    ["a key that smuggles a directive", keyFor("live", "a.io; script-src *")],
    ["a key that smuggles a quote", keyFor("live", 'a.io"')],
  ])("rejects %s", (_label, key) => {
    expect(() => clerkInstanceFromKey(key)).toThrow(
      /VITE_CLERK_PUBLISHABLE_KEY/,
    );
  });
});

describe("buildContentSecurityPolicy", () => {
  const csp = buildContentSecurityPolicy(API, live);
  const directive = (name: string) =>
    csp.split("; ").find((part) => part.startsWith(`${name} `));

  it("never allows inline or evaluated scripts", () => {
    expect(directive("script-src")).toBe(
      "script-src 'self' https://clerk.4mica.io https://challenges.cloudflare.com",
    );
    expect(directive("script-src")).not.toMatch(/unsafe|\*/);
  });

  it("limits connections to the app, the API and Clerk", () => {
    expect(directive("connect-src")).toBe(
      `connect-src 'self' ${API} https://clerk.4mica.io`,
    );
  });

  it("locks down framing, base, objects and forms", () => {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
  });

  it("adds Clerk telemetry only for a development instance", () => {
    const dev = buildContentSecurityPolicy(API, {
      origin: "https://able-cat-1.clerk.accounts.dev",
      development: true,
    });

    expect(dev).toContain("https://clerk-telemetry.com");
    expect(csp).not.toContain("clerk-telemetry.com");
  });
});

describe("renderSecurityHeaders", () => {
  it("emits every header as an always-on nginx directive", () => {
    const lines = renderSecurityHeaders(API, live).trimEnd().split("\n");

    expect(lines.map((line) => line.split(" ")[1])).toEqual([
      "Content-Security-Policy",
      "X-Frame-Options",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
    ]);
    for (const line of lines) {
      expect(line).toMatch(/^add_header \S+ "[^"]+" always;$/);
    }
  });
});

describe("nginx.conf", () => {
  const conf = readFileSync("nginx.conf", "utf8");
  const include = "include /etc/nginx/snippets/security-headers.conf;";

  it("re-includes the headers wherever a location sets its own", () => {
    const blocks = conf
      .slice(conf.indexOf("server {"))
      .split(/\n {2}location /)
      .slice(1);
    const withOwnHeader = blocks.filter((block) =>
      block.includes("add_header"),
    );

    expect(withOwnHeader.length).toBeGreaterThan(0);
    for (const block of withOwnHeader) {
      expect(block).toContain(include);
    }
    expect(conf.split("\n  location ")[0]).toContain(include);
  });

  it("serves the theme script as a file so no inline script is needed", () => {
    const html = readFileSync("index.html", "utf8");

    expect(html).toContain('<script src="/theme-init.js"></script>');
    expect(html).not.toMatch(/<script>[\s\S]*?<\/script>/);
  });
});
