import { describe, expect, it } from "vitest";
import { DEFAULT_REDIRECT, safeRedirectPath } from "@/utils/redirect";

describe("safeRedirectPath", () => {
  it("keeps a same-origin path, including query and hash", () => {
    expect(safeRedirectPath("/mo4mica")).toBe("/mo4mica");
    expect(safeRedirectPath("/mo4mica/api/atlas-research")).toBe(
      "/mo4mica/api/atlas-research",
    );
    expect(safeRedirectPath("/mo4mica?tab=apis#pricing")).toBe(
      "/mo4mica?tab=apis#pricing",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(safeRedirectPath("  /mo4mica  ")).toBe("/mo4mica");
  });

  it.each([
    ["//evil.com", "protocol-relative"],
    ["///evil.com", "triple-slash"],
    ["/\\evil.com", "backslash-escaped"],
    ["/\\/evil.com", "mixed slash and backslash"],
  ])("rejects %j (%s)", (input) => {
    expect(safeRedirectPath(input)).toBe(DEFAULT_REDIRECT);
  });

  it.each([
    ["https://evil.com", "absolute https"],
    ["http://evil.com", "absolute http"],
    ["javascript:alert(1)", "javascript scheme"],
    ["data:text/html,<script>", "data scheme"],
    ["mo4mica", "bare relative"],
    ["../etc/passwd", "traversal"],
    ["", "empty"],
  ])("rejects %j (%s)", (input) => {
    expect(safeRedirectPath(input)).toBe(DEFAULT_REDIRECT);
  });

  it("rejects control characters a browser would strip before resolving", () => {
    expect(safeRedirectPath("/\tjavascript:alert(1)")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("/\n/evil.com")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("/\r/evil.com")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("/\u0000evil")).toBe(DEFAULT_REDIRECT);
  });

  it("rejects non-string input", () => {
    expect(safeRedirectPath(null)).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath(undefined)).toBe(DEFAULT_REDIRECT);
  });
});
