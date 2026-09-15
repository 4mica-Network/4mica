import { HttpMethod } from "@4mica/http";
import type {
  BatchDeleteResult,
  PaymentNetwork,
  Wallet,
  WalletChallenge,
  WalletListResponse,
  WalletRole,
  WalletStatus,
} from "@stores/wallet/type";
import { httpClient } from "./client";

/**
 * The index signature is what `HttpRequestConfig["params"]` expects; the named
 * keys keep callers honest about which params exist.
 */
export interface ListWalletsParams
  extends Record<string, string | number | boolean | undefined> {
  page?: number;
  limit?: number;
  q?: string;
  status?: WalletStatus;
  network?: PaymentNetwork;
  role?: WalletRole;
  sort?: "createdAt" | "-createdAt" | "label" | "-label";
}

export const getWallets = (params: ListWalletsParams = {}) =>
  httpClient.request<WalletListResponse>({
    url: "/me/wallets",
    method: HttpMethod.GET,
    params,
  });

export const getWallet = (id: string) =>
  httpClient.request<Wallet>({
    url: `/me/wallets/${encodeURIComponent(id)}`,
    method: HttpMethod.GET,
  });

/**
 * Step one of linking: the server builds the message and we sign exactly what
 * it returns. The client never composes the text it asks the user to sign.
 */
export const createWalletChallenge = (data: {
  address: string;
  network: PaymentNetwork;
}) =>
  httpClient.request<WalletChallenge, typeof data>({
    url: "/me/wallets/siwe-nonce",
    method: HttpMethod.POST,
    data,
  });

export const createWallet = (data: {
  label: string;
  description?: string | null;
  address: string;
  network: PaymentNetwork;
  role: WalletRole;
  nonce: string;
  signature: string;
}) =>
  httpClient.request<Wallet, typeof data>({
    url: "/me/wallets",
    method: HttpMethod.POST,
    data,
  });

export const updateWallet = (
  id: string,
  data: Partial<{
    label: string;
    description: string | null;
    role: WalletRole;
    status: WalletStatus;
    isDefault: boolean;
  }>,
) =>
  httpClient.request<Wallet, typeof data>({
    url: `/me/wallets/${encodeURIComponent(id)}`,
    method: HttpMethod.PATCH,
    data,
  });

export const deleteWallet = (id: string) =>
  httpClient.request<void>({
    url: `/me/wallets/${encodeURIComponent(id)}`,
    method: HttpMethod.DELETE,
  });

/** POST, not DELETE: the shared HttpClient sends no body on DELETE. */
export const batchDeleteWallets = (ids: string[]) =>
  httpClient.request<BatchDeleteResult, { ids: string[] }>({
    url: "/me/wallets/batch-delete",
    method: HttpMethod.POST,
    data: { ids },
  });
