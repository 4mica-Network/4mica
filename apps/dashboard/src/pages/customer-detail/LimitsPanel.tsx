import { cn } from "@4mica/ui";
import type { Customer, CustomerOverview } from "@stores/customer/type";
import { useTranslation } from "react-i18next";
import { trimAmount } from "../payments/constants";

const rankingTotal = (customer: CustomerOverview, recent: boolean): number =>
  (recent ? customer.recentSpend : customer.totalSpend).reduce(
    (sum, bucket) => sum + Number(bucket.amount),
    0,
  );

function Meter({
  label,
  spent,
  limit,
  currency,
  testId,
}: {
  label: string;
  spent: number;
  limit: string;
  currency: string;
  testId: string;
}) {
  const { t } = useTranslation();

  const ceiling = Number(limit);
  const ratio = ceiling > 0 ? spent / ceiling : 0;
  const percent = Math.min(Math.round(ratio * 100), 999);
  const over = ratio > 1;

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium text-ink-strong text-sm">{label}</span>
        <span className="font-mono text-ink-muted text-xs tabular-nums">
          {trimAmount(String(spent))} / {trimAmount(limit)} {currency}
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-overlay/10">
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            over ? "bg-danger" : "bg-brand",
          )}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>

      <span className={cn("text-xs", over ? "text-danger" : "text-ink-subtle")}>
        {over
          ? t("customer.limits.over", { percent })
          : t("customer.limits.within", { percent })}
      </span>
    </div>
  );
}

export function LimitsPanel({
  customer,
  overview,
}: {
  customer: Customer;
  overview: CustomerOverview | null;
}) {
  const { t } = useTranslation();

  const hasLimits = Boolean(customer.dailyLimit || customer.monthlyLimit);

  if (!hasLimits) {
    return (
      <p className="text-ink-muted text-sm">{t("customer.limits.none")}</p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {customer.monthlyLimit && (
        <Meter
          label={t("customer.limits.monthly")}
          spent={overview ? rankingTotal(overview, true) : 0}
          limit={customer.monthlyLimit}
          currency={customer.limitCurrency}
          testId="customer-limit-monthly"
        />
      )}

      {customer.dailyLimit && (
        <div
          className="flex items-baseline justify-between gap-3"
          data-testid="customer-limit-daily"
        >
          <span className="font-medium text-ink-strong text-sm">
            {t("customer.limits.daily")}
          </span>
          <span className="font-mono text-ink-muted text-xs tabular-nums">
            {trimAmount(customer.dailyLimit)} {customer.limitCurrency}
          </span>
        </div>
      )}

      <p className="text-ink-subtle text-xs">{t("customer.limits.advisory")}</p>
    </div>
  );
}
