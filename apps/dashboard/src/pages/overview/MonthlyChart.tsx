import { cn } from "@4mica/ui";
import type { MonthlyBucket } from "@stores/payment/type";
import { useTranslation } from "react-i18next";
import { monthLabel, sumVolume, trimAmount } from "./metrics";

export function MonthlyChart({
  buckets,
  testId,
}: {
  buckets: MonthlyBucket[];
  testId: string;
}) {
  const { t } = useTranslation();

  const values = buckets.map((bucket) => Number(sumVolume(bucket.volume)));
  const peak = Math.max(...values, 0);

  if (peak === 0) {
    return (
      <p className="py-8 text-center text-ink-subtle text-sm">
        {t("overview.chart.empty")}
      </p>
    );
  }

  return (
    <div className="flex items-end gap-2" data-testid={testId}>
      {buckets.map((bucket, index) => {
        const value = values[index];
        const height = value === 0 ? 0 : Math.max((value / peak) * 100, 4);

        return (
          <div
            className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
            key={bucket.month}
          >
            <span className="font-mono text-[10px] text-ink-subtle tabular-nums">
              {value === 0 ? "" : trimAmount(String(value))}
            </span>

            <div className="flex h-24 w-full items-end">
              <div
                className={cn(
                  "w-full rounded-t",
                  value === 0 ? "bg-overlay/10" : "bg-brand",
                )}
                style={{ height: `${Math.max(height, 2)}%` }}
                title={`${monthLabel(bucket.month)} · ${bucket.settledCount}`}
              />
            </div>

            <span className="truncate text-ink-subtle text-xs">
              {monthLabel(bucket.month)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
