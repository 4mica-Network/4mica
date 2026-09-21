import { Button, InputField, Select, Spinner } from "@4mica/ui";
import {
  clearApiListingSelection,
  setApiListingFilters,
  setApiListingSelection,
} from "@stores/apiListing/actions";
import {
  selectApiListingFilters,
  selectApiListings,
  selectAreAllApiListingsSelected,
  selectIsApiListingPending,
  selectSelectedApiListingIds,
} from "@stores/apiListing/selector";
import type { PaymentNetwork, PublicVisibility } from "@stores/apiListing/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { useDebounceEffect } from "ahooks";
import { Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NETWORK_OPTIONS } from "@/lib/networks";

export function ApiListingToolbar({
  onBatchDelete,
}: {
  onBatchDelete: () => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const filters = useAppSelector(selectApiListingFilters);
  const selectedIds = useAppSelector(selectSelectedApiListingIds);
  const listings = useAppSelector(selectApiListings);
  const allSelected = useAppSelector(selectAreAllApiListingsSelected);
  const isDeleting = useAppSelector(
    selectIsApiListingPending("batchDeleteApiListings"),
  );

  const [search, setSearch] = useState(filters.q);

  useEffect(() => {
    setSearch(filters.q);
  }, [filters.q]);

  useDebounceEffect(
    () => {
      if (search !== filters.q) {
        dispatch(setApiListingFilters({ q: search }));
      }
    },
    [search],
    { wait: 450 },
  );

  if (selectedIds.length > 0) {
    return (
      <div
        className="flex flex-col gap-3 rounded-lg border border-brand/40 bg-overlay/5 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between"
        data-testid="api-listing-selection-bar"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium text-ink-strong text-sm">
            {t("apiListing.toolbar.selected", { count: selectedIds.length })}
          </span>
          <button
            type="button"
            className="rounded-md text-ink-subtle text-xs transition-colors hover:text-ink-body"
            onClick={() =>
              allSelected
                ? dispatch(clearApiListingSelection())
                : dispatch(
                    setApiListingSelection(listings.map((item) => item.id)),
                  )
            }
          >
            {allSelected
              ? t("apiListing.toolbar.clearSelection")
              : t("apiListing.toolbar.selectAll")}
          </button>
        </div>

        <Button
          type="button"
          intent="ghost"
          size="sm"
          className="btn-no-lift shrink-0 self-start text-danger sm:self-auto"
          disabled={isDeleting}
          onClick={onBatchDelete}
          data-testid="api-listing-batch-delete"
        >
          <span className="flex items-center gap-2 text-sm">
            {isDeleting ? (
              <Spinner size="sm" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {t("apiListing.toolbar.deleteSelected")}
          </span>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="min-w-0 sm:w-80">
        <InputField
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("apiListing.toolbar.searchPlaceholder")}
          aria-label={t("apiListing.toolbar.searchPlaceholder")}
          icon={<Search className="h-4 w-4 text-ink-subtle" />}
          maxLength={100}
          data-testid="api-listing-search"
        />
      </div>

      <div className="flex gap-3">
        <div className="w-full sm:w-40">
          <Select
            value={filters.visibility}
            options={[
              { value: "", title: t("apiListing.toolbar.allVisibilities") },
              { value: "PRIVATE", title: t("apiListing.visibility.private") },
              {
                value: "UNLISTED",
                title: t("apiListing.visibility.unlisted"),
              },
              { value: "PUBLIC", title: t("apiListing.visibility.public") },
            ]}
            onChange={(option) =>
              dispatch(
                setApiListingFilters({
                  visibility: (option?.value ?? "") as PublicVisibility | "",
                }),
              )
            }
            data-testid="api-listing-visibility-filter"
          />
        </div>

        <div className="w-full sm:w-44">
          <Select
            value={filters.network}
            options={[
              { value: "", title: t("apiListing.toolbar.allNetworks") },
              ...NETWORK_OPTIONS,
            ]}
            onChange={(option) =>
              dispatch(
                setApiListingFilters({
                  network: (option?.value ?? "") as PaymentNetwork | "",
                }),
              )
            }
            data-testid="api-listing-network-filter"
          />
        </div>
      </div>
    </div>
  );
}
