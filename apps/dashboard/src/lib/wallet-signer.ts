import { getAddress } from "viem";

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: never[]) => void): void;
  removeListener?(event: string, handler: (...args: never[]) => void): void;
}

export interface DetectedWallet {
  id: string;
  name: string;
  icon: string | null;
}

interface AnnouncedWallet extends DetectedWallet {
  provider: Eip1193Provider;
}

const announced = new Map<string, AnnouncedWallet>();
const walletListeners = new Set<() => void>();
let selectedWalletId: string | null = null;
let snapshot: DetectedWallet[] = [];

const onAnnounce = (event: Event) => {
  const detail = (
    event as CustomEvent<{
      info?: { rdns?: string; uuid?: string; name?: string; icon?: string };
      provider?: Eip1193Provider;
    }>
  ).detail;
  const id = detail?.info?.rdns ?? detail?.info?.uuid;
  if (!id || !detail?.provider || announced.has(id)) {
    return;
  }
  const icon = detail.info?.icon;
  announced.set(id, {
    id,
    name: detail.info?.name?.trim() || id,
    icon: icon?.startsWith("data:image/") ? icon : null,
    provider: detail.provider,
  });
  snapshot = [...announced.values()].map(({ id, name, icon }) => ({
    id,
    name,
    icon,
  }));
  for (const listener of walletListeners) {
    listener();
  }
};

if (typeof window !== "undefined") {
  window.addEventListener("eip6963:announceProvider", onAnnounce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

export const detectedWallets = (): DetectedWallet[] => snapshot;

export const subscribeWallets = (listener: () => void): (() => void) => {
  walletListeners.add(listener);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  return () => {
    walletListeners.delete(listener);
  };
};

export const selectWallet = (id: string | null): void => {
  selectedWalletId = id;
};

const provider = (): Eip1193Provider | undefined => {
  const chosen = selectedWalletId ? announced.get(selectedWalletId) : null;
  if (chosen) {
    return chosen.provider;
  }
  if (announced.size === 1) {
    return [...announced.values()][0].provider;
  }
  return (globalThis as { ethereum?: Eip1193Provider }).ethereum;
};

export const hasInjectedWallet = (): boolean => Boolean(provider());

export class NoWalletError extends Error {
  constructor() {
    super("No browser wallet was detected.");
    this.name = "NoWalletError";
  }
}

export class WalletRejectedError extends Error {
  constructor() {
    super("The wallet request was rejected.");
    this.name = "WalletRejectedError";
  }
}

export class NoAccountsError extends Error {
  constructor() {
    super("The wallet returned no accounts.");
    this.name = "NoAccountsError";
  }
}

export class WalletAccountChangedError extends Error {
  constructor(readonly current: string | null) {
    super("The wallet's selected account changed.");
    this.name = "WalletAccountChangedError";
  }
}

const isUserRejection = (error: unknown): boolean => {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 4001 || code === "ACTION_REJECTED";
};

const isUnrecognizedChain = (error: unknown): boolean => {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 4902 || code === -32603;
};

const request = async <T>(method: string, params?: unknown[]): Promise<T> => {
  const injected = provider();
  if (!injected) {
    throw new NoWalletError();
  }
  try {
    return (await injected.request({ method, params })) as T;
  } catch (error) {
    if (isUserRejection(error)) {
      throw new WalletRejectedError();
    }
    throw error;
  }
};

const toAccounts = (raw: unknown): string[] =>
  Array.isArray(raw)
    ? raw
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => getAddress(entry))
    : [];

export const connectAccounts = async (): Promise<string[]> => {
  const accounts = toAccounts(await request("eth_requestAccounts"));
  if (accounts.length === 0) {
    throw new NoAccountsError();
  }
  return accounts;
};

export const connectWallet = async (): Promise<string> =>
  (await connectAccounts())[0];

export const requestAccountSwitch = async (): Promise<string[]> => {
  try {
    await request("wallet_requestPermissions", [{ eth_accounts: {} }]);
  } catch (error) {
    if (error instanceof WalletRejectedError) {
      throw error;
    }
  }
  return connectAccounts();
};

export const currentAccounts = async (): Promise<string[]> => {
  if (!provider()) {
    return [];
  }
  try {
    return toAccounts(await request("eth_accounts"));
  } catch {
    return [];
  }
};

export const currentAccount = async (): Promise<string | null> =>
  (await currentAccounts())[0] ?? null;

export const currentChainId = async (): Promise<number | null> => {
  if (!provider()) {
    return null;
  }
  try {
    const hex = await request<string>("eth_chainId");
    const parsed = Number.parseInt(hex, 16);
    return Number.isNaN(parsed) ? null : parsed;
  } catch {
    return null;
  }
};

export interface ChainDefinition {
  chainId: number;
  chainName: string;
  rpcUrls: string[];
  blockExplorerUrls: string[];
  nativeCurrency: { name: string; symbol: string; decimals: number };
}

export const switchChain = async (chain: ChainDefinition): Promise<void> => {
  const chainIdHex = `0x${chain.chainId.toString(16)}`;

  try {
    await request("wallet_switchEthereumChain", [{ chainId: chainIdHex }]);
    return;
  } catch (error) {
    if (!isUnrecognizedChain(error)) {
      throw error;
    }
  }

  await request("wallet_addEthereumChain", [
    {
      chainId: chainIdHex,
      chainName: chain.chainName,
      rpcUrls: chain.rpcUrls,
      blockExplorerUrls: chain.blockExplorerUrls,
      nativeCurrency: chain.nativeCurrency,
    },
  ]);
};

export const signMessage = async (
  address: string,
  message: string,
): Promise<string> => {
  const injected = provider();
  if (!injected) {
    throw new NoWalletError();
  }

  const account = getAddress(address);

  const shared = await currentAccounts();
  if (shared.length > 0 && !shared.includes(account)) {
    throw new WalletAccountChangedError(shared[0]);
  }

  const { signWithInjectedWallet } = await import("./wallet-client");

  try {
    return await signWithInjectedWallet(injected, account, message);
  } catch (error) {
    if (isUserRejection(error)) {
      throw new WalletRejectedError();
    }
    throw error;
  }
};

export const watchWallet = (handlers: {
  onAccountsChanged?: (accounts: string[]) => void;
  onChainChanged?: (chainIdHex: string) => void;
}): (() => void) => {
  const injected = provider();
  if (!injected?.on || !injected.removeListener) {
    return () => {};
  }

  const { onAccountsChanged } = handlers;
  const accounts = (onAccountsChanged
    ? (raw: unknown) => onAccountsChanged(toAccounts(raw))
    : undefined) as unknown as (...a: never[]) => void;
  const chain = handlers.onChainChanged as (...a: never[]) => void;

  if (accounts) {
    injected.on("accountsChanged", accounts);
  }
  if (chain) {
    injected.on("chainChanged", chain);
  }

  return () => {
    if (accounts) {
      injected.removeListener?.("accountsChanged", accounts);
    }
    if (chain) {
      injected.removeListener?.("chainChanged", chain);
    }
  };
};
