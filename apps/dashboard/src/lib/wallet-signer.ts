import { createWalletClient, custom, getAddress } from "viem";

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: never[]) => void): void;
  removeListener?(event: string, handler: (...args: never[]) => void): void;
}

const provider = (): Eip1193Provider | undefined =>
  (globalThis as { ethereum?: Eip1193Provider }).ethereum;

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

export const connectWallet = async (): Promise<string> => {
  const accounts = await request<string[]>("eth_requestAccounts");
  const [account] = accounts ?? [];
  if (!account) {
    throw new WalletRejectedError();
  }
  return getAddress(account);
};

export const requestAccountSwitch = async (): Promise<string> => {
  try {
    await request("wallet_requestPermissions", [{ eth_accounts: {} }]);
  } catch (error) {
    if (error instanceof WalletRejectedError) {
      throw error;
    }
  }
  return connectWallet();
};

export const currentAccount = async (): Promise<string | null> => {
  if (!provider()) {
    return null;
  }
  try {
    const accounts = await request<string[]>("eth_accounts");
    const [account] = accounts ?? [];
    return account ? getAddress(account) : null;
  } catch {
    return null;
  }
};

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

  const selected = await currentAccount();
  if (selected && selected !== account) {
    throw new WalletAccountChangedError(selected);
  }

  const client = createWalletClient({
    account,
    transport: custom(injected),
  });

  try {
    return await client.signMessage({ account, message });
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

  const accounts = handlers.onAccountsChanged as (...a: never[]) => void;
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
