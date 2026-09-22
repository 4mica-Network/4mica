import type { MonthlyBucket, PaymentVolume } from "@stores/payment/type";

export const trimAmount = (amount: string): string => {
  if (!amount.includes(".")) {
    return amount;
  }
  const trimmed = amount.replace(/0+$/, "").replace(/\.$/, "");
  return trimmed === "" || trimmed === "-" ? "0" : trimmed;
};

export const sumVolume = (volume: PaymentVolume[]): string =>
  volume.reduce((total, entry) => total + Number(entry.amount), 0).toString();

export const monthLabel = (month: string): string => {
  const [year, index] = month.split("-");
  const date = new Date(Date.UTC(Number(year), Number(index) - 1, 1));

  return date.toLocaleDateString(undefined, {
    month: "short",
    timeZone: "UTC",
  });
};

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
