import { createWalletClient, custom, getAddress } from "viem";

/**
 * Minimal EIP-1193 bridge for the one signature the link flow needs.
 *
 * Deliberately not wagmi or AppKit: neither is a dashboard dependency, and this
 * flow wants a single `personal_sign`, not a connection manager with its own
 * React tree, storage and reconnect lifecycle.
 */
interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: never[]) => void): void;
  removeListener?(event: string, handler: (...args: never[]) => void): void;
}

const provider = (): Eip1193Provider | undefined =>
  (globalThis as { ethereum?: Eip1193Provider }).ethereum;

export const hasInjectedWallet = (): boolean => Boolean(provider());

/** No browser wallet is installed, so there is nothing to connect to. */
export class NoWalletError extends Error {
  constructor() {
    super("No browser wallet was detected.");
    this.name = "NoWalletError";
  }
}

/** The user dismissed the connect, switch or signing prompt. Not a failure. */
export class WalletRejectedError extends Error {
  constructor() {
    super("The wallet request was rejected.");
    this.name = "WalletRejectedError";
  }
}

/**
 * The wallet's selected account moved after we captured it.
 *
 * Worth its own error: signing would otherwise either fail deep inside the
 * provider with an opaque message, or — worse — succeed for an address the
 * user never chose to link.
 */
export class WalletAccountChangedError extends Error {
  constructor(readonly current: string | null) {
    super("The wallet's selected account changed.");
    this.name = "WalletAccountChangedError";
  }
}

/** EIP-1193 userRejectedRequest. */
const isUserRejection = (error: unknown): boolean => {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 4001 || code === "ACTION_REJECTED";
};

/** EIP-1193 "chain has not been added to the wallet". */
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

/**
 * Prompts for accounts and returns the first one, EIP-55 checksummed.
 *
 * Checksummed rather than lowercased because this value is shown to the user
 * and posted to the API, whose validator rejects a bad checksum — normalizing
 * to lowercase here would throw that check away.
 */
export const connectWallet = async (): Promise<string> => {
  const accounts = await request<string[]>("eth_requestAccounts");
  const [account] = accounts ?? [];
  if (!account) {
    throw new WalletRejectedError();
  }
  return getAddress(account);
};

/**
 * Reopens the wallet's account picker and returns whatever is selected after.
 *
 * `eth_requestAccounts` is no use for this: once the site already holds the
 * permission it resolves immediately with the current account and shows no UI
 * at all, so a "switch account" button built on it silently does nothing.
 * `wallet_requestPermissions` re-prompts, which is the only way to let someone
 * pick a different address without leaving the page.
 */
export const requestAccountSwitch = async (): Promise<string> => {
  try {
    await request("wallet_requestPermissions", [{ eth_accounts: {} }]);
  } catch (error) {
    if (error instanceof WalletRejectedError) {
      throw error;
    }
    // Not every wallet implements the permissions RPC. Falling through to the
    // plain request at least keeps the flow working, even if no picker opens.
  }
  return connectWallet();
};

/** The already-authorized account, if any, without prompting. */
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

/** The chain the wallet is currently pointed at, as a decimal chain id. */
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

/**
 * Points the wallet at `chain`, adding it first if the wallet has never heard
 * of it.
 *
 * Testnets in particular are usually absent from a fresh MetaMask, and a bare
 * `wallet_switchEthereumChain` fails with 4902 rather than offering to add
 * them — which reads to the user as "this is broken".
 */
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

/**
 * Signs `message` exactly as given.
 *
 * The string comes from the server and is never rebuilt here — the whole point
 * of the challenge is that the user signs text the server can verify byte for
 * byte.
 */
export const signMessage = async (
  address: string,
  message: string,
): Promise<string> => {
  const injected = provider();
  if (!injected) {
    throw new NoWalletError();
  }

  const account = getAddress(address);

  // Re-check immediately before signing. The user may have switched accounts in
  // the wallet since they connected, and signing with a different key than the
  // one they are linking is a silent mismatch worth catching here.
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

/**
 * Subscribes to wallet account and chain changes.
 *
 * Returns a cleanup function; a provider that exposes no `on` yields a no-op,
 * so callers need no capability check of their own.
 */
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
