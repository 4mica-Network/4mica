import { Tag } from "@4mica/ui";
import type { CustomerBreakdownEntry } from "@stores/customer/type";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { trimAmount } from "../payments/constants";

const linkFor = (entry: CustomerBreakdownEntry): string | null => {
  if (!entry.id) {
    return null;
  }
  return entry.kind === "listing" ? `/apis/${entry.id}` : `/agents/${entry.id}`;
};

export function BreakdownPanel({
  entries,
}: {
  entries: CustomerBreakdownEntry[];
}) {
  const { t } = useTranslation();

  if (entries.length === 0) {
    return (
      <p className="text-ink-muted text-sm">{t("customer.breakdown.empty")}</p>
    );
  }

  return (
    <div className="divide-y divide-overlay/10 overflow-hidden rounded-lg border border-overlay/10">
      {entries.map((entry) => {
        const to = linkFor(entry);
        const label = entry.name ?? t("customer.breakdown.unattributed");

        return (
          <div
            key={`${entry.kind}:${entry.id ?? "none"}`}
            className="flex items-start justify-between gap-3 bg-surface px-4 py-3"
            data-testid={`customer-breakdown-${entry.id ?? "none"}`}
          >
            <div className="flex min-w-0 flex-col gap-1">
              {to ? (
                <Link
                  to={to}
                  className="min-w-0 truncate font-medium text-ink-strong text-sm hover:underline"
                >
                  {label}
                </Link>
              ) : (
                <span className="min-w-0 truncate font-medium text-ink-strong text-sm">
                  {label}
                </span>
              )}

              <div className="flex flex-wrap items-center gap-1.5">
                <Tag size="sm" variant="neutral">
                  {entry.kind === "listing"
                    ? t("customer.breakdown.api")
                    : entry.kind === "agent"
                      ? t("customer.breakdown.agent")
                      : t("customer.breakdown.other")}
                </Tag>
                <span className="text-ink-subtle text-xs">
                  {t("customer.row.txns", { count: entry.txnCount })}
                </span>
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-0.5">
              {entry.volume.length === 0 ? (
                <span className="text-ink-subtle text-sm">—</span>
              ) : (
                entry.volume.map((bucket) => (
                  <span
                    key={`${bucket.network}:${bucket.assetAddress ?? "native"}`}
                    className="font-medium font-mono text-ink-strong text-sm tabular-nums"
                  >
                    {trimAmount(bucket.amount)}
                  </span>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
