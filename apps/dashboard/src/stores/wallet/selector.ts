import type { RootState } from "..";
import type { Wallet, WalletFilters, WalletState } from "./type";

export const selectWalletState = (state: RootState): WalletState =>
  state.wallet;

export const selectWallets = (state: RootState): Wallet[] => state.wallet.items;

export const selectWalletTotal = (state: RootState): number =>
  state.wallet.total;

export const selectWalletPage = (state: RootState): number => state.wallet.page;

export const selectWalletLimit = (state: RootState): number =>
  state.wallet.limit;

export const selectWalletFilters = (state: RootState): WalletFilters =>
  state.wallet.filters;

export const selectSelectedWalletIds = (state: RootState): string[] =>
  state.wallet.selectedIds;

export const selectIsWalletSelected =
  (id: string) =>
  (state: RootState): boolean =>
    state.wallet.selectedIds.includes(id);

export const selectIsWalletsLoading = (state: RootState): boolean =>
  state.wallet.isLoading;

export const selectHasLoadedWallets = (state: RootState): boolean =>
  state.wallet.hasLoaded;

export const selectIsWalletPending =
  (key: string) =>
  (state: RootState): boolean =>
    Boolean(state.wallet.pending[key]);

export const selectWalletError = (state: RootState): string | null =>
  state.wallet.error;

export const selectWalletIssues = (state: RootState): Record<string, string> =>
  state.wallet.validationIssues;

/** True only when every row on the current page is ticked. */
export const selectAreAllWalletsSelected = (state: RootState): boolean =>
  state.wallet.items.length > 0 &&
  state.wallet.items.every((item) =>
    state.wallet.selectedIds.includes(item.id),
  );
