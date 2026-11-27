import { describe, expect, it } from "vitest";
import { canonicalIp, ipAllowed, normalizeIpEntry } from "./ip-allowlist";

describe("normalizeIpEntry", () => {
  it.each([
    ["203.0.113.7", "203.0.113.7"],
    [" 203.0.113.7 ", "203.0.113.7"],
    ["203.0.113.7/32", "203.0.113.7"],
    ["203.0.113.77/24", "203.0.113.0/24"],
    ["10.1.2.3/8", "10.0.0.0/8"],
    ["0.0.0.0/0", "0.0.0.0/0"],
    ["2001:DB8:0:0::1", "2001:db8::1"],
    ["2001:db8::1/128", "2001:db8::1"],
    ["2001:db8::/32", "2001:db8::/32"],
    ["::ffff:198.51.100.4", "198.51.100.4"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeIpEntry(input)).toBe(expected);
  });

  it.each([
    "",
    "example.com",
    "203.0.113",
    "203.0.113.256",
    "01.2.3.4",
    "203.0.113.7/33",
    "2001:db8::/129",
    "203.0.113.7/24/1",
    "203.0.113.7/-1",
    "203.0.113.7/ab",
  ])("rejects %s", (input) => {
    expect(normalizeIpEntry(input)).toBeNull();
  });
});

describe("canonicalIp", () => {
  it("unwraps IPv4-mapped IPv6 addresses", () => {
    expect(canonicalIp("::ffff:203.0.113.9")).toBe("203.0.113.9");
    expect(canonicalIp("::FFFF:cb00:7109")).toBe("203.0.113.9");
  });

  it("refuses anything that is not an address", () => {
    expect(canonicalIp("localhost")).toBeNull();
  });
});

describe("ipAllowed", () => {
  const list = ["203.0.113.0/24", "198.51.100.4", "2001:db8:abcd::/48"];

  it("matches IPv4 addresses and CIDR ranges", () => {
    expect(ipAllowed("203.0.113.200", list)).toBe(true);
    expect(ipAllowed("198.51.100.4", list)).toBe(true);
    expect(ipAllowed("198.51.100.5", list)).toBe(false);
    expect(ipAllowed("203.0.114.1", list)).toBe(false);
  });

  it("matches IPv6 addresses and CIDR ranges", () => {
    expect(ipAllowed("2001:db8:abcd:12::1", list)).toBe(true);
    expect(ipAllowed("2001:DB8:ABCD::", list)).toBe(true);
    expect(ipAllowed("2001:db8:abce::1", list)).toBe(false);
  });

  it("treats an IPv4-mapped IPv6 caller as its IPv4 address", () => {
    expect(ipAllowed("::ffff:203.0.113.5", list)).toBe(true);
    expect(ipAllowed("::ffff:192.0.2.1", list)).toBe(false);
  });

  it("does not let an IPv4 range match an unrelated IPv6 address", () => {
    expect(ipAllowed("::1", ["0.0.0.0/0"])).toBe(false);
    expect(ipAllowed("::1", ["::/0"])).toBe(true);
  });

  it("fails closed on an unparseable caller address", () => {
    expect(ipAllowed("unknown", ["0.0.0.0/0"])).toBe(false);
  });
});
