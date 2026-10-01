import { Button, Checkbox, cn, Dropdown, Spinner, Tag } from "@4mica/ui";
import { toggleCustomerSelected } from "@stores/customer/actions";
import {
  selectIsCustomerPending,
  selectIsCustomerSelected,
} from "@stores/customer/selector";
import type { Customer, SpendBucket } from "@stores/customer/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { NETWORKS, shortenAddress } from "@/lib/networks";
import { trimAmount } from "../payments/constants";
import {
  STATUS_LABEL_KEYS,
  STATUS_TAG_VARIANT,
  TYPE_LABEL_KEYS,
} from "./constants";

const menuItem =
  "flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-overlay/5";

const relativeWhen = (iso: string | null, never: string): string => {
  if (!iso) {
    return never;
  }

  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);

  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  if (minutes < 60 * 24) {
    return `${Math.round(minutes / 60)}h ago`;
  }
  return `${Math.round(minutes / (60 * 24))}d ago`;
};

function Spend({ buckets, empty }: { buckets: SpendBucket[]; empty: string }) {
  if (buckets.length === 0) {
    return <span className="text-ink-subtle text-sm">{empty}</span>;
  }

  return (
    <span className="flex flex-col items-end gap-0.5">
      {buckets.map((bucket) => (
        <span
          key={`${bucket.network}:${bucket.assetAddress ?? "native"}`}
          className="font-medium font-mono text-ink-strong text-sm tabular-nums"
        >
          {trimAmount(bucket.amount)}
        </span>
      ))}
    </span>
  );
}

export function CustomerRow({
  customer,
  onDelete,
}: {
  customer: Customer;
  onDelete: (customer: Customer) => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const isPending = useAppSelector(
    selectIsCustomerPending(`customer:${customer.id}`),
  );
  const isSelected = useAppSelector(selectIsCustomerSelected(customer.id));

  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnchor = useRef<HTMLSpanElement>(null);

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

      <div className="hidden shrink-0 flex-col items-end gap-0.5 pr-2 sm:flex">
        <Spend
          buckets={customer.totalSpend}
          empty={t("customer.row.noSpend")}
        />
        <span className="text-ink-subtle text-xs">
          {t("customer.row.txns", { count: customer.txnCount })}
        </span>
        <span className="text-ink-subtle text-xs">
          {relativeWhen(customer.lastActiveAt, t("customer.row.neverActive"))}
        </span>
      </div>

      <div className="relative z-10 flex shrink-0 items-center gap-0.5 transition-opacity focus-within:opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
        {isPending && <Spinner size="sm" className="mr-1 text-ink-subtle" />}

        <span ref={menuAnchor} className="inline-flex">
          <Button
            type="button"
            intent="ghost"
            size="sm"
            className="btn-no-lift px-2"
            aria-label={t("customer.row.more")}
            aria-expanded={menuOpen}
            disabled={isPending}
            onClick={() => setMenuOpen((open) => !open)}
            data-testid={`customer-more-${customer.id}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </span>

        <Dropdown
          isOpen={menuOpen}
          anchorRef={menuAnchor}
          placement="bottomRight"
          onClickOutside={() => setMenuOpen(false)}
        >
          <div className="flex w-60 flex-col py-1">
            <Link
              className={cn(menuItem, "text-ink-body")}
              data-testid={`customer-edit-${customer.id}`}
              onClick={() => setMenuOpen(false)}
              to={`/customers/${customer.id}`}
            >
              <Pencil className="h-4 w-4" />
              {t("customer.row.edit")}
            </Link>

            <button
              type="button"
              className={cn(menuItem, "text-danger")}
              onClick={() => {
                onDelete(customer);
                setMenuOpen(false);
              }}
              data-testid={`customer-delete-${customer.id}`}
            >
              <Trash2 className="h-4 w-4" />
              {t("customer.row.delete")}
            </button>
          </div>
        </Dropdown>
      </div>
    </div>
  );
}
