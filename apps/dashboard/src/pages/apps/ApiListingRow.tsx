import { Button, Checkbox, cn, Dropdown, Spinner, Tag } from "@4mica/ui";
import {
  publishApiListing,
  toggleApiListingSelected,
} from "@stores/apiListing/actions";
import {
  selectIsApiListingPending,
  selectIsApiListingSelected,
} from "@stores/apiListing/selector";
import type { ApiListing } from "@stores/apiListing/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  EyeOff,
  Globe,
  MoreHorizontal,
  Pencil,
  Route,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { IntegrationGuideLink } from "@/components/IntegrationGuideLink";
import { NETWORKS, shortenAddress } from "@/lib/networks";
import {
  formatPrice,
  VISIBILITY_LABEL_KEYS,
  VISIBILITY_TAG_VARIANT,
} from "./constants";

const menuItem =
  "flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-overlay/5";

export function ApiListingRow({
  listing,
  onEdit,
  onEditEndpoints,
  onDelete,
}: {
  listing: ApiListing;
  onEdit: (listing: ApiListing) => void;
  onEditEndpoints: (listing: ApiListing) => void;
  onDelete: (listing: ApiListing) => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const isPending = useAppSelector(
    selectIsApiListingPending(`apiListing:${listing.id}`),
  );
  const isSelected = useAppSelector(selectIsApiListingSelected(listing.id));

  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnchor = useRef<HTMLSpanElement>(null);

  const isPayable = listing.network !== null && listing.payToAddress !== null;
  const price = formatPrice(
    listing.priceAmount,
    listing.priceCurrency,
    listing.priceLabel,
  );

  return (
    <div
      className={cn(
        "group flex w-full items-start gap-3 bg-surface px-4 py-3.5 transition-colors",
        isSelected ? "bg-overlay/10" : "hover:bg-overlay/5",
      )}
      data-testid={`api-listing-row-${listing.id}`}
    >
      <Checkbox
        variant="square"
        className="mt-0.5 w-auto shrink-0"
        checked={isSelected}
        onChange={() => dispatch(toggleApiListingSelected(listing.id))}
        data-testid={`api-listing-select-${listing.id}`}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span
          className="min-w-0 truncate font-semibold text-base text-ink-strong"
          data-testid={`api-listing-name-${listing.id}`}
        >
          {listing.name}
        </span>

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
              {NETWORKS[listing.network].label}
            </Tag>
          )}

          {listing.payToAddress && (
            <Tag size="sm" variant="neutral" className="font-mono">
              {shortenAddress(listing.payToAddress)}
            </Tag>
          )}

          <Tag size="sm" variant="neutral">
            {t("apiListing.row.endpointCount", {
              count: listing.endpoints.length,
            })}
          </Tag>
        </div>

        <div className="mt-1.5">
          <IntegrationGuideLink
            kind="api"
            ref={listing.slug}
            visibility={listing.visibility}
            isPayable={isPayable}
            data-testid={`api-listing-guide-${listing.id}`}
          />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5 transition-opacity focus-within:opacity-100 lg:opacity-0 lg:group-hover:opacity-100">
        {isPending && <Spinner size="sm" className="mr-1 text-ink-subtle" />}

        <span ref={menuAnchor} className="inline-flex">
          <Button
            type="button"
            intent="ghost"
            size="sm"
            className="btn-no-lift px-2"
            aria-label={t("apiListing.row.more")}
            aria-expanded={menuOpen}
            disabled={isPending}
            onClick={() => setMenuOpen((open) => !open)}
            data-testid={`api-listing-more-${listing.id}`}
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
            <button
              type="button"
              className={cn(menuItem, "text-ink-body")}
              onClick={() => {
                onEdit(listing);
                setMenuOpen(false);
              }}
              data-testid={`api-listing-edit-${listing.id}`}
            >
              <Pencil className="h-4 w-4" />
              {t("apiListing.row.edit")}
            </button>

            <button
              type="button"
              className={cn(menuItem, "text-ink-body")}
              onClick={() => {
                onEditEndpoints(listing);
                setMenuOpen(false);
              }}
              data-testid={`api-listing-endpoints-${listing.id}`}
            >
              <Route className="h-4 w-4" />
              {t("apiListing.row.editEndpoints")}
            </button>

            {listing.visibility === "PUBLIC" ? (
              <button
                type="button"
                className={cn(menuItem, "text-ink-body")}
                onClick={() => {
                  dispatch(
                    publishApiListing({ id: listing.id, publish: false }),
                  );
                  setMenuOpen(false);
                }}
                data-testid={`api-listing-unpublish-${listing.id}`}
              >
                <EyeOff className="h-4 w-4" />
                {t("apiListing.row.unpublish")}
              </button>
            ) : (
              <button
                type="button"
                className={cn(
                  menuItem,
                  isPayable ? "text-ink-body" : "cursor-not-allowed opacity-50",
                )}
                disabled={!isPayable}
                onClick={() => {
                  dispatch(
                    publishApiListing({ id: listing.id, publish: true }),
                  );
                  setMenuOpen(false);
                }}
                data-testid={`api-listing-publish-${listing.id}`}
              >
                <Globe className="h-4 w-4" />
                {isPayable
                  ? t("apiListing.row.publish")
                  : t("apiListing.row.publishBlocked")}
              </button>
            )}

            <button
              type="button"
              className={cn(menuItem, "text-danger")}
              onClick={() => {
                onDelete(listing);
                setMenuOpen(false);
              }}
              data-testid={`api-listing-delete-${listing.id}`}
            >
              <Trash2 className="h-4 w-4" />
              {t("apiListing.row.delete")}
            </button>
          </div>
        </Dropdown>
      </div>
    </div>
  );
}
