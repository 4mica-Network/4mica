import { trimAmount } from "@4mica/rules";
import type { WalletBalance } from "@stores/balance/type";
import type {
  MonthlyBucket,
  PaymentVolume,
  RankedEntry,
} from "@stores/payment/type";
import { formatUnits } from "viem";

export const sumVolume = (volume: PaymentVolume[]): string =>
  volume.reduce((total, entry) => total + Number(entry.amount), 0).toString();

export const formatAmount = (value: number): string =>
  value.toLocaleString(undefined, { maximumFractionDigits: 6 });

export const formatBalance = (value: string | bigint, decimals: number) =>
  trimAmount(formatUnits(BigInt(value), decimals));

export const monthLabel = (month: string): string => {
  const [year, index] = month.split("-");
  const date = new Date(Date.UTC(Number(year), Number(index) - 1, 1));

  return date.toLocaleDateString(undefined, {
    month: "short",
    timeZone: "UTC",
  });
};

export const monthlyTotals = (buckets: MonthlyBucket[]): number[] =>
  buckets.map((bucket) => Number(sumVolume(bucket.volume)));

export interface Growth {
  ratio: number | null;
  current: number;
  previous: number;
}

export const growthOf = (buckets: MonthlyBucket[]): Growth => {
  const current = Number(sumVolume(buckets.at(-1)?.volume ?? []));
  const previous = Number(sumVolume(buckets.at(-2)?.volume ?? []));

  return {
    ratio: previous === 0 ? null : (current - previous) / previous,
    current,
    previous,
  };
};

export const formatPercent = (ratio: number): string =>
  `${ratio >= 0 ? "+" : ""}${Math.round(ratio * 100)}%`;

export const successRate = (settled: number, failed: number): number | null => {
  const attempted = settled + failed;
  return attempted === 0 ? null : settled / attempted;
};

export interface Point {
  x: number;
  y: number;
}

const tangents = (points: Point[]): number[] => {
  const slopes = points.slice(1).map((point, index) => {
    const run = point.x - points[index].x;
    return run === 0 ? 0 : (point.y - points[index].y) / run;
  });

  return points.map((_, index) => {
    if (index === 0) {
      return slopes[0] ?? 0;
    }
    if (index === points.length - 1) {
      return slopes[index - 1];
    }
    const before = slopes[index - 1];
    const after = slopes[index];
    if (before * after <= 0) {
      return 0;
    }
    return (2 * before * after) / (before + after);
  });
};

export const smoothPath = (points: Point[]): string => {
  if (points.length === 0) {
    return "";
  }

  const slope = tangents(points);
  let path = `M${points[0].x},${points[0].y}`;

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const third = (to.x - from.x) / 3;
    path += ` C${from.x + third},${from.y + slope[index - 1] * third} ${to.x - third},${to.y - slope[index] * third} ${to.x},${to.y}`;
  }

  return path;
};

export const bandPath = (top: Point[], bottom: Point[]): string => {
  if (top.length === 0) {
    return "";
  }

  const reversed = [...bottom].reverse();
  const back = smoothPath(reversed).replace(/^M/, "L");

  return `${smoothPath(top)} ${back} Z`;
};

export interface AssetTotal {
  assetAddress: string;
  symbol: string;
  decimals: number;
  total: bigint;
  locked: bigint;
}

export const totalsByAsset = (wallets: WalletBalance[]): AssetTotal[] => {
  const totals = new Map<string, AssetTotal>();

  for (const asset of wallets.flatMap((wallet) => wallet.assets)) {
    const entry = totals.get(asset.assetAddress) ?? {
      assetAddress: asset.assetAddress,
      symbol: asset.symbol,
      decimals: asset.decimals,
      total: 0n,
      locked: 0n,
    };
    entry.total += BigInt(asset.total);
    entry.locked += BigInt(asset.locked);
    totals.set(asset.assetAddress, entry);
  }

  return [...totals.values()];
};

export interface CollateralRow {
  wallet: WalletBalance;
  available: bigint;
  locked: bigint;
  total: bigint;
  share: number;
}

export const collateralRows = (
  wallets: WalletBalance[],
  assetAddress: string,
): CollateralRow[] => {
  const rows = wallets.map((wallet) => {
    const asset = wallet.assets.find(
      (entry) => entry.assetAddress === assetAddress,
    );
    const total = BigInt(asset?.total ?? 0);
    const locked = BigInt(asset?.locked ?? 0);

    return { wallet, available: total - locked, locked, total, share: 0 };
  });

  const grand = rows.reduce((sum, row) => sum + row.total, 0n);

  return rows
    .map((row) => ({
      ...row,
      share: grand === 0n ? 0 : Number((row.total * 10_000n) / grand) / 10_000,
    }))
    .sort((a, b) => (a.total === b.total ? 0 : a.total > b.total ? -1 : 1));
};

export type RankKey = "amount" | "settledCount";

export const rankBy = (entries: RankedEntry[], key: RankKey) =>
  [...entries]
    .map((entry) => ({
      ...entry,
      value: key === "amount" ? Number(entry.amount) : entry.settledCount,
    }))
    .sort((a, b) => b.value - a.value);
