import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ACCOUNT = "0x7A9f3C4B2e8d5a1f6C0b4e9d2a8C3F5B7e1d6A04";
const OTHER = "0x4F2c8b6d1E9A3F5C7b0d2e4a6c8f1B3d5e7a9c02";

type Handler = (args: { method: string; params?: unknown[] }) => unknown;

const fakeProvider = (handler: Handler) => ({
  request: vi.fn(async (args: { method: string; params?: unknown[] }) =>
    handler(args),
  ),
});

const answering = (accounts: string[]) =>
  fakeProvider(({ method }) => {
    if (method === "eth_requestAccounts" || method === "eth_accounts") {
      return accounts;
    }
    if (method === "eth_chainId") {
      return "0x14a34";
    }
    return null;
  });

const announce = (
  provider: unknown,
  info: { rdns?: string; uuid?: string; name?: string; icon?: string },
) => {
  window.dispatchEvent(
    new CustomEvent("eip6963:announceProvider", {
      detail: { info, provider },
    }),
  );
};

const setLegacy = (provider: unknown) => {
  (globalThis as { ethereum?: unknown }).ethereum = provider;
};

const load = () => import("./wallet-signer");

describe("wallet-signer", () => {
  beforeEach(() => {
    vi.resetModules();
    setLegacy(undefined);
  });

  afterEach(() => {
    setLegacy(undefined);
  });

  it("reports no wallet when nothing is injected or announced", async () => {
    const signer = await load();

    expect(signer.hasInjectedWallet()).toBe(false);
    expect(signer.detectedWallets()).toEqual([]);
    await expect(signer.connectWallet()).rejects.toBeInstanceOf(
      signer.NoWalletError,
    );
    expect(await signer.currentAccount()).toBeNull();
    expect(await signer.currentChainId()).toBeNull();
  });

  it("asks installed wallets to announce themselves when it loads", async () => {
    const requested = vi.fn();
    window.addEventListener("eip6963:requestProvider", requested);

    await load();

    expect(requested).toHaveBeenCalled();
    window.removeEventListener("eip6963:requestProvider", requested);
  });

  it("uses the legacy window.ethereum when no wallet announces", async () => {
    const legacy = answering([ACCOUNT.toLowerCase()]);
    setLegacy(legacy);
    const signer = await load();

    expect(signer.hasInjectedWallet()).toBe(true);
    expect(await signer.connectWallet()).toBe(ACCOUNT);
    expect(await signer.currentChainId()).toBe(84532);
  });

  it("prefers the one announced wallet over window.ethereum", async () => {
    const legacy = answering([OTHER]);
    const rabby = answering([ACCOUNT]);
    setLegacy(legacy);
    const signer = await load();
    announce(rabby, { rdns: "io.rabby", name: "Rabby" });

    expect(await signer.connectWallet()).toBe(ACCOUNT);
    expect(legacy.request).not.toHaveBeenCalled();
  });

  it("falls back to window.ethereum between several wallets until one is picked", async () => {
    const legacy = answering([OTHER]);
    const rabby = answering([ACCOUNT]);
    const phantom = answering([OTHER]);
    setLegacy(legacy);
    const signer = await load();
    announce(rabby, { rdns: "io.rabby", name: "Rabby" });
    announce(phantom, { rdns: "app.phantom", name: "Phantom" });

    await signer.connectWallet();
    expect(legacy.request).toHaveBeenCalledTimes(1);

    signer.selectWallet("io.rabby");
    expect(await signer.connectWallet()).toBe(ACCOUNT);
    expect(rabby.request).toHaveBeenCalledTimes(1);
    expect(phantom.request).not.toHaveBeenCalled();

    signer.selectWallet(null);
    await signer.connectWallet();
    expect(legacy.request).toHaveBeenCalledTimes(2);
  });

  it("ignores a selection that names a wallet it never saw", async () => {
    const legacy = answering([ACCOUNT]);
    setLegacy(legacy);
    const signer = await load();

    signer.selectWallet("not.installed");

    expect(await signer.connectWallet()).toBe(ACCOUNT);
  });

  it("lists each wallet once and tells subscribers about late arrivals", async () => {
    const signer = await load();
    const listener = vi.fn();
    const unsubscribe = signer.subscribeWallets(listener);

    announce(answering([]), { rdns: "io.rabby", name: "Rabby" });
    announce(answering([]), { rdns: "io.rabby", name: "Rabby again" });
    announce(answering([]), { uuid: "abc-123", name: "  " });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(signer.detectedWallets()).toEqual([
      { id: "io.rabby", name: "Rabby", icon: null },
      { id: "abc-123", name: "abc-123", icon: null },
    ]);

    unsubscribe();
    announce(answering([]), { rdns: "app.phantom", name: "Phantom" });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(signer.detectedWallets()).toHaveLength(3);
  });

  it("keeps the same list reference until a new wallet arrives", async () => {
    const signer = await load();
    announce(answering([]), { rdns: "io.rabby", name: "Rabby" });

    const first = signer.detectedWallets();
    expect(signer.detectedWallets()).toBe(first);

    announce(answering([]), { rdns: "app.phantom", name: "Phantom" });
    expect(signer.detectedWallets()).not.toBe(first);
  });

  it("drops announcements with no id or no provider", async () => {
    const signer = await load();

    announce(answering([]), { name: "Nameless" });
    announce(undefined, { rdns: "io.ghost", name: "Ghost" });
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider"));

    expect(signer.detectedWallets()).toEqual([]);
    expect(signer.hasInjectedWallet()).toBe(false);
  });

  it("keeps an icon only when it is an inline image", async () => {
    const signer = await load();
    const inline = "data:image/svg+xml;base64,PHN2Zy8+";

    announce(answering([]), { rdns: "a", name: "A", icon: inline });
    announce(answering([]), {
      rdns: "b",
      name: "B",
      icon: "https://tracker.example/pixel.png",
    });
    announce(answering([]), {
      rdns: "c",
      name: "C",
      icon: "data:text/html,<script>1</script>",
    });

    expect(signer.detectedWallets().map((wallet) => wallet.icon)).toEqual([
      inline,
      null,
      null,
    ]);
  });

  it("says the wallet shared no account when it answers with none", async () => {
    setLegacy(answering([]));
    const signer = await load();

    const error = await signer.connectWallet().catch((cause) => cause);

    expect(error).toBeInstanceOf(signer.NoAccountsError);
    expect(error).not.toBeInstanceOf(signer.WalletRejectedError);
  });

  it("treats a null answer like an empty account list", async () => {
    setLegacy(fakeProvider(() => null));
    const signer = await load();

    await expect(signer.connectWallet()).rejects.toBeInstanceOf(
      signer.NoAccountsError,
    );
  });

  it.each([
    4001,
    "ACTION_REJECTED",
  ])("reports a rejection for error code %s", async (code) => {
    setLegacy(
      fakeProvider(() => {
        throw Object.assign(new Error("User rejected"), { code });
      }),
    );
    const signer = await load();

    await expect(signer.connectWallet()).rejects.toBeInstanceOf(
      signer.WalletRejectedError,
    );
  });

  it("passes other wallet errors through untouched", async () => {
    const failure = Object.assign(new Error("Already processing"), {
      code: -32002,
    });
    setLegacy(
      fakeProvider(() => {
        throw failure;
      }),
    );
    const signer = await load();

    await expect(signer.connectWallet()).rejects.toBe(failure);
  });

  it("returns null for the account and chain when the wallet errors", async () => {
    setLegacy(
      fakeProvider(() => {
        throw new Error("locked");
      }),
    );
    const signer = await load();

    expect(await signer.currentAccount()).toBeNull();
    expect(await signer.currentChainId()).toBeNull();
  });

  it("stops the account switch when the permission prompt is rejected", async () => {
    const provider = fakeProvider(({ method }) => {
      if (method === "wallet_requestPermissions") {
        throw Object.assign(new Error("no"), { code: 4001 });
      }
      return [ACCOUNT];
    });
    setLegacy(provider);
    const signer = await load();

    await expect(signer.requestAccountSwitch()).rejects.toBeInstanceOf(
      signer.WalletRejectedError,
    );
    expect(provider.request).toHaveBeenCalledTimes(1);
  });

  it("still reconnects when the wallet has no permission prompt", async () => {
    setLegacy(
      fakeProvider(({ method }) => {
        if (method === "wallet_requestPermissions") {
          throw Object.assign(new Error("unsupported"), { code: -32601 });
        }
        return [ACCOUNT];
      }),
    );
    const signer = await load();

    expect(await signer.requestAccountSwitch()).toEqual([ACCOUNT]);
  });

  it("adds the chain when the wallet does not know it", async () => {
    const provider = fakeProvider(({ method }) => {
      if (method === "wallet_switchEthereumChain") {
        throw Object.assign(new Error("unknown chain"), { code: 4902 });
      }
      return null;
    });
    setLegacy(provider);
    const signer = await load();

    await signer.switchChain({
      chainId: 8453,
      chainName: "Base",
      rpcUrls: ["https://mainnet.base.org"],
      blockExplorerUrls: ["https://basescan.org"],
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    });

    expect(provider.request).toHaveBeenLastCalledWith({
      method: "wallet_addEthereumChain",
      params: [expect.objectContaining({ chainId: "0x2105" })],
    });
  });

  it("reports a rejected chain switch without trying to add the chain", async () => {
    const provider = fakeProvider(() => {
      throw Object.assign(new Error("no"), { code: 4001 });
    });
    setLegacy(provider);
    const signer = await load();

    await expect(
      signer.switchChain({
        chainId: 8453,
        chainName: "Base",
        rpcUrls: [],
        blockExplorerUrls: [],
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      }),
    ).rejects.toBeInstanceOf(signer.WalletRejectedError);
    expect(provider.request).toHaveBeenCalledTimes(1);
  });

  it("signs through the wallet that was picked", async () => {
    const signature = `0x${"ab".repeat(65)}`;
    const rabby = fakeProvider(({ method }) => {
      if (method === "eth_accounts") {
        return [ACCOUNT];
      }
      if (method === "personal_sign") {
        return signature;
      }
      return null;
    });
    const phantom = answering([OTHER]);
    setLegacy(phantom);
    const signer = await load();
    announce(phantom, { rdns: "app.phantom", name: "Phantom" });
    announce(rabby, { rdns: "io.rabby", name: "Rabby" });
    signer.selectWallet("io.rabby");

    expect(await signer.signMessage(ACCOUNT, "hello")).toBe(signature);
    expect(phantom.request).not.toHaveBeenCalled();
    expect(rabby.request.mock.calls.map(([args]) => args.method)).toContain(
      "personal_sign",
    );
  });

  it("refuses to sign when the wallet moved to another account", async () => {
    const provider = answering([OTHER]);
    setLegacy(provider);
    const signer = await load();

    const error = await signer.signMessage(ACCOUNT, "hello").catch((e) => e);

    expect(error).toBeInstanceOf(signer.WalletAccountChangedError);
    expect(error.current).toBe(OTHER);
    expect(
      provider.request.mock.calls.map(([args]) => args.method),
    ).not.toContain("personal_sign");
  });

  it("reports a rejected signature", async () => {
    setLegacy(
      fakeProvider(({ method }) => {
        if (method === "eth_accounts") {
          return [ACCOUNT];
        }
        throw Object.assign(new Error("User denied"), { code: 4001 });
      }),
    );
    const signer = await load();

    await expect(signer.signMessage(ACCOUNT, "hello")).rejects.toBeInstanceOf(
      signer.WalletRejectedError,
    );
  });

  it("listens on the picked wallet and stops when asked", async () => {
    const on = vi.fn();
    const removeListener = vi.fn();
    const rabby = { ...answering([ACCOUNT]), on, removeListener };
    const signer = await load();
    announce(rabby, { rdns: "io.rabby", name: "Rabby" });
    const onAccountsChanged = vi.fn();
    const onChainChanged = vi.fn();

    const stop = signer.watchWallet({ onAccountsChanged, onChainChanged });

    const wrapped = on.mock.calls.find(
      ([event]) => event === "accountsChanged",
    )?.[1];
    wrapped([ACCOUNT.toLowerCase(), 7]);
    expect(onAccountsChanged).toHaveBeenCalledWith([ACCOUNT]);
    expect(on).toHaveBeenCalledWith("chainChanged", onChainChanged);

    stop();
    expect(removeListener).toHaveBeenCalledWith("accountsChanged", wrapped);
    expect(removeListener).toHaveBeenCalledWith("chainChanged", onChainChanged);
  });

  it("watches nothing when the wallet cannot emit events", async () => {
    setLegacy(answering([ACCOUNT]));
    const signer = await load();

    expect(() =>
      signer.watchWallet({ onAccountsChanged: vi.fn() })(),
    ).not.toThrow();
  });

  it("returns every account the wallet shares, not only the first", async () => {
    setLegacy(answering([ACCOUNT.toLowerCase(), OTHER.toLowerCase()]));
    const signer = await load();

    expect(await signer.connectAccounts()).toEqual([ACCOUNT, OTHER]);
    expect(await signer.currentAccounts()).toEqual([ACCOUNT, OTHER]);
    expect(await signer.requestAccountSwitch()).toEqual([ACCOUNT, OTHER]);
  });

  it("signs for a shared account even when it is not the wallet's first", async () => {
    const signature = `0x${"cd".repeat(65)}`;
    const provider = fakeProvider(({ method }) =>
      method === "personal_sign" ? signature : [ACCOUNT, OTHER],
    );
    setLegacy(provider);
    const signer = await load();

    expect(await signer.signMessage(OTHER, "hello")).toBe(signature);
    expect(provider.request.mock.calls.at(-1)?.[0].params?.[1]).toBe(OTHER);
  });
});
