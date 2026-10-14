import { formatPrice, PAYMENT_NETWORKS, shortenAddress } from "@4mica/rules";
import { Checkbox, cn, Spinner, Tag } from "@4mica/ui";
import {
  apiListingPendingKeys,
  publishApiListing,
  toggleApiListingSelected,
} from "@stores/apiListing/actions";
import {
  selectIsApiListingPending,
  selectIsApiListingSelected,
} from "@stores/apiListing/selector";
import type { ApiListing } from "@stores/apiListing/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { EyeOff, Globe, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { RowActionsMenu } from "@/components/RowActionsMenu";
import { VISIBILITY_LABEL_KEYS, VISIBILITY_TAG_VARIANT } from "./constants";

export function ApiListingRow({
  listing,
  onDelete,
}: {
  listing: ApiListing;
  onDelete: (listing: ApiListing) => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const isPending = useAppSelector(
    selectIsApiListingPending(apiListingPendingKeys.row(listing.id)),
  );
  const isSelected = useAppSelector(selectIsApiListingSelected(listing.id));

  const isPayable = listing.network !== null && listing.payToAddress !== null;
  const price = formatPrice(
    listing.priceAmount,
    listing.priceCurrency,
    listing.priceLabel,
  );

  return (
    <div
      className={cn(
        "group relative flex w-full cursor-pointer items-start gap-3 bg-surface px-4 py-3.5 transition-colors",
        isSelected ? "bg-overlay/10" : "hover:bg-overlay/5",
      )}
      data-testid={`api-listing-row-${listing.id}`}
    >
      <Checkbox
        aria-label={t("apiListing.row.select", { name: listing.name })}
        variant="square"
        className="relative z-10 mt-0.5 w-auto shrink-0"
        checked={isSelected}
        onChange={() => dispatch(toggleApiListingSelected(listing.id))}
        data-testid={`api-listing-select-${listing.id}`}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link
          className="min-w-0 truncate font-semibold text-base text-ink-strong outline-none after:absolute after:inset-0 focus-visible:underline"
          data-testid={`api-listing-name-${listing.id}`}
          to={`/apis/${listing.id}`}
        >
          {listing.name}
        </Link>

        {listing.summary && (
          <p className="min-w-0 truncate text-ink-muted text-sm">
            {listing.summary}
          </p>
        )}

        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
          <Tag size="sm" variant={VISIBILITY_TAG_VARIANT[listing.visibility]}>
            {t(VISIBILITY_LABEL_KEYS[listing.visibility])}
          </Tag>

          {price && (
            <Tag size="sm" variant="neutral">
              {t("apiListing.row.perCall", { price })}
            </Tag>
          )}

          {listing.network && (
            <Tag size="sm" variant="neutral">
              {PAYMENT_NETWORKS[listing.network].label}
            </Tag>
          )}

          {listing.payToAddress && (
            <Tag size="sm" variant="neutral" className="font-mono">
              {shortenAddress(listing.payToAddress)}
            </Tag>
          )}

          <Tag className="font-mono" size="sm" variant="neutral">
            {listing.method}
          </Tag>
        </div>
      </div>

      <div className="relative z-10 flex shrink-0 items-center gap-0.5 transition-opacity focus-within:opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
        {isPending && <Spinner size="sm" className="mr-1 text-ink-subtle" />}

        <RowActionsMenu
          label={t("apiListing.row.more", { name: listing.name })}
          disabled={isPending}
          data-testid={`api-listing-more-${listing.id}`}
        >
          <RowActionsMenu.RouteItem
            icon={Pencil}
            to={`/apis/${listing.id}`}
            data-testid={`api-listing-edit-${listing.id}`}
          >
            {t("apiListing.row.edit")}
          </RowActionsMenu.RouteItem>

          {listing.visibility === "PUBLIC" ? (
            <RowActionsMenu.Item
              icon={EyeOff}
              onSelect={() =>
                dispatch(publishApiListing({ id: listing.id, publish: false }))
              }
              data-testid={`api-listing-unpublish-${listing.id}`}
            >
              {t("apiListing.row.unpublish")}
            </RowActionsMenu.Item>
          ) : (
            <RowActionsMenu.Item
              icon={Globe}
              disabled={!isPayable}
              onSelect={() =>
                dispatch(publishApiListing({ id: listing.id, publish: true }))
              }
              data-testid={`api-listing-publish-${listing.id}`}
            >
              {isPayable
                ? t("apiListing.row.publish")
                : t("apiListing.row.publishBlocked")}
            </RowActionsMenu.Item>
          )}

          <RowActionsMenu.Item
            icon={Trash2}
            tone="danger"
            onSelect={() => onDelete(listing)}
            data-testid={`api-listing-delete-${listing.id}`}
          >
            {t("apiListing.row.delete")}
          </RowActionsMenu.Item>
        </RowActionsMenu>
      </div>
    </div>
  );
}
