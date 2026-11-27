import { describe, expect, it } from "vitest";
import {
  allowlistError,
  invalidAllowlistEntries,
  isIpOrCidr,
  MAX_ALLOWLIST_ENTRIES,
  parseAllowlist,
} from "./ipAllowlist";

const t = (key: string, options?: Record<string, unknown>) =>
  `${key}:${JSON.stringify(options ?? {})}`;

describe("isIpOrCidr", () => {
  it.each([
    "203.0.113.4",
    "0.0.0.0",
    "255.255.255.255",
    "10.0.0.0/8",
    "192.168.1.0/24",
    "1.2.3.4/32",
    "::1",
    "2001:db8::",
    "2001:db8::/32",
    "fe80::1/128",
    "::ffff:192.0.2.1",
  ])("accepts %s", (entry) => {
    expect(isIpOrCidr(entry)).toBe(true);
  });

  it.each([
    "",
    "256.0.0.1",
    "1.2.3",
    "01.2.3.4",
    "1.2.3.4/33",
    "1.2.3.4/-1",
    "1.2.3.4/abc",
    "1.2.3.4/8/8",
    "2001:db8::/129",
    "2001:::1",
    "example.com",
    "[::1]",
    "fe80::1%eth0",
  ])("rejects %s", (entry) => {
    expect(isIpOrCidr(entry)).toBe(false);
  });
});

describe("parseAllowlist", () => {
  it("splits on lines, commas and spaces and drops duplicates", () => {
    expect(parseAllowlist(" 1.2.3.4\n10.0.0.0/8, 1.2.3.4 ;::1 ")).toEqual([
      "1.2.3.4",
      "10.0.0.0/8",
      "::1",
    ]);
  });
});

describe("allowlistError", () => {
  it("names the entries that are not addresses", () => {
    const entries = ["1.2.3.4", "nope", "10.0.0.0/40"];
    expect(invalidAllowlistEntries(entries)).toEqual(["nope", "10.0.0.0/40"]);
    expect(allowlistError(entries, t)).toContain("nope, 10.0.0.0/40");
  });

  it("caps the list length", () => {
    const entries = Array.from(
      { length: MAX_ALLOWLIST_ENTRIES + 1 },
      (_, index) => `10.0.${Math.floor(index / 250)}.${index % 250}`,
    );
    expect(allowlistError(entries, t)).toContain("ipAllowlist.tooMany");
  });

  it("accepts an empty list", () => {
    expect(allowlistError([], t)).toBeUndefined();
  });
});
