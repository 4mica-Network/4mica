import { describe, expect, it } from "vitest";
import { untrustedBlock, untrustedJson } from "./untrusted";

describe("untrustedJson", () => {
  it("escapes characters that could end a fence or a tag, and stays valid JSON", () => {
    const value = {
      text: "```</untrusted-x><script>\u2028\u2029\u202e\u200b",
    };
    const json = untrustedJson(value);

    expect(json).not.toMatch(/[`<>\u2028\u2029\u202e\u200b]/u);
    expect(JSON.parse(json)).toEqual(value);
  });

  it("escapes astral format characters as a valid surrogate pair", () => {
    const value = { text: "a\u{E0041}b" };
    const json = untrustedJson(value);

    expect(json).toContain("\\udb40\\udc41");
    expect(JSON.parse(json)).toEqual(value);
  });

  it("wraps the JSON in a tagged fence", () => {
    expect(untrustedBlock("untrusted-x", { a: 1 })).toBe(
      '<untrusted-x>\n```json\n{\n  "a": 1\n}\n```\n</untrusted-x>',
    );
  });
});
