import type { WalletBalance } from "@stores/balance/type";
import type { MonthlyBucket, RankedEntry } from "@stores/payment/type";
import { describe, expect, it } from "vitest";
import {
  collateralRows,
  formatPercent,
  growthOf,
  rankBy,
  smoothPath,
  successRate,
  sumVolume,
  totalsByAsset,
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

describe("smoothPath", () => {
  it("is empty without points", () => {
    expect(smoothPath([])).toBe("");
  });

  it("passes through every point", () => {
    const path = smoothPath([
      { x: 0, y: 10 },
      { x: 50, y: 0 },
      { x: 100, y: 10 },
    ]);

    expect(path.startsWith("M0,10")).toBe(true);
    expect(path).toContain(" 50,0");
    expect(path.endsWith(" 100,10")).toBe(true);
  });

  it("stays flat at a peak instead of overshooting", () => {
    const path = smoothPath([
      { x: 0, y: 10 },
      { x: 30, y: 0 },
      { x: 60, y: 10 },
    ]);

    expect(path).toContain("C10,6.666666666666667 20,0 30,0");
  });
});

const wallet = (
  id: string,
  total: string,
  locked = "0",
  assetAddress = "0xusdc",
): WalletBalance => ({
  id,
  label: id,
  address: `0x${id}`,
  role: "PAYER",
  assets: [
    {
      assetAddress,
      symbol: "USDC",
      decimals: 6,
      total,
      locked,
      available: (BigInt(total) - BigInt(locked)).toString(),
      updatedAt: null,
    },
  ],
});

describe("totalsByAsset", () => {
  it("adds every wallet's holding of the same asset", () => {
    const [usdc] = totalsByAsset([wallet("a", "100", "10"), wallet("b", "50")]);

    expect(usdc.total).toBe(150n);
    expect(usdc.locked).toBe(10n);
  });
});

describe("collateralRows", () => {
  it("orders wallets by holding and shares out the total", () => {
    const rows = collateralRows(
      [wallet("small", "250"), wallet("big", "750", "100")],
      "0xusdc",
    );

    expect(rows.map((row) => row.wallet.id)).toEqual(["big", "small"]);
    expect(rows[0].share).toBe(0.75);
    expect(rows[0].available).toBe(650n);
    expect(rows[1].share).toBe(0.25);
  });

  it("gives every wallet a zero share when nothing is deposited", () => {
    const rows = collateralRows([wallet("a", "0")], "0xusdc");

    expect(rows[0].share).toBe(0);
  });

  it("treats a wallet without the asset as empty", () => {
    const rows = collateralRows(
      [wallet("a", "10"), wallet("b", "10", "0", "0xother")],
      "0xusdc",
    );

    expect(rows.find((row) => row.wallet.id === "b")?.total).toBe(0n);
  });
});

describe("rankBy", () => {
  const entries: RankedEntry[] = [
    { id: "1", name: "Few big", slug: "a", settledCount: 2, amount: "9" },
    { id: "2", name: "Many small", slug: "b", settledCount: 40, amount: "4" },
  ];

  it("ranks by volume", () => {
    expect(rankBy(entries, "amount").map((entry) => entry.id)).toEqual([
      "1",
      "2",
    ]);
  });

  it("ranks by payment count", () => {
    const ranked = rankBy(entries, "settledCount");

    expect(ranked.map((entry) => entry.id)).toEqual(["2", "1"]);
    expect(ranked[0].value).toBe(40);
  });
});
