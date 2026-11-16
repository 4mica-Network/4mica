import { describe, expect, it } from "vitest";
import { safeExternalUrl } from "./safeUrl";

describe("safeExternalUrl", () => {
  it("keeps an https URL", () => {
    expect(safeExternalUrl("https://example.com/a?b=1")).toBe(
      "https://example.com/a?b=1",
    );
  });

  it.each([
    ["plain http", "http://example.com"],
    ["a javascript URL", "javascript:alert(1)"],
    ["a data URL", "data:text/html,<script>alert(1)</script>"],
    ["a protocol-relative URL", "//example.com"],
    ["a relative path", "/settings"],
    ["leading whitespace", " https://example.com"],
    ["an embedded control character", "https://example.com/\n"],
    ["a missing host", "https://"],
    ["an empty string", ""],
    ["null", null],
    ["undefined", undefined],
    ["a non-string", 42],
  ])("drops %s", (_label, value) => {
    expect(safeExternalUrl(value)).toBeNull();
  });
});
