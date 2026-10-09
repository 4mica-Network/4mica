import { describe, expect, it } from "vitest";
import { isProfileRenderable } from "./profile";

const visible = {
  username: "alice",
  banned: false,
  hidden: false,
  private: false,
};

describe("isProfileRenderable", () => {
  it("renders a public profile with a username", () => {
    expect(isProfileRenderable(visible)).toBe(true);
    expect(isProfileRenderable({ ...visible, deletedAt: null })).toBe(true);
  });

  it("hides missing, unnamed, gated or deleted profiles", () => {
    expect(isProfileRenderable(null)).toBe(false);
    expect(isProfileRenderable({ ...visible, username: null })).toBe(false);
    expect(isProfileRenderable({ ...visible, banned: true })).toBe(false);
    expect(isProfileRenderable({ ...visible, hidden: true })).toBe(false);
    expect(isProfileRenderable({ ...visible, private: true })).toBe(false);
    expect(isProfileRenderable({ ...visible, deletedAt: new Date() })).toBe(
      false,
    );
  });
});
