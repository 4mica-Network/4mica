import { trimAmount } from "@4mica/rules";
import { messages } from "@/i18n";

export interface PriceHeadlineProps {
  amount: string | null;
  currency: string | null;
  label: string | null;
}

const formatAmount = (amount: string, currency: string | null): string => {
  const value = trimAmount(amount);

  if (!currency) {
    return value;
  }

  return currency.toUpperCase() === "USD"
    ? `$${value}`
    : `${value} ${currency.toUpperCase()}`;
};

export const pricingNote = ({
  amount,
  currency,
  label,
}: PriceHeadlineProps): string | null => {
  if (!amount || !label) {
    return null;
  }

  return label.includes(formatAmount(amount, currency)) ? null : label;
};

export function PriceHeadline({ amount, currency, label }: PriceHeadlineProps) {
  if (!amount) {
    return (
      <span className="font-semibold text-2xl text-ink-strong tracking-tight">
        {label ?? messages.api.priceUnset}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="font-semibold text-3xl text-ink-strong tabular-nums tracking-tight">
        {formatAmount(amount, currency)}
      </span>
      <span className="text-ink-muted text-sm">{messages.api.perRequest}</span>
    </div>
  );
}
