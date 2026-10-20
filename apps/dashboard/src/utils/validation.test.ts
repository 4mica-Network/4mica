import { describe, expect, it } from "vitest";
import { hasErrors, isEmail } from "./validation";

describe("client validation", () => {
  it("checks emails", () => {
    expect(isEmail("a@b.co")).toBe(true);
    expect(isEmail("not-an-email")).toBe(false);
  });

  it("reports whether any field has an error", () => {
    expect(hasErrors({ a: undefined })).toBe(false);
    expect(hasErrors({ a: undefined, b: "bad" })).toBe(true);
  });
});
