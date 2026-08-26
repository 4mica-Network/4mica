import { describe, expect, it } from "vitest";
import {
  blacklistedUsernames,
  isBlacklistedUsername,
  isReservedSegment,
  isValidUsername,
  reservedSegments,
  usernameUnavailableReason,
} from "./index";

describe("blacklistedUsernames", () => {
  // A blacklist entry that cannot match USERNAME_PATTERN is dead weight: no
  // input can ever equal it, so it silently protects nothing. The source list
  // this was seeded from contained "home depot", which a space made unmatchable.
  it("only contains entries a user could actually type", () => {
    const unmatchable = [...blacklistedUsernames.keys()].filter(
      (name) => !isValidUsername(name),
    );

    expect(unmatchable).toEqual([]);
  });

  it("gives every entry a non-empty reason", () => {
    const unexplained = [...blacklistedUsernames.entries()]
      .filter(([, reason]) => reason.trim() === "")
      .map(([name]) => name);

    expect(unexplained).toEqual([]);
  });

  it("matches case-insensitively, as handles normalise to lowercase", () => {
    expect(isBlacklistedUsername("ADMIN")).toBe(true);
    expect(isBlacklistedUsername("Google")).toBe(true);
  });

  it("leaves ordinary handles alone", () => {
    expect(isBlacklistedUsername("ada")).toBe(false);
    expect(isBlacklistedUsername("user-a1b2c3d4")).toBe(false);
  });
});

describe("usernameUnavailableReason", () => {
  it("reports a marketing route as reserved", () => {
    expect(usernameUnavailableReason("pricing")).toBe("reserved");
  });

  it("reports a non-route blacklist entry as blacklisted", () => {
    expect(usernameUnavailableReason("google")).toBe("blacklisted");
    expect(usernameUnavailableReason("admin")).toBe("blacklisted");
  });

  // Both sets deliberately overlap. Reserved is the more specific answer, and
  // pinning the precedence keeps the dashboard's message stable if a route is
  // later added or removed for a name the blacklist also covers.
  it("prefers reserved over blacklisted when a name is in both", () => {
    const inBoth = [...blacklistedUsernames.keys()].filter((name) =>
      reservedSegments.has(name),
    );

    expect(inBoth.length).toBeGreaterThan(0);

    for (const name of inBoth) {
      expect(usernameUnavailableReason(name)).toBe("reserved");
    }
  });

  it("returns null for a claimable handle", () => {
    expect(usernameUnavailableReason("ada")).toBeNull();
  });

  // The generated-handle minter in apps/be relies on this: `user-` plus
  // Crockford base32 is outside both sets by construction, so first-login
  // account creation can never collide with the policy.
  it("never blocks a generated handle", () => {
    expect(usernameUnavailableReason("user-0123abcd")).toBeNull();
  });
});

describe("reservedSegments", () => {
  it("covers every marketing route", () => {
    for (const segment of ["about", "pricing", "blog", "terms", "docs"]) {
      expect(isReservedSegment(segment)).toBe(true);
    }
  });
});
