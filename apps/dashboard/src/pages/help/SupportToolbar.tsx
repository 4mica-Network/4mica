import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  clearSupportSelection,
  setSupportFilters,
  setSupportSelection,
  supportPendingKeys,
} from "@stores/support/actions";
import {
  selectAreAllSupportRequestsSelected,
  selectIsSupportPending,
  selectSelectedSupportIds,
  selectSupportFilters,
  selectSupportRequests,
} from "@stores/support/selector";
import type { SupportCategory, SupportStatus } from "@stores/support/type";
import { useTranslation } from "react-i18next";
import { ListToolbar } from "@/components/ListToolbar";
import { useConfigList } from "@/hooks/useConfigOptions";
import { categoryLabelKey, STATUS_LABEL_KEYS } from "./constants";

export function SupportToolbar({
  onBatchDelete,
}: {
  onBatchDelete: () => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const filters = useAppSelector(selectSupportFilters);
  const selectedIds = useAppSelector(selectSelectedSupportIds);
  const requests = useAppSelector(selectSupportRequests);
  const allSelected = useAppSelector(selectAreAllSupportRequestsSelected);
  const isDeleting = useAppSelector(
    selectIsSupportPending(supportPendingKeys.batchDelete),
  );
  const categories = useConfigList("supportCategories");

  const selectionBar =
    selectedIds.length > 0 ? (
      <ListToolbar.SelectionBar
        ns="help"
        testIdPrefix="support"
        count={selectedIds.length}
        allSelected={allSelected}
        isDeleting={isDeleting}
        onToggleAll={() =>
          allSelected
            ? dispatch(clearSupportSelection())
            : dispatch(setSupportSelection(requests.map((item) => item.id)))
        }
        onBatchDelete={onBatchDelete}
      />
    ) : undefined;

  return (
    <ListToolbar>
      <ListToolbar.Search
        value={filters.q}
        placeholder={t("help.toolbar.searchPlaceholder")}
        onSearch={(q) => dispatch(setSupportFilters({ q }))}
        data-testid="support-search"
      />

      <ListToolbar.Filters overlay={selectionBar}>
        <ListToolbar.Filter<SupportStatus | "">
          label={t("list.filter.status")}
          value={filters.status}
          options={[
            { value: "", title: t("help.toolbar.allStatuses") },
            ...Object.entries(STATUS_LABEL_KEYS).map(([value, key]) => ({
              value,
              title: t(key),
            })),
          ]}
          onChange={(status) => dispatch(setSupportFilters({ status }))}
          data-testid="support-status-filter"
        />

        <ListToolbar.Filter<SupportCategory | "">
          label={t("help.toolbar.category")}
          value={filters.category}
          options={[
            { value: "", title: t("help.toolbar.allCategories") },
            ...categories.map((value) => ({
              value,
              title: t(categoryLabelKey(value)),
            })),
          ]}
          onChange={(category) => dispatch(setSupportFilters({ category }))}
          data-testid="support-category-filter"
        />
      </ListToolbar.Filters>
    </ListToolbar>
  );
}
