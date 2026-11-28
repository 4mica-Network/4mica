import { describe, expect, it } from "vitest";
import {
  environmentForNetwork,
  explorerAddressUrl,
  networkForChainId,
  networksForEnvironment,
  PAYMENT_NETWORKS,
  shortenAddress,
} from "./networks";

describe("networks", () => {
  it("resolves a chain id back to its network", () => {
    expect(networkForChainId(84532)).toBe("BASE_SEPOLIA");
    expect(networkForChainId(1)).toBeNull();
    expect(networkForChainId(null)).toBeNull();
  });

  it("keeps chain ids and caip2 ids in sync", () => {
    for (const [key, info] of Object.entries(PAYMENT_NETWORKS)) {
      expect(info.caip2, key).toBe(`eip155:${info.chainId}`);
      expect(info.sdkName, key).not.toBe("");
      expect(info.label, key).not.toBe("");
    }
  });

  it("does not reuse a chain id across networks", () => {
    const ids = Object.values(PAYMENT_NETWORKS).map((info) => info.chainId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("builds explorer links", () => {
    expect(explorerAddressUrl("BASE", "0xabc")).toBe(
      "https://basescan.org/address/0xabc",
    );
  });

  it("shortens long addresses only", () => {
    expect(shortenAddress("0x1234567890abcdef1234")).toBe("0x1234…1234");
    expect(shortenAddress("0x1234")).toBe("0x1234");
  });
});

describe("environments", () => {
  it("puts mainnets in production and testnets in sandbox", () => {
    expect(environmentForNetwork("BASE")).toBe("PRODUCTION");
    expect(environmentForNetwork("BASE_SEPOLIA")).toBe("SANDBOX");
    expect(environmentForNetwork("ETHEREUM_SEPOLIA")).toBe("SANDBOX");
  });

  it("lists every network under exactly one environment", () => {
    expect(networksForEnvironment("PRODUCTION")).toEqual(["BASE"]);
    expect(networksForEnvironment("SANDBOX")).toEqual([
      "BASE_SEPOLIA",
      "ETHEREUM_SEPOLIA",
    ]);
  });
});
