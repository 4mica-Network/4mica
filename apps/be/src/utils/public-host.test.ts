import { describe, expect, it, vi } from "vitest";
import {
  isPublicAddress,
  isPublicHostname,
  resolvesPublicly,
} from "./public-host";

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));

vi.mock("node:dns/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:dns/promises")>();
  return { ...actual, lookup, default: { ...actual, lookup } };
});

describe("isPublicHostname", () => {
  it.each([
    "api.example.com",
    "hooks.stripe.com",
    "example.co.uk.",
  ])("accepts %s", (host) => {
    expect(isPublicHostname(host)).toBe(true);
  });

  it.each([
    "localhost",
    "app.localhost",
    "printer.local",
    "db.internal",
    "intranet",
    "127.0.0.1",
    "10.0.0.5",
    "169.254.169.254",
    "[::1]",
    "[fd00::1]",
    "",
  ])("rejects %s", (host) => {
    expect(isPublicHostname(host)).toBe(false);
  });
});

describe("isPublicAddress", () => {
  it.each([
    "93.184.216.34",
    "8.8.8.8",
    "2606:4700:4700::1111",
  ])("accepts %s", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it.each([
    "10.1.2.3",
    "172.20.0.1",
    "192.168.1.1",
    "127.0.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fe80::1",
    "fd12::1",
    "::ffff:127.0.0.1",
    "64:ff9b::a00:1",
    "not-an-ip",
  ])("rejects %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });
});

describe("resolvesPublicly", () => {
  it("needs every resolved address to be public", async () => {
    lookup.mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]);
    expect(await resolvesPublicly("hooks.example.com")).toBe(true);

    lookup.mockResolvedValueOnce([
      { address: "93.184.216.34", family: 4 },
      { address: "192.168.0.10", family: 4 },
    ]);
    expect(await resolvesPublicly("hooks.example.com")).toBe(false);
  });

  it("fails closed when the name does not resolve", async () => {
    lookup.mockRejectedValueOnce(new Error("ENOTFOUND"));
    expect(await resolvesPublicly("nope.example.com")).toBe(false);
  });

  it("never resolves a private-looking hostname", async () => {
    lookup.mockClear();
    expect(await resolvesPublicly("db.internal")).toBe(false);
    expect(lookup).not.toHaveBeenCalled();
  });
});
