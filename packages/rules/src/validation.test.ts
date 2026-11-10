import { describe, expect, it } from "vitest";
import {
  isDecimalAmount,
  isHexColor,
  isHttpsUrl,
  isPhoneNumber,
  isSingleLine,
  isUuidShaped,
  isWebUrl,
  SIGNED_DECIMAL_AMOUNT_PATTERN,
  toE164,
} from "./validation";

describe("validation", () => {
  it("accepts only http(s) URLs without spaces", () => {
    expect(isWebUrl("https://x.example/a")).toBe(true);
    expect(isWebUrl("http://x.example")).toBe(true);
    expect(isWebUrl("javascript:alert(1)")).toBe(false);
    expect(isWebUrl("https://x.example/a b")).toBe(false);
    expect(isWebUrl("not a url")).toBe(false);
  });

  it("requires https for isHttpsUrl", () => {
    expect(isHttpsUrl("http://x.example")).toBe(false);
    expect(isHttpsUrl("https://x.example")).toBe(true);
  });

  it("checks phones, colours and single lines", () => {
    expect(isPhoneNumber("+1 (555) 010-0000")).toBe(true);
    expect(isPhoneNumber("call me")).toBe(false);
    expect(isHexColor("#fff")).toBe(true);
    expect(isHexColor("#a1b2c3")).toBe(true);
    expect(isHexColor("red")).toBe(false);
    expect(isSingleLine("one line")).toBe(true);
    expect(isSingleLine("two\nlines")).toBe(false);
    expect(isSingleLine("para break")).toBe(false);
  });

  it("accepts decimal amounts without leading zeros", () => {
    expect(isDecimalAmount("0")).toBe(true);
    expect(isDecimalAmount("0.5")).toBe(true);
    expect(isDecimalAmount("12.000000000000000001")).toBe(true);
    expect(isDecimalAmount("01")).toBe(false);
    expect(isDecimalAmount("-1")).toBe(false);
    expect(isDecimalAmount("1.")).toBe(false);
    expect(SIGNED_DECIMAL_AMOUNT_PATTERN.test("-1.5")).toBe(true);
  });

  it("detects uuid-shaped values", () => {
    expect(isUuidShaped("0f8fad5b-d9cb-469f-a165-70867728950e")).toBe(true);
    expect(isUuidShaped("my-agent")).toBe(false);
  });
});

describe("toE164", () => {
  it("compacts a formatted international number", () => {
    expect(toE164("+1 (555) 010-0123")).toBe("+15550100123");
    expect(toE164("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("needs a country code", () => {
    expect(toE164("555 010 0123")).toBeNull();
    expect(toE164("+0 555 010 0123")).toBeNull();
  });

  it("rejects numbers that are too short or too long", () => {
    expect(toE164("+1234567")).toBeNull();
    expect(toE164("+1234567890123456")).toBeNull();
    expect(toE164(null)).toBeNull();
  });
});
