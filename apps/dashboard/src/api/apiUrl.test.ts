import { describe, expect, it } from "vitest";
import { requireTrustedApiUrl } from "./apiUrl";

describe("requireTrustedApiUrl", () => {
  it("accepts the trusted https origins", () => {
    expect(requireTrustedApiUrl("https://api.app.4mica.io")).toBe(
      "https://api.app.4mica.io",
    );
    expect(requireTrustedApiUrl("https://api.app.4mica.io/")).toBe(
      "https://api.app.4mica.io",
    );
    expect(requireTrustedApiUrl("https://4mica.io")).toBe("https://4mica.io");
  });

  it.each([
    ["a missing value", undefined],
    ["an empty value", ""],
    ["a blank value", "   "],
    ["a relative value", "/api"],
    ["plain http", "http://api.app.4mica.io"],
    ["localhost", "http://localhost:4000"],
    ["https localhost", "https://localhost:4000"],
    ["a foreign host", "https://api.example.com"],
    ["a lookalike suffix", "https://evil4mica.io"],
    ["a lookalike prefix", "https://4mica.io.evil.com"],
    ["embedded credentials", "https://user:pass@api.app.4mica.io"],
    ["a credential lookalike", "https://api.app.4mica.io@evil.com"],
    ["a path", "https://api.app.4mica.io/v1"],
    ["a query", "https://api.app.4mica.io/?a=1"],
  ])("rejects %s", (_label, value) => {
    expect(() => requireTrustedApiUrl(value)).toThrow(/VITE_API_URL/);
  });
});
