import { describe, expect, it } from "vitest";
import { resolvePriceAsset } from "./price-asset";

const USDC_BASE_SEPOLIA = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";

describe("resolvePriceAsset", () => {
  it("prices in the native coin when no token is given", () => {
    expect(resolvePriceAsset("BASE_SEPOLIA", null)).toEqual({
      ok: true,
      assetAddress: null,
      priceCurrency: "ETH",
    });
  });

  it("names the currency after the token", () => {
    expect(resolvePriceAsset("BASE_SEPOLIA", USDC_BASE_SEPOLIA)).toEqual({
      ok: true,
      assetAddress: USDC_BASE_SEPOLIA,
      priceCurrency: "USDC",
    });
  });

  it("refuses a token the network does not support", () => {
    const result = resolvePriceAsset("BASE", USDC_BASE_SEPOLIA);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.issue).toEqual({
      path: "assetAddress",
      message: "is not a token 4Mica accepts on Base",
    });
  });

  it("clears both without a network to pay on", () => {
    expect(resolvePriceAsset(null, USDC_BASE_SEPOLIA)).toEqual({
      ok: true,
      assetAddress: null,
      priceCurrency: null,
    });
  });
});
