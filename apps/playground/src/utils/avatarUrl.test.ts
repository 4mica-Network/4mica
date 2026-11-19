import { describe, expect, it } from "vitest";
import { sizedAvatarUrl } from "./avatarUrl";

describe("sizedAvatarUrl", () => {
  it("asks Clerk's image CDN for the rendered size", () => {
    expect(sizedAvatarUrl("https://img.clerk.com/abc?x=1", 192)).toBe(
      "https://img.clerk.com/abc?x=1&width=192&height=192&fit=crop",
    );
  });

  it("leaves other hosts untouched", () => {
    expect(sizedAvatarUrl("https://cdn.example.com/a.png", 96)).toBe(
      "https://cdn.example.com/a.png",
    );
  });

  it("passes through empty and unparseable values", () => {
    expect(sizedAvatarUrl(null, 96)).toBeNull();
    expect(sizedAvatarUrl("", 96)).toBeNull();
    expect(sizedAvatarUrl("/local.png", 96)).toBe("/local.png");
  });
});
