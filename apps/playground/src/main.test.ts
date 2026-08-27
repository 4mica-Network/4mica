import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isReservedSegment, reservedSegments } from "@4mica/url";
import { describe, expect, it } from "vitest";
import { parseEnv, parsePublicEnv } from "@/env";
import { parseIdOrSlug, parseUsername } from "@/schema/params";
// The pure rules module, not @/services/profile — that one imports server-only,
// Prisma and Clerk, none of which belong in a unit test.
import { isProfileRenderable, toPublicProfile } from "@/services/profile-rules";
import { safeBrandColor } from "@/utils/brandColor";

const VALID_ENV = {
  DATABASE_URL: "postgresql://u:p@127.0.0.1:5433/db?schema=public",
  CLERK_SECRET_KEY: "sk_test_abc",
} as NodeJS.ProcessEnv;

describe("env contract", () => {
  it("rejects a missing DATABASE_URL by name", () => {
    expect(() => parseEnv({} as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
  });

  it("rejects a non-postgres DATABASE_URL", () => {
    expect(() =>
      parseEnv({ ...VALID_ENV, DATABASE_URL: "mysql://u:p@host/db" }),
    ).toThrow(/postgres/);
  });

  it("rejects a Clerk secret that is not sk_-prefixed", () => {
    expect(() =>
      parseEnv({ ...VALID_ENV, CLERK_SECRET_KEY: "pk_test_oops" }),
    ).toThrow(/sk_/);
  });

  it("defaults PORT and LOG_DIR", () => {
    const env = parseEnv(VALID_ENV);
    expect(env.PORT).toBe(3100);
    expect(env.LOG_DIR).toBe("logs");
    expect(env.NODE_ENV).toBe("development");
  });

  it("rejects a secret key placed in the publishable slot", () => {
    expect(() =>
      parsePublicEnv({ NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "sk_test_leak" }),
    ).toThrow(/must start with pk_/);
  });

  it("defaults the app URL to the base URL", () => {
    const env = parsePublicEnv({
      NEXT_PUBLIC_BASE_URL: "https://example.test",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_abc",
    });
    expect(env.NEXT_PUBLIC_APP_URL).toBe("https://example.test");
  });
});

describe("username param parsing", () => {
  it("accepts a plain handle", () => {
    expect(parseUsername("mo")).toBe("mo"); // two characters is the floor
    expect(parseUsername("mo-4mica")).toBe("mo-4mica");
    expect(parseUsername("4mica_workspace")).toBe("4mica_workspace");
  });

  it("lowercases", () => {
    expect(parseUsername("MO4mica")).toBe("mo4mica");
  });

  it("strips a legacy @ prefix", () => {
    expect(parseUsername("@4mica-workspace")).toBe("4mica-workspace");
    expect(parseUsername("@MO4mica")).toBe("mo4mica");
  });

  it.each([
    ["a", "shorter than 2"],
    ["a".repeat(65), "longer than 64"],
    ["a b", "contains a space"],
    ["../etc/passwd", "path traversal"],
    ["mo?x=1", "query injection"],
    ["Mo%2F..", "encoded traversal"],
    ["mo.4mica", "contains a dot"],
    ["mo/agents", "contains a slash"],
    ["", "empty"],
  ])("rejects %j (%s)", (input) => {
    expect(parseUsername(input)).toBeNull();
  });

  it("rejects non-string input", () => {
    expect(parseUsername(undefined)).toBeNull();
    expect(parseUsername(null)).toBeNull();
    expect(parseUsername({ toString: () => "mo4mica" })).toBeNull();
  });

  it("parses ids and slugs with the same character class", () => {
    expect(parseIdOrSlug("atlas-research")).toBe("atlas-research");
    expect(parseIdOrSlug("../secrets")).toBeNull();
  });
});

describe("isProfileRenderable", () => {
  const base = {
    username: "mo4mica",
    private: false,
    hidden: false,
    banned: false,
    deletedAt: null as Date | null,
  };

  it("accepts a fully published profile", () => {
    expect(isProfileRenderable(base)).toBe(true);
  });

  it("rejects a profile with no handle", () => {
    expect(isProfileRenderable({ ...base, username: null })).toBe(false);
  });

  it("rejects a brand-new user, because User.private defaults to true", () => {
    // Regression guard for the biggest product gotcha in this feature: a fresh
    // account is NOT publicly visible until it opts in.
    expect(isProfileRenderable({ ...base, private: true })).toBe(false);
  });

  it("requires every flag to be clear", () => {
    const flags = ["private", "hidden", "banned"] as const;

    for (const flag of flags) {
      expect(isProfileRenderable({ ...base, [flag]: true })).toBe(false);
    }

    expect(isProfileRenderable({ ...base, deletedAt: new Date() })).toBe(false);
  });

  it("covers every combination of the four gate flags", () => {
    for (let mask = 0; mask < 16; mask++) {
      const row = {
        ...base,
        private: Boolean(mask & 1),
        hidden: Boolean(mask & 2),
        banned: Boolean(mask & 4),
        deletedAt: mask & 8 ? new Date() : null,
      };

      // Only the all-clear combination may render.
      expect(isProfileRenderable(row)).toBe(mask === 0);
    }
  });
});

describe("toPublicProfile", () => {
  const row = {
    id: "user_1",
    username: "mo4mica",
    name: "Mo",
    bio: "Builder",
    description: null,
    avatarUrl: null,
    verified: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    private: false,
    hidden: false,
    banned: false,
    deletedAt: null as Date | null,
    allowSEOIndexing: true,
    allowEmailVisibility: true,
    allowPhoneNumberVisibility: true,
    email: "mo@4mica.io",
    phoneNumber: "+15550100",
    allowCustomBrandColor: true,
    primaryBrandColor: "#7bcbff",
    secondaryBrandColor: "#48c9b0",
    disableBranding: false,
  };

  it("honours the contact visibility flags", () => {
    const hidden = toPublicProfile(
      {
        ...row,
        allowEmailVisibility: false,
        allowPhoneNumberVisibility: false,
      },
      { isOwner: false },
    );

    expect(hidden.email).toBeNull();
    expect(hidden.phoneNumber).toBeNull();
  });

  it("never emits a gate flag or an internal id", () => {
    const dto = toPublicProfile(row, { isOwner: false });
    const leaked = [
      "private",
      "hidden",
      "banned",
      "deletedAt",
      "clerkUserId",
      "id",
      "allowEmailVisibility",
      "allowPhoneNumberVisibility",
      "allowCustomBrandColor",
    ];

    for (const key of leaked) {
      expect(Object.keys(dto)).not.toContain(key);
    }
  });

  it("drops brand colours unless the flag is on", () => {
    const dto = toPublicProfile(
      { ...row, allowCustomBrandColor: false },
      { isOwner: false },
    );

    expect(dto.primaryBrandColor).toBeNull();
    expect(dto.secondaryBrandColor).toBeNull();
  });

  it("re-validates brand colours even when the flag is on", () => {
    const dto = toPublicProfile(
      { ...row, primaryBrandColor: "javascript:alert(1)" },
      { isOwner: false },
    );

    expect(dto.primaryBrandColor).toBeNull();
    // The valid sibling still comes through.
    expect(dto.secondaryBrandColor).toBe("#48c9b0");
  });

  it("marks an unpublished profile so the owner preview can warn", () => {
    const dto = toPublicProfile({ ...row, private: true }, { isOwner: true });

    expect(dto.isOwner).toBe(true);
    expect(dto.isPublished).toBe(false);
  });
});

describe("safeBrandColor", () => {
  it.each(["#fff", "#7bcbff", "#ABCDEF"])("accepts %s", (value) => {
    expect(safeBrandColor(value, true)).toBe(value);
  });

  it.each([
    "javascript:alert(1)",
    "red",
    "#12",
    "#1234567",
    "rgb(0,0,0)",
    "expression(alert(1))",
    "",
  ])("rejects %j", (value) => {
    expect(safeBrandColor(value, true)).toBeNull();
  });

  it("returns null when the flag is off regardless of validity", () => {
    expect(safeBrandColor("#fff", false)).toBeNull();
  });
});

describe("reserved segments vs nginx", () => {
  const nginxConf = readFileSync(
    fileURLToPath(new URL("../nginx.conf", import.meta.url)),
    "utf8",
  );

  it("covers the apps/web routes that share this apex domain", () => {
    for (const segment of ["blog", "pricing", "about", "team", "terms"]) {
      expect(reservedSegments.has(segment)).toBe(true);
    }
  });

  it("is case-insensitive", () => {
    expect(isReservedSegment("Blog")).toBe(true);
    expect(isReservedSegment("mo4mica")).toBe(false);
  });

  /**
   * The co-tenancy regression guard.
   *
   * Handles are bare, so apps/web and this app share one namespace. If someone
   * adds a marketing route to packages/url without adding it to nginx.conf,
   * that path silently becomes a claimable handle in production. This fails
   * the build instead.
   */
  it("has an nginx rule for every reserved segment", () => {
    const missing = [...reservedSegments].filter(
      (segment) => !nginxConf.includes(segment),
    );

    expect(missing).toEqual([]);
  });

  /**
   * The other half of the same guard, from the filesystem instead of nginx.
   *
   * The test above catches a reserved segment with no proxy rule. This one
   * catches the reverse and more likely mistake: someone adds a page under
   * apps/web/app and never touches packages/url, so `4mica.io/<that page>`
   * stays in the handle namespace and the first person to claim it shadows a
   * live marketing route.
   *
   * Asserted one direction only. `routes` reserves several segments that have
   * no page yet (agents, interactive-protocol, leadership, register, roadmap);
   * those are harmless and should stay reserved.
   */
  it("reserves every top-level route in apps/web", () => {
    const webApp = fileURLToPath(new URL("../../web/app", import.meta.url));

    // `(home)` and `(site)` are route groups — parentheses mean they add no
    // path segment, so the real routes are one level further down.
    const segmentsIn = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
        .flatMap((entry) =>
          entry.name.startsWith("(")
            ? segmentsIn(`${dir}/${entry.name}`)
            : // Dynamic segments like [slug] are never a top-level route.
              entry.name.startsWith("[")
              ? []
              : [entry.name],
        );

    const unreserved = segmentsIn(webApp).filter(
      (segment) => !reservedSegments.has(segment),
    );

    expect(unreserved).toEqual([]);
  });

  it.each([
    "sign-in",
    "sign-up",
    "sso-callback",
  ])("proxies /%s to the playground", (segment) => {
    // `[^;]*mica_playground` rather than a literal URL: the edge proxies via
    // `proxy_pass $mica_playground` (a `set` variable plus Docker's resolver)
    // so upstream DNS is re-read per request instead of pinned at startup.
    // What matters here is that the route targets the playground at all.
    const rule = new RegExp(
      `location \\^~ /${segment}\\s+{[^}]*proxy_pass [^;]*mica_playground;`,
    );

    expect(nginxConf).toMatch(rule);
    expect(nginxConf).not.toMatch(
      new RegExp(`\\|${segment}\\||\\(${segment}\\||\\|${segment}\\)`),
    );
  });
});
