import { cn } from "@4mica/ui";
import type { Customer, CustomerOverview } from "@stores/customer/type";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/form";
import { trimAmount } from "../payments/constants";

/**
 * Spend against a limit is an indication, not an accounting figure: this sum
 * crosses assets, and nothing in the payment path enforces the limit.
 */
const rankingTotal = (overview: CustomerOverview): number =>
  overview.recentSpend.reduce((sum, bucket) => sum + Number(bucket.amount), 0);

function LimitRow({
  label,
  limit,
  currency,
  spent,
  testId,
}: {
  label: string;
  limit: string;
  currency: string;
  spent?: number;
  testId: string;
}) {
  const { t } = useTranslation();

  const ceiling = Number(limit);
  const ratio = spent !== undefined && ceiling > 0 ? spent / ceiling : 0;
  const percent = Math.min(Math.round(ratio * 100), 999);
  const over = ratio > 1;

  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-medium text-ink-strong text-sm">{label}</span>
        <span className="shrink-0 font-medium text-ink-strong text-sm">
          {trimAmount(limit)} {currency}
        </span>
      </div>

      {spent !== undefined && (
        <>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-overlay/10">
            <div
              className={cn(
                "h-full rounded-full transition-[width]",
                over ? "bg-danger" : "bg-brand",
              )}
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </div>

          <div className="flex items-baseline justify-between gap-4 text-sm">
            <span className="text-ink-muted">
              {t("customer.limits.spent", {
                amount: trimAmount(String(spent)),
              })}
            </span>
            <span className={over ? "text-danger" : "text-ink-muted"}>
              {over
                ? t("customer.limits.over", { percent })
                : t("customer.limits.within", { percent })}
            </span>
          </div>
        </>
      )}
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

  if (!customer.dailyLimit && !customer.monthlyLimit) {
    return (
      <Card>
        <p className="text-ink-muted text-sm">{t("customer.limits.none")}</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-col gap-5">
        {customer.monthlyLimit && (
          <LimitRow
            label={t("customer.limits.monthly")}
            limit={customer.monthlyLimit}
            currency={customer.limitCurrency}
            spent={overview ? rankingTotal(overview) : undefined}
            testId="customer-limit-monthly"
          />
        )}

        {customer.dailyLimit && (
          <LimitRow
            label={t("customer.limits.daily")}
            limit={customer.dailyLimit}
            currency={customer.limitCurrency}
            testId="customer-limit-daily"
          />
        )}
      </div>
    </Card>
  );
}
