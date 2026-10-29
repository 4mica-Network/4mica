import { cn, Segmented } from "@4mica/ui";
import type { PaymentStats } from "@stores/payment/type";
import { TrendingDown, TrendingUp } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  bandPath,
  formatAmount,
  formatPercent,
  growthOf,
  monthLabel,
  monthlyTotals,
  type Point,
  smoothPath,
} from "./metrics";
import { Panel } from "./Panel";

const WIDTH = 600;
const HEIGHT = 200;
const RANGES = [3, 6, 12] as const;

export type Range = (typeof RANGES)[number];

function Total({
  label,
  value,
  swatch,
  testId,
}: {
  label: string;
  value: string;
  swatch?: string;
  testId: string;
}) {
  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <span className="inline-flex items-center gap-1.5 text-ink-subtle text-xs">
        {swatch && <span className={cn("h-2 w-2 rounded-full", swatch)} />}
        {label}
      </span>
      <span className="font-mono font-semibold text-ink-strong text-xl tabular-nums">
        {value}
      </span>
    </div>
  );
}

export function CashFlowChart({
  stats,
  range,
  onRangeChange,
}: {
  stats: PaymentStats;
  range: Range;
  onRangeChange: (range: Range) => void;
}) {
  const { t } = useTranslation();
  const gradientId = useId();
  const [hovered, setHovered] = useState<number | null>(null);

  const earned = monthlyTotals(stats.received);
  const spent = monthlyTotals(stats.sent);
  const stacked = earned.map((value, index) => value + spent[index]);
  const peak = Math.max(...stacked, 0);

  const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
  const totalEarned = sum(earned);
  const totalSpent = sum(spent);
  const growth = growthOf(stats.received);

  const last = Math.max(stats.months.length - 1, 1);
  const x = (index: number) => (index / last) * WIDTH;
  const y = (value: number) =>
    peak === 0 ? HEIGHT : HEIGHT - (value / peak) * HEIGHT * 0.9;

  const base: Point[] = stats.months.map((_, i) => ({ x: x(i), y: HEIGHT }));
  const earnedTop: Point[] = earned.map((v, i) => ({ x: x(i), y: y(v) }));
  const stackTop: Point[] = stacked.map((v, i) => ({ x: x(i), y: y(v) }));

  const active = hovered ?? stats.months.length - 1;

  const zoneOf = (index: number) => {
    const start = Math.max(((index - 0.5) / last) * 100, 0);
    const end = Math.min(((index + 0.5) / last) * 100, 100);
    return { left: `${start}%`, width: `${end - start}%` };
  };

  return (
    <Panel
      title={t("overview.flow.title")}
      description={t("overview.flow.description")}
      testId="overview-cash-flow"
      action={
        <Segmented
          label={t("overview.flow.range")}
          value={range}
          options={RANGES.map((months) => ({
            value: months,
            label: t("overview.flow.rangeOption", { count: months }),
          }))}
          onChange={onRangeChange}
          data-testid="overview-range"
        />
      }
    >
      <div className="flex flex-wrap items-end gap-x-10 gap-y-4 px-5 pt-4">
        <Total
          label={t("overview.flow.earned")}
          value={formatAmount(totalEarned)}
          swatch="bg-success"
          testId="overview-flow-earned"
        />
        <Total
          label={t("overview.flow.spent")}
          value={formatAmount(totalSpent)}
          swatch="bg-ink-strong"
          testId="overview-flow-spent"
        />
        <Total
          label={t("overview.flow.net")}
          value={`${totalEarned - totalSpent >= 0 ? "+" : ""}${formatAmount(totalEarned - totalSpent)}`}
          testId="overview-flow-net"
        />
        {growth.ratio !== null && (
          <span
            className={cn(
              "mb-1 inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-xs",
              growth.ratio >= 0
                ? "bg-success/10 text-success"
                : "bg-overlay/10 text-ink-muted",
            )}
            data-testid="overview-flow-growth"
          >
            {growth.ratio >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )}
            {t("overview.flow.growth", {
              percent: formatPercent(growth.ratio),
            })}
          </span>
        )}
      </div>

      {peak === 0 ? (
        <p className="px-5 py-16 text-center text-ink-subtle text-sm">
          {t("overview.flow.empty")}
        </p>
      ) : (
        <div className="px-5 pt-6 pb-4">
          <div className="relative h-52" data-testid="overview-flow-chart">
            <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
              {[0, 1, 2, 3].map((line) => (
                <span
                  key={line}
                  className="border-overlay/5 border-t border-dashed"
                />
              ))}
            </div>

            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full overflow-visible"
              aria-hidden="true"
            >
              <defs>
                <linearGradient
                  id={`${gradientId}-earned`}
                  x1="0"
                  x2="0"
                  y1="0"
                  y2="1"
                  className="text-success"
                >
                  <stop
                    offset="0%"
                    stopColor="currentColor"
                    stopOpacity={0.4}
                  />
                  <stop
                    offset="100%"
                    stopColor="currentColor"
                    stopOpacity={0.02}
                  />
                </linearGradient>
                <linearGradient
                  id={`${gradientId}-spent`}
                  x1="0"
                  x2="0"
                  y1="0"
                  y2="1"
                  className="text-ink-strong"
                >
                  <stop
                    offset="0%"
                    stopColor="currentColor"
                    stopOpacity={0.14}
                  />
                  <stop
                    offset="100%"
                    stopColor="currentColor"
                    stopOpacity={0.01}
                  />
                </linearGradient>
              </defs>

              <path
                d={bandPath(stackTop, earnedTop)}
                fill={`url(#${gradientId}-spent)`}
              />
              <path
                d={bandPath(earnedTop, base)}
                fill={`url(#${gradientId}-earned)`}
              />
              <path
                d={smoothPath(stackTop)}
                fill="none"
                className="stroke-ink-muted"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={smoothPath(earnedTop)}
                fill="none"
                className="stroke-success"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            {hovered !== null && (
              <>
                <div
                  className="pointer-events-none absolute inset-y-0 w-px bg-overlay/20 transition-[left] duration-150"
                  style={{ left: `${(x(active) / WIDTH) * 100}%` }}
                />
                {[stackTop[active], earnedTop[active]].map((point, index) => (
                  <span
                    key={index === 0 ? "spent" : "earned"}
                    className={cn(
                      "pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface-solid transition-[left,top] duration-150",
                      index === 0 ? "bg-ink-strong" : "bg-success",
                    )}
                    style={{
                      left: `${(point.x / WIDTH) * 100}%`,
                      top: `${(point.y / HEIGHT) * 100}%`,
                    }}
                  />
                ))}

                <div
                  className={cn(
                    "pointer-events-none absolute top-0 z-10 min-w-40 rounded-lg border border-overlay/15 bg-popover px-3 py-2.5 text-xs shadow-lg transition-[left] duration-150",
                    active > stats.months.length / 2
                      ? "-translate-x-[calc(100%+12px)]"
                      : "translate-x-3",
                  )}
                  style={{ left: `${(x(active) / WIDTH) * 100}%` }}
                  data-testid="overview-flow-tooltip"
                >
                  <p className="mb-1.5 font-medium text-ink-strong">
                    {monthLabel(stats.months[active])}
                  </p>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                    <dt className="inline-flex items-center gap-1.5 text-ink-subtle">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" />
                      {t("overview.flow.earned")}
                    </dt>
                    <dd className="text-right font-mono text-ink-strong tabular-nums">
                      {formatAmount(earned[active])}
                    </dd>
                    <dt className="inline-flex items-center gap-1.5 text-ink-subtle">
                      <span className="h-1.5 w-1.5 rounded-full bg-ink-strong" />
                      {t("overview.flow.spent")}
                    </dt>
                    <dd className="text-right font-mono text-ink-strong tabular-nums">
                      {formatAmount(spent[active])}
                    </dd>
                    <dt className="text-ink-subtle">
                      {t("overview.flow.payments")}
                    </dt>
                    <dd className="text-right font-mono text-ink-strong tabular-nums">
                      {stats.received[active].settledCount +
                        stats.sent[active].settledCount}
                    </dd>
                  </dl>
                </div>
              </>
            )}

            <div className="absolute inset-0">
              {stats.months.map((month, index) => (
                <button
                  key={month}
                  type="button"
                  className="absolute inset-y-0 focus-visible:bg-overlay/5 focus-visible:outline-none"
                  style={zoneOf(index)}
                  onMouseEnter={() => setHovered(index)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(index)}
                  onBlur={() => setHovered(null)}
                  aria-label={t("overview.flow.point", {
                    month: monthLabel(month),
                    earned: formatAmount(earned[index]),
                    spent: formatAmount(spent[index]),
                  })}
                />
              ))}
            </div>
          </div>

          <div className="mt-3 flex justify-between">
            {stats.months.map((month, index) => (
              <span
                key={month}
                className={cn(
                  "w-0 whitespace-nowrap text-xs",
                  index === 0
                    ? "text-left"
                    : index === stats.months.length - 1
                      ? "flex justify-end"
                      : "flex justify-center",
                  index === active ? "text-ink-body" : "text-ink-subtle",
                )}
              >
                {monthLabel(month)}
              </span>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
