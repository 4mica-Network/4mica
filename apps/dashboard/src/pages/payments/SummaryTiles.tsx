import { Tooltip } from "@4mica/ui";
import type { PaymentSummary, PaymentTotals } from "@stores/payment/type";
import { useTranslation } from "react-i18next";
import { trimAmount } from "./constants";

function Volume({ totals }: { totals: PaymentTotals }) {
  const { t } = useTranslation();

  if (totals.volume.length === 0) {
    return (
      <span className="font-semibold text-ink-strong text-xl tabular-nums">
        —
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {totals.volume.map((entry) => (
        <span
          key={`${entry.network}:${entry.assetAddress ?? "native"}`}
          className="font-mono font-semibold text-ink-strong text-lg tabular-nums"
        >
          {trimAmount(entry.amount)}{" "}
          <span className="font-normal text-ink-subtle text-xs">
            {entry.assetAddress
              ? t("payment.row.erc20")
              : t("payment.row.native")}
          </span>
        </span>
      ))}
    </div>
  );
}

function Tile({
  title,
  totals,
  testId,
}: {
  title: string;
  totals: PaymentTotals;
  testId: string;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-overlay/10 bg-surface px-4 py-3.5"
      data-testid={testId}
    >
      <span className="text-ink-subtle text-xs uppercase tracking-wide">
        {title}
      </span>

      <Volume totals={totals} />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="text-ink-muted">
          {t("payment.summary.settled", { count: totals.settledCount })}
        </span>
        {totals.pendingCount > 0 && (
          <span className="text-warning">
            {t("payment.summary.pending", { count: totals.pendingCount })}
          </span>
        )}
        {totals.failedCount > 0 && (
          <Tooltip content={t("payment.summary.failedHint")}>
            <span className="text-danger">
              {t("payment.summary.failed", { count: totals.failedCount })}
            </span>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

export function SummaryTiles({ summary }: { summary: PaymentSummary | null }) {
  const { t } = useTranslation();

  if (!summary) {
    return null;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Tile
        title={t("payment.summary.receivedTitle")}
        totals={summary.received}
        testId="payment-summary-received"
      />
      <Tile
        title={t("payment.summary.sentTitle")}
        totals={summary.sent}
        testId="payment-summary-sent"
      />
    </div>
  );
}
