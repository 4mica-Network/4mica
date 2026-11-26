import { describe, expect, it } from "vitest";
import { amountInput } from "./amount.js";

const flag = (value: string) => ({ value, source: "flag" as const });
const config = (value: string) => ({ value, source: "config" as const });

describe("amountInput", () => {
  it("pairs a bare amount with the asset given separately", () => {
    expect(amountInput("5", flag("USDC"))).toEqual({
      amount: "5",
      asset: "USDC",
    });
  });

  it("accepts the SDK's quoted form", () => {
    expect(amountInput("0.10 USDC")).toEqual({ amount: "0.10", asset: "USDC" });
  });

  it("refuses an asset given twice, even when both agree", () => {
    expect(() => amountInput("5 USDC", flag("USDC"))).toThrow(
      expect.objectContaining({ code: "ASSET_GIVEN_TWICE" }),
    );
  });

  it("lets an asset typed with the amount replace the configured default", () => {
    expect(amountInput("0.01 ETH", config("USDC"))).toEqual({
      amount: "0.01",
      asset: "ETH",
    });
    expect(amountInput("5", config("USDC"))).toEqual({
      amount: "5",
      asset: "USDC",
    });
  });

  it("refuses an amount with no asset", () => {
    expect(() => amountInput("5")).toThrow(
      expect.objectContaining({ code: "NO_ASSET" }),
    );
  });

  it.each(["-5", "1e3", "5.", "abc", "0x10"])("refuses %j", (amount) => {
    expect(() => amountInput(amount, flag("USDC"))).toThrow();
  });
});
