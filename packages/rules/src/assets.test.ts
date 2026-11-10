import { describe, expect, it } from "vitest";
import { findPaymentAsset, PAYMENT_ASSETS } from "./assets";
import { PAYMENT_NETWORK_IDS } from "./networks";

describe("payment assets", () => {
  it("offers the native coin first on every network", () => {
    for (const network of PAYMENT_NETWORK_IDS) {
      expect(PAYMENT_ASSETS[network][0]).toMatchObject({
        address: null,
        symbol: "ETH",
      });
    }
  });

  it("stores token addresses lowercase so lookups match the backend", () => {
    for (const network of PAYMENT_NETWORK_IDS) {
      for (const asset of PAYMENT_ASSETS[network]) {
        expect(asset.address).toBe(asset.address?.toLowerCase() ?? null);
      }
    }
  });

  it("finds a token whatever the address casing", () => {
    expect(
      findPaymentAsset(
        "BASE_SEPOLIA",
        "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      ),
    ).toMatchObject({ symbol: "USDC", decimals: 6 });
  });

  it("treats no address as the native coin", () => {
    expect(findPaymentAsset("BASE", null)).toMatchObject({ symbol: "ETH" });
  });

  it("does not accept a token from another network", () => {
    expect(
      findPaymentAsset("BASE", "0x036cbd53842c5426634e7929541ec2318f3dcf7e"),
    ).toBeNull();
  });
});
