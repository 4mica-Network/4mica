import {
  apiListingPendingKeys,
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
import { useTranslation } from "react-i18next";
import { ListToolbar } from "@/components/ListToolbar";
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
    selectIsApiListingPending(apiListingPendingKeys.batchDelete),
  );

  const selectionBar =
    selectedIds.length > 0 ? (
      <ListToolbar.SelectionBar
        ns="apiListing"
        testIdPrefix="api-listing"
        count={selectedIds.length}
        allSelected={allSelected}
        isDeleting={isDeleting}
        onToggleAll={() =>
          allSelected
            ? dispatch(clearApiListingSelection())
            : dispatch(setApiListingSelection(listings.map((item) => item.id)))
        }
        onBatchDelete={onBatchDelete}
      />
    ) : undefined;

  return (
    <ListToolbar>
      <ListToolbar.Search
        value={filters.q}
        placeholder={t("apiListing.toolbar.searchPlaceholder")}
        onSearch={(q) => dispatch(setApiListingFilters({ q }))}
        data-testid="api-listing-search"
      />

      <ListToolbar.Filters overlay={selectionBar}>
        <ListToolbar.Filter<PublicVisibility | "">
          label={t("list.filter.visibility")}
          value={filters.visibility}
          options={[
            { value: "", title: t("apiListing.toolbar.allVisibilities") },
            { value: "PRIVATE", title: t("apiListing.visibility.private") },
            { value: "UNLISTED", title: t("apiListing.visibility.unlisted") },
            { value: "PUBLIC", title: t("apiListing.visibility.public") },
          ]}
          onChange={(visibility) =>
            dispatch(setApiListingFilters({ visibility }))
          }
          data-testid="api-listing-visibility-filter"
        />

        <ListToolbar.Filter<PaymentNetwork | "">
          label={t("list.filter.network")}
          value={filters.network}
          options={[
            { value: "", title: t("apiListing.toolbar.allNetworks") },
            ...NETWORK_OPTIONS,
          ]}
          onChange={(network) => dispatch(setApiListingFilters({ network }))}
          data-testid="api-listing-network-filter"
        />
      </ListToolbar.Filters>
    </ListToolbar>
  );
}
