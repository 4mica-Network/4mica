import { Checkbox, cn, Tag } from "@4mica/ui";
import { toggleCustomerSelected } from "@stores/customer/actions";
import { selectIsCustomerSelected } from "@stores/customer/selector";
import type { Customer } from "@stores/customer/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { NETWORKS, shortenAddress } from "@/lib/networks";
import {
  STATUS_LABEL_KEYS,
  STATUS_TAG_VARIANT,
  TYPE_LABEL_KEYS,
} from "./constants";

export function CustomerRow({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const isSelected = useAppSelector(selectIsCustomerSelected(customer.id));

  const wallet = customer.identities.find(
    (identity) => identity.type === "WALLET",
  );

  return (
    <div
      className={cn(
        "group relative flex w-full cursor-pointer items-start gap-3 bg-surface px-4 py-3.5 transition-colors",
        isSelected ? "bg-overlay/10" : "hover:bg-overlay/5",
      )}
      data-testid={`customer-row-${customer.id}`}
    >
      <Checkbox
        variant="square"
        className="relative z-10 mt-0.5 w-auto shrink-0"
        checked={isSelected}
        onChange={() => dispatch(toggleCustomerSelected(customer.id))}
        data-testid={`customer-select-${customer.id}`}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          className="min-w-0 truncate font-semibold text-base text-ink-strong outline-none after:absolute after:inset-0 focus-visible:underline"
          data-testid={`customer-name-${customer.id}`}
          to={`/customers/${customer.id}`}
        >
          {customer.name}
        </Link>

        {customer.email && (
          <p className="min-w-0 truncate text-ink-muted text-sm">
            {customer.email}
          </p>
        )}

        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
          <Tag size="sm" variant={STATUS_TAG_VARIANT[customer.status]}>
            {t(STATUS_LABEL_KEYS[customer.status])}
          </Tag>

          <Tag size="sm" variant="neutral">
            {t(TYPE_LABEL_KEYS[customer.type])}
          </Tag>

          {wallet?.network && (
            <Tag size="sm" variant="neutral">
              {NETWORKS[wallet.network].label}
            </Tag>
          )}

          {wallet?.address && (
            <Tag size="sm" variant="neutral" className="font-mono">
              {shortenAddress(wallet.address)}
            </Tag>
          )}

          {customer.identities.length > 1 && (
            <Tag size="sm" variant="neutral">
              {t("customer.row.moreIdentities", {
                count: customer.identities.length - 1,
              })}
            </Tag>
          )}
        </div>
      </div>
    </div>
  );
}
