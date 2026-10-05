import { Button, InputField, Select, Spinner } from "@4mica/ui";
import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  clearWalletSelection,
  setWalletFilters,
  setWalletSelection,
} from "@stores/wallet/actions";
import {
  selectAreAllWalletsSelected,
  selectIsWalletPending,
  selectSelectedWalletIds,
  selectWalletFilters,
  selectWallets,
} from "@stores/wallet/selector";
import type { PaymentNetwork, WalletStatus } from "@stores/wallet/type";
import { useDebounceEffect } from "ahooks";
import { Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { NETWORK_OPTIONS } from "./constants";

export function WalletToolbar({
  onBatchDelete,
}: {
  onBatchDelete: () => void;
}) {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  const filters = useAppSelector(selectWalletFilters);
  const selectedIds = useAppSelector(selectSelectedWalletIds);
  const wallets = useAppSelector(selectWallets);
  const allSelected = useAppSelector(selectAreAllWalletsSelected);
  const isDeleting = useAppSelector(
    selectIsWalletPending("batchDeleteWallets"),
  );

  const [search, setSearch] = useState(filters.q);

  useEffect(() => {
    setSearch(filters.q);
  }, [filters.q]);

  useDebounceEffect(
    () => {
      if (search !== filters.q) {
        dispatch(setWalletFilters({ q: search }));
      }
    },
    [search],
    { wait: 450 },
  );

  if (selectedIds.length > 0) {
    return (
      <div
        className="flex flex-col gap-3 rounded-lg border border-brand/40 bg-overlay/5 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between"
        data-testid="wallet-selection-bar"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium text-ink-strong text-sm">
            {t("wallet.toolbar.selected", { count: selectedIds.length })}
          </span>
          <button
            type="button"
            className="rounded-md text-ink-subtle text-xs transition-colors hover:text-ink-body"
            onClick={() =>
              allSelected
                ? dispatch(clearWalletSelection())
                : dispatch(setWalletSelection(wallets.map((w) => w.id)))
            }
          >
            {allSelected
              ? t("wallet.toolbar.clearSelection")
              : t("wallet.toolbar.selectAll")}
          </button>
        </div>

        <Button
          type="button"
          intent="ghost"
          size="sm"
          className="btn-no-lift shrink-0 self-start text-danger sm:self-auto"
          disabled={isDeleting}
          onClick={onBatchDelete}
          data-testid="wallet-batch-delete"
        >
          <span className="flex items-center gap-2 text-sm">
            {isDeleting ? (
              <Spinner size="sm" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {t("wallet.toolbar.deleteSelected")}
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
          placeholder={t("wallet.toolbar.searchPlaceholder")}
          aria-label={t("wallet.toolbar.searchPlaceholder")}
          icon={<Search className="h-4 w-4 text-ink-subtle" />}
          maxLength={100}
          data-testid="wallet-search"
        />
      </div>

      <div className="flex gap-3">
        <div className="w-full sm:w-40">
          <Select
            value={filters.status}
            options={[
              { value: "", title: t("wallet.toolbar.allStatuses") },
              { value: "ACTIVE", title: t("wallet.status.active") },
              { value: "PAUSED", title: t("wallet.status.paused") },
              { value: "RETIRED", title: t("wallet.status.retired") },
            ]}
            onChange={(option) =>
              dispatch(
                setWalletFilters({
                  status: (option?.value ?? "") as WalletStatus | "",
                }),
              )
            }
            data-testid="wallet-status-filter"
          />
        </div>

        <div className="w-full sm:w-44">
          <Select
            value={filters.network}
            options={[
              { value: "", title: t("wallet.toolbar.allNetworks") },
              ...NETWORK_OPTIONS,
            ]}
            onChange={(option) =>
              dispatch(
                setWalletFilters({
                  network: (option?.value ?? "") as PaymentNetwork | "",
                }),
              )
            }
            data-testid="wallet-network-filter"
          />
        </div>
      </div>
    </div>
  );
}
