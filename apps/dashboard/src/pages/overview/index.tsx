import { cn, EmptyState, Spinner, Tag } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  fetchPaymentStats,
  fetchPaymentSummary,
} from "@stores/payment/actions";
import {
  selectPaymentStats,
  selectPaymentSummary,
} from "@stores/payment/selector";
import type { PaymentTotals, PaymentVolume } from "@stores/payment/type";
import { useTitle } from "ahooks";
import { ArrowRightLeft, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { MonthlyChart } from "./MonthlyChart";
import { formatPercent, growthOf, successRate, trimAmount } from "./metrics";

function AssetAmounts({ volume }: { volume: PaymentVolume[] }) {
  const { t } = useTranslation();

  if (volume.length === 0) {
    return (
      <span className="font-semibold text-2xl text-ink-strong tabular-nums">
        0
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {volume.map((entry) => (
        <span
          className="font-mono font-semibold text-2xl text-ink-strong tabular-nums"
          key={`${entry.network}:${entry.assetAddress ?? "native"}`}
        >
          {trimAmount(entry.amount)}{" "}
          <span className="font-normal text-ink-subtle text-xs">
            {entry.assetAddress
              ? t("overview.erc20")
              : t("overview.nativeAsset")}
          </span>
        </span>
      ))}
    </div>
  );
}

function Tile({
  title,
  children,
  footer,
  testId,
}: {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  testId: string;
}) {
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-overlay/10 bg-surface px-4 py-3.5"
      data-testid={testId}
    >
      <span className="text-ink-subtle text-xs uppercase tracking-wide">
        {title}
      </span>
      {children}
      {footer}
    </div>
  );
}

export function Overview() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const summary = useAppSelector(selectPaymentSummary);
  const stats = useAppSelector(selectPaymentStats);

  useTitle(`${t("page.overview.title")} - ${t("org")}`);

  useEffect(() => {
    dispatch(fetchPaymentSummary());
    dispatch(fetchPaymentStats(6));
  }, [dispatch]);

  if (!summary || !stats) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner size="lg" className="text-ink-subtle" />
      </div>
    );
  }

  const earned: PaymentTotals = summary.received;
  const spent: PaymentTotals = summary.sent;
  const growth = growthOf(stats.received);
  const rate = successRate(earned.settledCount, earned.failedCount);

  const nothingYet = earned.count === 0 && spent.count === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-6">
        <h1 className="font-semibold text-ink-strong text-lg tracking-tight">
          {t("page.overview.title")}
        </h1>
        <p className="mt-1 text-ink-muted text-sm">
          {t("page.overview.description")}
        </p>
      </div>

      {nothingYet ? (
        <EmptyState
          className="flex-1"
          icon={<ArrowRightLeft className="h-5 w-5" />}
          title={t("overview.empty.title")}
          description={t("overview.empty.description")}
          data-testid="overview-empty"
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              title={t("overview.totalEarned")}
              testId="overview-total-earned"
              footer={
                <span className="text-ink-muted text-xs">
                  {t("overview.acrossPayments", {
                    count: earned.settledCount,
                  })}
                </span>
              }
            >
              <AssetAmounts volume={earned.volume} />
            </Tile>

            <Tile
              title={t("overview.thisMonth")}
              testId="overview-this-month"
              footer={
                growth.ratio === null ? (
                  growth.current > 0 ? (
                    <Tag size="sm" variant="success">
                      {t("overview.growthNew")}
                    </Tag>
                  ) : (
                    <span className="text-ink-subtle text-xs">
                      {t("overview.growthNone")}
                    </span>
                  )
                ) : (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-xs",
                      growth.ratio >= 0 ? "text-success" : "text-danger",
                    )}
                  >
                    {growth.ratio >= 0 ? (
                      <TrendingUp className="h-3.5 w-3.5" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5" />
                    )}
                    {t("overview.growthVsLast", {
                      percent: formatPercent(growth.ratio),
                    })}
                  </span>
                )
              }
            >
              <span className="font-mono font-semibold text-2xl text-ink-strong tabular-nums">
                {trimAmount(String(growth.current))}
              </span>
            </Tile>

            <Tile
              title={t("overview.successRate")}
              testId="overview-success-rate"
              footer={
                <span className="text-ink-muted text-xs">
                  {earned.failedCount > 0
                    ? t("overview.failedCount", { count: earned.failedCount })
                    : t("overview.noFailures")}
                </span>
              }
            >
              <span className="font-semibold text-2xl text-ink-strong tabular-nums">
                {rate === null ? "—" : `${Math.round(rate * 100)}%`}
              </span>
            </Tile>

            <Tile
              title={t("overview.totalSpent")}
              testId="overview-total-spent"
              footer={
                <span className="text-ink-muted text-xs">
                  {t("overview.acrossPayments", { count: spent.settledCount })}
                </span>
              }
            >
              <AssetAmounts volume={spent.volume} />
            </Tile>
          </div>

          <section className="flex flex-col gap-4 rounded-lg border border-overlay/10 bg-surface p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-semibold text-ink-strong text-sm">
                {t("overview.chart.earnedTitle")}
              </h2>
              <span className="text-ink-subtle text-xs">
                {t("overview.chart.lastMonths", {
                  count: stats.months.length,
                })}
              </span>
            </div>

            <MonthlyChart
              buckets={stats.received}
              testId="overview-chart-received"
            />
          </section>

          {spent.count > 0 && (
            <section className="flex flex-col gap-4 rounded-lg border border-overlay/10 bg-surface p-4">
              <h2 className="font-semibold text-ink-strong text-sm">
                {t("overview.chart.spentTitle")}
              </h2>
              <MonthlyChart buckets={stats.sent} testId="overview-chart-sent" />
            </section>
          )}

          <Link
            to="/payments"
            className="text-accent text-sm underline-offset-2 hover:underline"
            data-testid="overview-view-payments"
          >
            {t("overview.viewAll")}
          </Link>
        </div>
      )}
    </div>
  );
}
