import { describe, expect, it } from "vitest";
import { NETWORKS, networkInfo } from "./networks";

/**
 * The `satisfies Record<PaymentNetwork, …>` clause in networks.ts catches a
 * missing member at compile time; this catches a member added with a malformed
 * value, which the type cannot see.
 */
describe("NETWORKS", () => {
  it("gives every network a CAIP-2 id and an SDK name", () => {
    for (const [key, info] of Object.entries(NETWORKS)) {
      expect(info.caip2, key).toMatch(/^eip155:\d+$/);
      expect(info.sdkName, key).not.toBe("");
      expect(info.label, key).not.toBe("");
    }
  });

  it("does not reuse a chain id across networks", () => {
    const ids = Object.values(NETWORKS).map((info) => info.caip2);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves an enum member to its info", () => {
    expect(networkInfo("BASE_SEPOLIA").caip2).toBe("eip155:84532");
    expect(networkInfo("ETHEREUM_SEPOLIA").caip2).toBe("eip155:11155111");
    expect(networkInfo("BASE").caip2).toBe("eip155:8453");
  });
});
