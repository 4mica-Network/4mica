import { Card, cn } from "@4mica/ui";
import type { PaymentSummary } from "@stores/payment/type";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Lock,
  type LucideIcon,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  type AssetTotal,
  formatAmount,
  formatBalance,
  successRate,
  sumVolume,
} from "./metrics";

function Kpi({
  label,
  icon: Icon,
  tint,
  children,
  footer,
  testId,
}: {
  label: string;
  icon: LucideIcon;
  tint: string;
  children: ReactNode;
  footer: ReactNode;
  testId: string;
}) {
  return (
    <Card
      className="flex min-w-0 flex-col gap-3 rounded-xl px-5 py-4"
      data-testid={testId}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-ink-subtle text-xs">{label}</span>
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg",
            tint,
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="min-w-0">{children}</div>
      <div className="text-ink-muted text-xs">{footer}</div>
    </Card>
  );
}

function Figure({ value, unit }: { value: string; unit?: string }) {
  return (
    <span className="block truncate font-mono font-semibold text-2xl text-ink-strong tabular-nums tracking-tight">
      {value}
      {unit && (
        <span className="ml-1.5 font-normal font-sans text-ink-subtle text-xs">
          {unit}
        </span>
      )}
    </span>
  );
}

function AssetFigures({
  assets,
  pick,
}: {
  assets: AssetTotal[] | null;
  pick: (asset: AssetTotal) => bigint;
}) {
  if (!assets || assets.length === 0) {
    return <Figure value={assets ? "0" : "—"} />;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {assets.map((asset) => (
        <Figure
          key={asset.assetAddress}
          value={formatBalance(pick(asset), asset.decimals)}
          unit={asset.symbol}
        />
      ))}
    </div>
  );
}

export function KpiStrip({
  summary,
  assets,
  walletCount,
}: {
  summary: PaymentSummary;
  assets: AssetTotal[] | null;
  walletCount: number;
}) {
  const { t } = useTranslation();

  const { received, sent } = summary;
  const rate = successRate(received.settledCount, received.failedCount);

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi
        label={t("overview.kpi.available")}
        icon={ShieldCheck}
        tint="bg-overlay/5 text-ink-muted"
        testId="overview-kpi-available"
        footer={t("overview.kpi.acrossWallets", { count: walletCount })}
      >
        <AssetFigures
          assets={assets}
          pick={(asset) => asset.total - asset.locked}
        />
      </Kpi>

      <Kpi
        label={t("overview.kpi.locked")}
        icon={Lock}
        tint="bg-overlay/5 text-ink-muted"
        testId="overview-kpi-locked"
        footer={t("overview.kpi.lockedHint")}
      >
        <AssetFigures assets={assets} pick={(asset) => asset.locked} />
      </Kpi>

      <Kpi
        label={t("overview.kpi.earned")}
        icon={ArrowDownLeft}
        tint="bg-success/10 text-success"
        testId="overview-total-earned"
        footer={
          rate === null
            ? t("overview.acrossPayments", { count: received.settledCount })
            : t("overview.kpi.earnedFooter", {
                count: received.settledCount,
                rate: Math.round(rate * 100),
              })
        }
      >
        <Figure value={formatAmount(Number(sumVolume(received.volume)))} />
      </Kpi>

      <Kpi
        label={t("overview.kpi.spent")}
        icon={ArrowUpRight}
        tint="bg-overlay/5 text-ink-muted"
        testId="overview-total-spent"
        footer={t("overview.acrossPayments", { count: sent.settledCount })}
      >
        <Figure value={formatAmount(Number(sumVolume(sent.volume)))} />
      </Kpi>
    </div>
  );
}
