import { Button, InputField, Select, Spinner } from "@4mica/ui";
import {
  clearCustomerSelection,
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
import { useDebounceEffect } from "ahooks";
import { Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
    selectIsCustomerPending("batchDeleteCustomers"),
  );

  const [search, setSearch] = useState(filters.q);

  useEffect(() => {
    setSearch(filters.q);
  }, [filters.q]);

  useDebounceEffect(
    () => {
      if (search !== filters.q) {
        dispatch(setCustomerFilters({ q: search }));
      }
    },
    [search],
    { wait: 450 },
  );

  if (selectedIds.length > 0) {
    return (
      <div
        className="flex flex-col gap-3 rounded-lg border border-brand/40 bg-overlay/5 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between"
        data-testid="customer-selection-bar"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium text-ink-strong text-sm">
            {t("customer.toolbar.selected", { count: selectedIds.length })}
          </span>
          <button
            type="button"
            className="rounded-md text-ink-subtle text-xs transition-colors hover:text-ink-body"
            onClick={() =>
              allSelected
                ? dispatch(clearCustomerSelection())
                : dispatch(
                    setCustomerSelection(customers.map((item) => item.id)),
                  )
            }
          >
            {allSelected
              ? t("customer.toolbar.clearSelection")
              : t("customer.toolbar.selectAll")}
          </button>
        </div>

        <Button
          type="button"
          intent="ghost"
          size="sm"
          className="btn-no-lift shrink-0 self-start text-danger sm:self-auto"
          disabled={isDeleting}
          onClick={onBatchDelete}
          data-testid="customer-batch-delete"
        >
          <span className="flex items-center gap-2 text-sm">
            {isDeleting ? (
              <Spinner size="sm" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {t("customer.toolbar.deleteSelected")}
          </span>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="min-w-0 sm:w-80">
        <InputField
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("customer.toolbar.searchPlaceholder")}
          aria-label={t("customer.toolbar.searchPlaceholder")}
          icon={<Search className="h-4 w-4 text-ink-subtle" />}
          maxLength={100}
          data-testid="customer-search"
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="w-full sm:w-40">
          <Select
            value={filters.type}
            options={[
              { value: "", title: t("customer.toolbar.allTypes") },
              ...TYPE_OPTIONS.map((option) => ({
                value: option.value,
                title: t(option.titleKey),
              })),
            ]}
            onChange={(option) =>
              dispatch(
                setCustomerFilters({
                  type: (option?.value ?? "") as CustomerType | "",
                }),
              )
            }
            data-testid="customer-type-filter"
          />
        </div>

        <div className="w-full sm:w-36">
          <Select
            value={filters.status}
            options={[
              { value: "", title: t("customer.toolbar.allStatuses") },
              ...STATUS_OPTIONS.map((option) => ({
                value: option.value,
                title: t(option.titleKey),
              })),
            ]}
            onChange={(option) =>
              dispatch(
                setCustomerFilters({
                  status: (option?.value ?? "") as CustomerStatus | "",
                }),
              )
            }
            data-testid="customer-status-filter"
          />
        </div>

        <div className="w-full sm:w-44">
          <Select
            value={filters.network}
            options={[
              { value: "", title: t("customer.toolbar.allNetworks") },
              ...NETWORK_OPTIONS,
            ]}
            onChange={(option) =>
              dispatch(
                setCustomerFilters({
                  network: (option?.value ?? "") as PaymentNetwork | "",
                }),
              )
            }
            data-testid="customer-network-filter"
          />
        </div>

        <div className="w-full sm:w-52">
          <Select
            value={filters.sort}
            options={SORT_OPTIONS.map((option) => ({
              value: option.value,
              title: t(option.titleKey),
            }))}
            onChange={(option) =>
              dispatch(
                setCustomerFilters({
                  sort: (option?.value ?? "-totalSpend") as CustomerSort,
                }),
              )
            }
            data-testid="customer-sort"
          />
        </div>
      </div>
    </div>
  );
}
