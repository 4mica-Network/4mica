import { describe, expect, it } from "vitest";
import {
  hasErrors,
  isEmail,
  isHttpsUrl,
  isPhoneNumber,
  isSingleLine,
  isWebUrl,
} from "./validation";

describe("client validation mirrors the API", () => {
  it("accepts only http(s) URLs without spaces", () => {
    expect(isWebUrl("https://x.example/a")).toBe(true);
    expect(isWebUrl("http://x.example")).toBe(true);
    expect(isWebUrl("javascript:alert(1)")).toBe(false);
    expect(isWebUrl("https://x.example/a b")).toBe(false);
  });

  it("requires https where the API does", () => {
    expect(isHttpsUrl("http://x.example")).toBe(false);
    expect(isHttpsUrl("https://x.example")).toBe(true);
  });

  it("checks emails, phones and single lines", () => {
    expect(isEmail("a@b.co")).toBe(true);
    expect(isEmail("not-an-email")).toBe(false);
    expect(isPhoneNumber("+1 (555) 010-0000")).toBe(true);
    expect(isPhoneNumber("call me")).toBe(false);
    expect(isSingleLine("one line")).toBe(true);
    expect(isSingleLine("two\nlines")).toBe(false);
  });

  it("reports whether any field has an error", () => {
    expect(hasErrors({ a: undefined })).toBe(false);
    expect(hasErrors({ a: undefined, b: "bad" })).toBe(true);
  });
});
