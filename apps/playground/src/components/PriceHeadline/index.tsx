import { messages, t } from "@/i18n";
import { networkInfo } from "@/lib/snippets/networks";
import { trimAmount } from "@/lib/snippets/shared";
import type { PaymentNetwork } from "@/schema/params";

const shortAddress = (address: string): string =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;

export interface PriceHeadlineProps {
  amount: string | null;
  currency: string | null;
  label: string | null;
  assetAddress: string | null;
  network: PaymentNetwork | null;
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

export function PriceHeadline({
  amount,
  currency,
  label,
  assetAddress,
  network,
}: PriceHeadlineProps) {
  const chain = network ? networkInfo(network).label : null;
  const price = amount ? formatAmount(amount, currency) : null;

  const facts = [
    chain,
    assetAddress
      ? `${messages.integration.erc20} ${shortAddress(assetAddress)}`
      : messages.integration.nativeAsset,
    price && label?.includes(price) ? null : label,
  ].filter((fact): fact is string => Boolean(fact));

  if (!price) {
    return (
      <div className="flex flex-col gap-1">
        <span className="font-semibold text-2xl text-ink-strong tracking-tight">
          {label ?? messages.api.priceUnset}
        </span>
        {chain && (
          <span className="text-ink-subtle text-sm">
            {t(messages.api.settlesOn, { network: chain })}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-semibold text-3xl text-ink-strong tabular-nums tracking-tight">
          {price}
        </span>
        <span className="text-ink-muted text-sm">
          {messages.api.perRequest}
        </span>
      </div>

      <span className="text-ink-subtle text-sm">{facts.join(" · ")}</span>
    </div>
  );
}
