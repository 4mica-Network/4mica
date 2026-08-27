import { generateUsername } from "@services/username";
import { describe, expect, it } from "vitest";

// Mirrors apps/be/src/controllers/me/schema.ts, which the playground's
// src/schema/params.ts copies verbatim. A generated handle has to satisfy the
// same rule the user would be held to.
const USERNAME_PATTERN = /^[a-z0-9_-]+$/;

const SAMPLES = Array.from({ length: 1000 }, () => generateUsername());

describe("generateUsername", () => {
  it("produces a prefixed base32 handle", () => {
    for (const handle of SAMPLES) {
      expect(handle).toMatch(/^user-[0-9abcdefghjkmnpqrstvwxyz]{8}$/);
    }
  });

  it("satisfies the username rule the API enforces", () => {
    for (const handle of SAMPLES) {
      expect(handle).toMatch(USERNAME_PATTERN);
      expect(handle.length).toBeGreaterThanOrEqual(3);
      expect(handle.length).toBeLessThanOrEqual(64);
    }
  });

  // `reservedSegments` in packages/url owns every path the marketing site
  // serves, and nothing in it is prefixed. The prefix is what keeps a generated
  // handle out of that namespace, so it is the thing worth pinning down.
  it("always carries the prefix that keeps it out of the reserved namespace", () => {
    for (const handle of SAMPLES) {
      expect(handle.startsWith("user-")).toBe(true);
    }
  });

  it("does not repeat itself", () => {
    expect(new Set(SAMPLES).size).toBe(SAMPLES.length);
  });
});
