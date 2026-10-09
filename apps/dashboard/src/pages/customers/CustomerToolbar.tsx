import {
  clearCustomerSelection,
  customerPendingKeys,
  setCustomerFilters,
  setCustomerSelection,
} from "@stores/customer/actions";
import {
  selectAreAllCustomersSelected,
  selectCustomerFilters,
  selectCustomers,
  selectIsCustomerPending,
  selectSelectedCustomerIds,
} from "@stores/customer/selector";
import type {
  CustomerSort,
  CustomerStatus,
  CustomerType,
  PaymentNetwork,
} from "@stores/customer/type";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import { useTranslation } from "react-i18next";
import { ListToolbar } from "@/components/ListToolbar";
import { NETWORK_OPTIONS } from "@/lib/networks";
import { SORT_OPTIONS, STATUS_OPTIONS, TYPE_OPTIONS } from "./constants";

export function CustomerToolbar({
  onBatchDelete,
}: {
  onBatchDelete: () => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const filters = useAppSelector(selectCustomerFilters);
  const selectedIds = useAppSelector(selectSelectedCustomerIds);
  const customers = useAppSelector(selectCustomers);
  const allSelected = useAppSelector(selectAreAllCustomersSelected);
  const isDeleting = useAppSelector(
    selectIsCustomerPending(customerPendingKeys.batchDelete),
  );

  const translated = (
    options: readonly { value: string; titleKey: string }[],
  ) =>
    options.map((option) => ({
      value: option.value,
      title: t(option.titleKey),
    }));

  if (selectedIds.length > 0) {
    return (
      <ListToolbar.SelectionBar
        ns="customer"
        testIdPrefix="customer"
        count={selectedIds.length}
        allSelected={allSelected}
        isDeleting={isDeleting}
        onToggleAll={() =>
          allSelected
            ? dispatch(clearCustomerSelection())
            : dispatch(setCustomerSelection(customers.map((item) => item.id)))
        }
        onBatchDelete={onBatchDelete}
      />
    );
  }

  return (
    <ListToolbar className="sm:flex-col sm:items-start">
      <ListToolbar.Search
        value={filters.q}
        placeholder={t("customer.toolbar.searchPlaceholder")}
        onSearch={(q) => dispatch(setCustomerFilters({ q }))}
        data-testid="customer-search"
      />

      <ListToolbar.Filters>
        <ListToolbar.Filter<CustomerType | "">
          label={t("list.filter.type")}
          className="sm:w-40"
          value={filters.type}
          options={[
            { value: "", title: t("customer.toolbar.allTypes") },
            ...translated(TYPE_OPTIONS),
          ]}
          onChange={(type) => dispatch(setCustomerFilters({ type }))}
          data-testid="customer-type-filter"
        />

        <ListToolbar.Filter<CustomerStatus | "">
          label={t("list.filter.status")}
          className="sm:w-36"
          value={filters.status}
          options={[
            { value: "", title: t("customer.toolbar.allStatuses") },
            ...translated(STATUS_OPTIONS),
          ]}
          onChange={(status) => dispatch(setCustomerFilters({ status }))}
          data-testid="customer-status-filter"
        />

        <ListToolbar.Filter<PaymentNetwork | "">
          label={t("list.filter.network")}
          value={filters.network}
          options={[
            { value: "", title: t("customer.toolbar.allNetworks") },
            ...NETWORK_OPTIONS,
          ]}
          onChange={(network) => dispatch(setCustomerFilters({ network }))}
          data-testid="customer-network-filter"
        />

        <ListToolbar.Filter<CustomerSort>
          label={t("list.sort")}
          className="sm:w-52"
          value={filters.sort}
          options={translated(SORT_OPTIONS)}
          onChange={(sort) =>
            dispatch(setCustomerFilters({ sort: sort || "-totalSpend" }))
          }
          data-testid="customer-sort"
        />
      </ListToolbar.Filters>
    </ListToolbar>
  );
}
