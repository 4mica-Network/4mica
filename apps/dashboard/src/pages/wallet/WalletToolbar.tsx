import { useAppDispatch, useAppSelector } from "@stores/hooks";
import {
  clearWalletSelection,
  setWalletFilters,
  setWalletSelection,
  walletPendingKeys,
} from "@stores/wallet/actions";
import {
  selectAreAllWalletsSelected,
  selectIsWalletPending,
  selectSelectedWalletIds,
  selectWalletFilters,
  selectWallets,
} from "@stores/wallet/selector";
import type { PaymentNetwork, WalletStatus } from "@stores/wallet/type";
import { useTranslation } from "react-i18next";
import { ListToolbar } from "@/components/ListToolbar";
import { NETWORK_OPTIONS } from "@/lib/networks";

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
    selectIsWalletPending(walletPendingKeys.batchDelete),
  );

  if (selectedIds.length > 0) {
    return (
      <ListToolbar.SelectionBar
        ns="wallet"
        testIdPrefix="wallet"
        count={selectedIds.length}
        allSelected={allSelected}
        isDeleting={isDeleting}
        onToggleAll={() =>
          allSelected
            ? dispatch(clearWalletSelection())
            : dispatch(setWalletSelection(wallets.map((w) => w.id)))
        }
        onBatchDelete={onBatchDelete}
      />
    );
  }

  return (
    <ListToolbar>
      <ListToolbar.Search
        value={filters.q}
        placeholder={t("wallet.toolbar.searchPlaceholder")}
        onSearch={(q) => dispatch(setWalletFilters({ q }))}
        data-testid="wallet-search"
      />

      <ListToolbar.Filters>
        <ListToolbar.Filter<WalletStatus | "">
          label={t("list.filter.status")}
          className="sm:w-40"
          value={filters.status}
          options={[
            { value: "", title: t("wallet.toolbar.allStatuses") },
            { value: "ACTIVE", title: t("wallet.status.active") },
            { value: "PAUSED", title: t("wallet.status.paused") },
            { value: "RETIRED", title: t("wallet.status.retired") },
          ]}
          onChange={(status) => dispatch(setWalletFilters({ status }))}
          data-testid="wallet-status-filter"
        />

        <ListToolbar.Filter<PaymentNetwork | "">
          label={t("list.filter.network")}
          value={filters.network}
          options={[
            { value: "", title: t("wallet.toolbar.allNetworks") },
            ...NETWORK_OPTIONS,
          ]}
          onChange={(network) => dispatch(setWalletFilters({ network }))}
          data-testid="wallet-network-filter"
        />
      </ListToolbar.Filters>
    </ListToolbar>
  );
}
