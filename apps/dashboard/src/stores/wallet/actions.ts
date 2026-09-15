import actionTypes from "./actionTypes";
import type {
  PaymentNetwork,
  Wallet,
  WalletFilters,
  WalletRole,
  WalletStatus,
} from "./type";

/** Identifies which row is busy, so only that row shows a spinner. */
export interface PendingMeta {
  pendingKey: string;
}

export const fetchWallets = () => ({
  type: actionTypes.FETCH_WALLETS_REQUESTED,
});

export const fetchWalletsPending = () => ({
  type: actionTypes.FETCH_WALLETS_PENDING,
});

export const fetchWalletsSucceeded = (payload: {
  items: Wallet[];
  total: number;
  page: number;
  limit: number;
}) => ({
  type: actionTypes.FETCH_WALLETS_SUCCEEDED,
  payload,
});

export const fetchWalletsFailed = (message: string) => ({
  type: actionTypes.FETCH_WALLETS_FAILED,
  payload: { message },
});

/**
 * The saga owns the whole link flow — request a challenge, ask the wallet to
 * sign it, then create — so the component dispatches once and watches
 * `pending`. `signature` is never in the store.
 */
export const createWallet = (payload: {
  label: string;
  description?: string | null;
  address: string;
  network: PaymentNetwork;
  role: WalletRole;
}) => ({
  type: actionTypes.CREATE_WALLET_REQUESTED,
  payload,
  meta: { pendingKey: "createWallet" },
});

export const createWalletSucceeded = (wallet: Wallet, meta: PendingMeta) => ({
  type: actionTypes.CREATE_WALLET_SUCCEEDED,
  payload: wallet,
  meta,
});

export const updateWallet = (payload: {
  id: string;
  data: Partial<{
    label: string;
    description: string | null;
    role: WalletRole;
    status: WalletStatus;
    isDefault: boolean;
  }>;
}) => ({
  type: actionTypes.UPDATE_WALLET_REQUESTED,
  payload,
  meta: { pendingKey: `wallet:${payload.id}` },
});

export const updateWalletSucceeded = (wallet: Wallet, meta: PendingMeta) => ({
  type: actionTypes.UPDATE_WALLET_SUCCEEDED,
  payload: wallet,
  meta,
});

export const deleteWallet = (payload: { id: string }) => ({
  type: actionTypes.DELETE_WALLET_REQUESTED,
  payload,
  meta: { pendingKey: `wallet:${payload.id}` },
});

export const deleteWalletSucceeded = (id: string, meta: PendingMeta) => ({
  type: actionTypes.DELETE_WALLET_SUCCEEDED,
  payload: { id },
  meta,
});

export const batchDeleteWallets = (payload: { ids: string[] }) => ({
  type: actionTypes.BATCH_DELETE_WALLETS_REQUESTED,
  payload,
  meta: { pendingKey: "batchDeleteWallets" },
});

export const batchDeleteWalletsSucceeded = (
  payload: { deleted: string[]; notFound: string[] },
  meta: PendingMeta,
) => ({
  type: actionTypes.BATCH_DELETE_WALLETS_SUCCEEDED,
  payload,
  meta,
});

/** Any filter change resets to page 1 — see the reducer. */
export const setWalletFilters = (payload: Partial<WalletFilters>) => ({
  type: actionTypes.SET_WALLET_FILTERS,
  payload,
});

export const setWalletPage = (page: number) => ({
  type: actionTypes.SET_WALLET_PAGE,
  payload: { page },
});

export const toggleWalletSelected = (id: string) => ({
  type: actionTypes.TOGGLE_WALLET_SELECTED,
  payload: { id },
});

export const setWalletSelection = (ids: string[]) => ({
  type: actionTypes.SET_WALLET_SELECTION,
  payload: { ids },
});

export const clearWalletSelection = () => ({
  type: actionTypes.CLEAR_WALLET_SELECTION,
});

export const walletActionFailed = (
  message: string,
  issues: Record<string, string>,
  meta: PendingMeta,
) => ({
  type: actionTypes.WALLET_ACTION_FAILED,
  payload: { message, issues },
  meta,
});

export const clearWalletIssues = () => ({
  type: actionTypes.CLEAR_WALLET_ISSUES,
});
