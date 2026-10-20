import type { PaymentNetwork, WalletRole } from "@stores/wallet/type";

export interface AssetBalance {
  assetAddress: string;
  symbol: string;
  decimals: number;
  total: string;
  locked: string;
  available: string;
  updatedAt: string | null;
}

export interface WalletBalance {
  id: string;
  label: string;
  address: string;
  role: WalletRole;
  assets: AssetBalance[];
}

export interface BalancesResponse {
  network: PaymentNetwork | null;
  wallets: WalletBalance[];
}

export type BalanceState = BalancesResponse & {
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;
};
