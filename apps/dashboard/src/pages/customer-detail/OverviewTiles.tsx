import { Tooltip } from "@4mica/ui";
import type { CustomerOverview, SpendBucket } from "@stores/customer/type";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/form";
import { trimAmount } from "../payments/constants";

function Amount({ buckets }: { buckets: SpendBucket[] }) {
  const { t } = useTranslation();

  if (buckets.length === 0) {
    return <span className="font-semibold text-ink-strong text-sm">—</span>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {buckets.map((bucket) => (
        <span
          key={`${bucket.network}:${bucket.assetAddress ?? "native"}`}
          className="font-semibold text-ink-strong text-sm"
        >
          {trimAmount(bucket.amount)}{" "}
          <span className="font-normal text-ink-muted">
            {bucket.assetAddress
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
  children,
  footer,
  testId,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  testId: string;
}) {
  return (
    <Card className="flex flex-col gap-2 px-4 py-3.5" data-testid={testId}>
      <span className="text-ink-muted text-sm">{title}</span>
      {children}
      {footer && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {footer}
        </div>
      )}
    </Card>
  );
}

const absoluteWhen = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "—";

export function OverviewTiles({
  overview,
}: {
  overview: CustomerOverview | null;
}) {
  const { t } = useTranslation();

  if (!overview) {
    return null;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Tile
        title={t("customer.detail.totalSpend")}
        testId="customer-tile-total"
      >
        <Amount buckets={overview.totalSpend} />
      </Tile>

      <Tile
        title={t("customer.detail.recentSpend")}
        testId="customer-tile-recent"
      >
        <Amount buckets={overview.recentSpend} />
      </Tile>

      <Tile
        title={t("customer.detail.transactions")}
        testId="customer-tile-txns"
        footer={
          <>
            <span className="text-ink-muted">
              {t("customer.detail.settled", {
                count: overview.settledCount,
              })}
            </span>
            {overview.failedCount > 0 && (
              <Tooltip content={t("customer.detail.failedHint")}>
                <span className="text-danger">
                  {t("customer.detail.failed", {
                    count: overview.failedCount,
                  })}
                </span>
              </Tooltip>
            )}
          </>
        }
      >
        <span className="font-semibold text-ink-strong text-sm">
          {overview.txnCount.toLocaleString()}
        </span>
      </Tile>

      <Tile
        title={t("customer.detail.lastActive")}
        testId="customer-tile-active"
      >
        <span className="font-semibold text-ink-strong text-sm">
          {absoluteWhen(overview.lastActiveAt)}
        </span>
      </Tile>
    </div>
  );
}
