import { cn, Tag, Tooltip } from "@4mica/ui";
import type { Payment } from "@stores/payment/type";
import { ArrowDownLeft, ArrowUpRight, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import { explorerAddressUrl, NETWORKS, shortenAddress } from "@/lib/networks";
import {
  formatWhen,
  STATUS_LABEL_KEYS,
  STATUS_TAG_VARIANT,
  trimAmount,
} from "./constants";

export function PaymentRow({ payment }: { payment: Payment }) {
  const { t } = useTranslation();

  const received = payment.direction === "received";
  const counterparty = received
    ? payment.payerAddress
    : payment.recipientAddress;
  const label =
    payment.listingName ??
    payment.agentName ??
    payment.description ??
    t("payment.row.untitled");

  return (
    <div
      className="flex w-full items-start gap-3 bg-surface px-4 py-3.5 transition-colors hover:bg-overlay/5"
      data-testid={`payment-row-${payment.id}`}
    >
      <div
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          received ? "bg-success/10" : "bg-overlay/10",
        )}
      >
        {received ? (
          <ArrowDownLeft className="h-4 w-4 text-success" />
        ) : (
          <ArrowUpRight className="h-4 w-4 text-ink-muted" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span
            className="min-w-0 truncate font-medium text-ink-strong text-sm"
            data-testid={`payment-label-${payment.id}`}
          >
            {label}
          </span>
          <span className="shrink-0 text-ink-subtle text-xs">
            {received ? t("payment.row.from") : t("payment.row.to")}{" "}
            <Tooltip title={counterparty} placement="bottom">
              <span className="font-mono">{shortenAddress(counterparty)}</span>
            </Tooltip>
          </span>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <Tag size="sm" variant={STATUS_TAG_VARIANT[payment.status]}>
            {t(STATUS_LABEL_KEYS[payment.status])}
          </Tag>
          <Tag size="sm" variant="neutral">
            {NETWORKS[payment.network].label}
          </Tag>
          <span className="text-ink-subtle text-xs">
            {formatWhen(payment.settledAt ?? payment.createdAt)}
          </span>
          {payment.resource && (
            <a
              href={payment.resource}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-ink-subtle text-xs transition-colors hover:text-ink-body"
            >
              {t("payment.row.resource")}
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {payment.status === "FAILED" && payment.failureReason && (
          <p className="text-danger text-xs">{payment.failureReason}</p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span
          className={cn(
            "font-mono font-semibold text-sm tabular-nums",
            received ? "text-success" : "text-ink-strong",
          )}
          data-testid={`payment-amount-${payment.id}`}
        >
          {received ? "+" : "−"}
          {trimAmount(payment.amount)}
        </span>
        <a
          href={explorerAddressUrl(payment.network, counterparty)}
          target="_blank"
          rel="noreferrer noopener"
          className="text-ink-subtle text-xs transition-colors hover:text-ink-body"
        >
          {payment.assetAddress
            ? t("payment.row.erc20")
            : t("payment.row.native")}
        </a>
      </div>
    </div>
  );
}
