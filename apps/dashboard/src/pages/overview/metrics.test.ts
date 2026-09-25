import type { MonthlyBucket } from "@stores/payment/type";
import { describe, expect, it } from "vitest";
import {
  formatPercent,
  growthOf,
  successRate,
  sumVolume,
  trimAmount,
} from "./metrics";

const bucket = (amount: string | null): MonthlyBucket => ({
  month: "2026-09",
  settledCount: amount === null ? 0 : 1,
  failedCount: 0,
  volume:
    amount === null
      ? []
      : [{ assetAddress: null, network: "BASE_SEPOLIA", amount }],
});

describe("trimAmount", () => {
  it("drops the trailing zeros a Decimal(38,18) carries", () => {
    expect(trimAmount("0.010000000000000000")).toBe("0.01");
    expect(trimAmount("1.000000000000000000")).toBe("1");
  });

  it("leaves an integer alone", () => {
    expect(trimAmount("42")).toBe("42");
  });

  it("never returns an empty string", () => {
    expect(trimAmount("0.000000000000000000")).toBe("0");
  });
});

describe("sumVolume", () => {
  it("is zero for an empty month", () => {
    expect(sumVolume([])).toBe("0");
  });

  it("adds the entries", () => {
    expect(
      sumVolume([
        { assetAddress: null, network: "BASE", amount: "0.01" },
        { assetAddress: null, network: "BASE", amount: "0.02" },
      ]),
    ).toBe("0.03");
  });
});

describe("growthOf", () => {
  it("compares the last month with the one before it", () => {
    const growth = growthOf([bucket("1"), bucket("2")]);

    expect(growth.current).toBe(2);
    expect(growth.previous).toBe(1);
    expect(growth.ratio).toBe(1);
  });

  it("reports a fall as a negative ratio", () => {
    expect(growthOf([bucket("4"), bucket("3")]).ratio).toBe(-0.25);
  });

  it("returns null rather than infinity for a first-ever month", () => {
    const growth = growthOf([bucket(null), bucket("5")]);

    expect(growth.ratio).toBeNull();
    expect(growth.current).toBe(5);
  });

  it("copes with fewer than two months", () => {
    expect(growthOf([]).current).toBe(0);
    expect(growthOf([bucket("1")]).ratio).toBeNull();
  });
});

describe("formatPercent", () => {
  it("signs a rise and rounds", () => {
    expect(formatPercent(0.256)).toBe("+26%");
    expect(formatPercent(0)).toBe("+0%");
  });

  it("keeps the minus on a fall", () => {
    expect(formatPercent(-0.25)).toBe("-25%");
  });
});

describe("successRate", () => {
  it("is a share of everything attempted", () => {
    expect(successRate(3, 1)).toBe(0.75);
  });

  it("is null when nothing has been attempted", () => {
    expect(successRate(0, 0)).toBeNull();
  });

  it("is 1 when nothing has failed", () => {
    expect(successRate(5, 0)).toBe(1);
  });
});
