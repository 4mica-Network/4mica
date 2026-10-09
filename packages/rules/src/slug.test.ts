import { describe, expect, it } from "vitest";
import { isValidSlug, SLUG_MAX_LENGTH, slugify } from "./slug";

describe("isValidSlug", () => {
  it("accepts lowercase handles", () => {
    expect(isValidSlug("weather-api")).toBe(true);
  });

  it("rejects empty, too long, uppercase and uuid-shaped slugs", () => {
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("a".repeat(SLUG_MAX_LENGTH + 1))).toBe(false);
    expect(isValidSlug("Weather")).toBe(false);
    expect(isValidSlug("0f8fad5b-d9cb-469f-a165-70867728950e")).toBe(false);
  });
});

describe("slugify", () => {
  it("folds accents and punctuation into hyphens", () => {
    expect(slugify("Crédit Limits API!")).toBe("credit-limits-api");
  });

  it("trims to the max length without a trailing hyphen", () => {
    const slug = slugify(`${"a".repeat(63)} b`);
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(slug.endsWith("-")).toBe(false);
  });
});
