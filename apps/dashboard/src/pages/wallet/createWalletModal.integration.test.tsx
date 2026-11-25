import { act, fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { getWallets, createWalletChallenge, createWalletRequest } = vi.hoisted(
  () => ({
    getWallets: vi.fn(),
    createWalletChallenge: vi.fn(),
    createWalletRequest: vi.fn(),
  }),
);

vi.mock("@api/wallet", () => ({
  getWallets,
  getWallet: vi.fn(),
  createWalletChallenge,
  createWallet: createWalletRequest,
  updateWallet: vi.fn(),
  deleteWallet: vi.fn(),
  batchDeleteWallets: vi.fn(),
}));

const { notifyError, notifySuccess } = vi.hoisted(() => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}));
vi.mock("@/lib/notify", () => ({ notifyError, notifySuccess }));

const { store } = await import("@stores/index");
const { CreateWalletModal } = await import("./CreateWalletModal");

const KEYS = [
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
] as const;
const [ALICE, BOB, CAROL] = KEYS.map((key) => privateKeyToAccount(key));
const signers = new Map(
  [ALICE, BOB, CAROL].map((account) => [
    account.address.toLowerCase(),
    account,
  ]),
);

const CHALLENGE =
  "localhost wants you to link a wallet (wallet-link) to 4Mica.";

const rpcError = (code: number, message: string) =>
  Object.assign(new Error(message), { code });

interface Behaviour {
  accounts: string[];
  onConnect: string[];
  connect: "ok" | "empty" | "reject" | "fail";
  permissions: "noop" | "reject" | "unsupported" | string[];
  chainId: number;
  sign: "ok" | "reject";
}

const makeWallet = () => {
  const listeners: Record<string, ((payload: unknown) => void)[]> = {};
  const wallet = {
    calls: [] as string[],
    behaviour: {} as Behaviour,
    reset() {
      wallet.calls = [];
      wallet.behaviour = {
        accounts: [],
        onConnect: [],
        connect: "ok",
        permissions: "noop",
        chainId: 84532,
        sign: "ok",
      };
    },
    emit(event: string, payload: unknown) {
      for (const listener of listeners[event] ?? []) {
        listener(payload);
      }
    },
    provider: {
      async request({
        method,
        params,
      }: {
        method: string;
        params?: unknown[];
      }) {
        const b = wallet.behaviour;
        wallet.calls.push(method);
        switch (method) {
          case "eth_accounts":
            return b.accounts.map((a) => a.toLowerCase());
          case "eth_chainId":
            return `0x${b.chainId.toString(16)}`;
          case "eth_requestAccounts":
            if (b.connect === "reject") {
              throw rpcError(4001, "User rejected the request.");
            }
            if (b.connect === "fail") {
              throw rpcError(-32000, "Wallet is busy.");
            }
            if (b.connect === "empty") {
              return [];
            }
            if (b.accounts.length === 0) {
              b.accounts = b.onConnect;
            }
            return b.accounts.map((a) => a.toLowerCase());
          case "wallet_requestPermissions":
            if (b.permissions === "reject") {
              throw rpcError(4001, "User rejected the request.");
            }
            if (b.permissions === "unsupported") {
              throw rpcError(-32601, "Method not found.");
            }
            if (Array.isArray(b.permissions)) {
              b.accounts = b.permissions;
            }
            return [{ parentCapability: "eth_accounts" }];
          case "wallet_switchEthereumChain": {
            const [target] = params as [{ chainId: string }];
            b.chainId = Number.parseInt(target.chainId, 16);
            wallet.emit("chainChanged", target.chainId);
            return null;
          }
          case "personal_sign": {
            if (b.sign === "reject") {
              throw rpcError(4001, "User denied message signature.");
            }
            const [message, address] = params as [`0x${string}`, string];
            const signer = signers.get(address.toLowerCase());
            if (!signer) {
              throw rpcError(-32000, "Unknown account.");
            }
            return signer.signMessage({ message: { raw: message } });
          }
          default:
            throw rpcError(-32601, `Unsupported method ${method}`);
        }
      },
      on(event: string, listener: (payload: unknown) => void) {
        listeners[event] = [...(listeners[event] ?? []), listener];
      },
      removeListener(event: string, listener: (payload: unknown) => void) {
        listeners[event] = (listeners[event] ?? []).filter(
          (entry) => entry !== listener,
        );
      },
    },
  };
  wallet.reset();
  return wallet;
};

const legacy = makeWallet();
const rabby = makeWallet();
const phantom = makeWallet();

const announce = (
  wallet: ReturnType<typeof makeWallet>,
  id: string,
  name: string,
) => {
  act(() => {
    window.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", {
        detail: {
          info: { rdns: id, uuid: id, name },
          provider: wallet.provider,
        },
      }),
    );
  });
};

const open = () =>
  render(
    <Provider store={store}>
      <CreateWalletModal isOpen onClose={onClose} />
    </Provider>,
  );

const onClose = vi.fn();
const connectButtons = () => screen.queryAllByTestId("create-wallet-connect");
const shownAddress = () => screen.findByTestId("create-wallet-address");
const alertText = async () => (await screen.findByRole("alert")).textContent;

const finish = async () => {
  fireEvent.click(screen.getByTestId("create-wallet-continue"));
  fireEvent.click(await screen.findByTestId("create-wallet-submit"));
};

beforeEach(() => {
  for (const wallet of [legacy, rabby, phantom]) {
    wallet.reset();
  }
  onClose.mockClear();
  notifyError.mockClear();
  notifySuccess.mockClear();
  getWallets.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
  createWalletChallenge.mockReset();
  createWalletChallenge.mockResolvedValue({
    nonce: "nonce-1",
    message: CHALLENGE,
  });
  createWalletRequest.mockReset();
  // Stands in for the backend: accept only a signature that really recovers
  // to the address being linked, exactly as apps/be does with verifyMessage.
  createWalletRequest.mockImplementation(
    async (data: { address: `0x${string}`; signature: `0x${string}` }) => {
      const valid = await verifyMessage({
        address: data.address,
        message: CHALLENGE,
        signature: data.signature,
      });
      if (!valid) {
        throw new Error("invalid_signature");
      }
      return { id: "w-new", ...data };
    },
  );
});

describe("add a wallet with no wallet installed", () => {
  it("shows the install prompt and no connect button", () => {
    open();

    expect(
      screen.getByText("No browser wallet detected. Install one to continue."),
    ).toBeInTheDocument();
    expect(connectButtons()).toHaveLength(0);
    expect(screen.getByRole("link", { name: "MetaMask" })).toHaveAttribute(
      "href",
      "https://metamask.io/download",
    );
    expect(screen.getByRole("link", { name: "Rabby" })).toHaveAttribute(
      "href",
      "https://rabby.io",
    );
    expect(screen.getByTestId("create-wallet-continue")).toBeDisabled();
  });
});

describe("add a wallet with only a legacy window.ethereum", () => {
  beforeAll(() => {
    (globalThis as { ethereum?: unknown }).ethereum = legacy.provider;
  });

  it("offers a white, unnamed connect button plus install links", () => {
    open();

    const [button] = connectButtons();
    expect(connectButtons()).toHaveLength(1);
    expect(button).toHaveTextContent("Connect wallet");
    expect(button).toHaveClass("btn-invert");
    expect(button).not.toHaveClass("btn-outline");
    expect(screen.getByRole("link", { name: "MetaMask" })).toBeInTheDocument();
  });

  it("does not call a provider that shares no account a dismissal", async () => {
    legacy.behaviour.connect = "empty";
    open();
    fireEvent.click(connectButtons()[0]);

    expect(await alertText()).toBe(
      "Your wallet didn't share an account. Unlock it or finish setting it up, then try again.",
    );
    expect(screen.queryByText(/You dismissed/)).not.toBeInTheDocument();
    expect(connectButtons()[0]).toBeEnabled();
    expect(screen.getByTestId("create-wallet-continue")).toBeDisabled();
  });

  it("reports a rejected connection and allows a retry that succeeds", async () => {
    legacy.behaviour.connect = "reject";
    legacy.behaviour.onConnect = [ALICE.address];
    open();
    fireEvent.click(connectButtons()[0]);

    expect(await alertText()).toBe(
      "You dismissed the request, so nothing was added.",
    );

    legacy.behaviour.connect = "ok";
    fireEvent.click(connectButtons()[0]);

    expect(await shownAddress()).toHaveTextContent(ALICE.address);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reports an unexpected wallet error as unreachable", async () => {
    legacy.behaviour.connect = "fail";
    open();
    fireEvent.click(connectButtons()[0]);

    expect(await alertText()).toBe("Couldn't reach your wallet. Try again.");
  });

  it("connects, checksums the address, shows the network and enables Continue", async () => {
    legacy.behaviour.onConnect = [ALICE.address];
    open();
    fireEvent.click(connectButtons()[0]);

    expect(await shownAddress()).toHaveTextContent(ALICE.address);
    expect(screen.getAllByText("Base Sepolia").length).toBeGreaterThan(0);
    expect(screen.getByTestId("create-wallet-continue")).toBeEnabled();
  });

  it("adopts an account the site can already see without prompting", async () => {
    legacy.behaviour.accounts = [ALICE.address];
    open();

    expect(await shownAddress()).toHaveTextContent(ALICE.address);
    expect(legacy.calls).not.toContain("eth_requestAccounts");
  });

  it("switch account moves to the newly shared account and offers both", async () => {
    legacy.behaviour.accounts = [ALICE.address];
    // Like MetaMask: the previously selected account stays first.
    legacy.behaviour.permissions = [ALICE.address, BOB.address];
    open();
    await shownAddress();

    fireEvent.click(screen.getByTestId("create-wallet-switch-account"));

    await vi.waitFor(async () => {
      expect(await shownAddress()).toHaveTextContent(BOB.address);
    });
    expect(
      screen.getByTestId(`create-wallet-account-${BOB.address}`),
    ).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(
      screen.getByTestId(`create-wallet-account-${ALICE.address}`),
    );
    expect(await shownAddress()).toHaveTextContent(ALICE.address);
  });

  it("switch account explains itself when the wallet stays put, then follows the wallet", async () => {
    legacy.behaviour.accounts = [ALICE.address];
    open();
    await shownAddress();

    fireEvent.click(screen.getByTestId("create-wallet-switch-account"));

    expect(
      await screen.findByTestId("create-wallet-same-account"),
    ).toHaveTextContent(
      "Your wallet is still on this account. Choose another account in your wallet extension and it will update here.",
    );
    expect(await shownAddress()).toHaveTextContent(ALICE.address);

    legacy.behaviour.accounts = [BOB.address];
    act(() => legacy.emit("accountsChanged", [BOB.address.toLowerCase()]));

    await vi.waitFor(async () => {
      expect(await shownAddress()).toHaveTextContent(BOB.address);
    });
    expect(
      screen.queryByTestId("create-wallet-same-account"),
    ).not.toBeInTheDocument();
  });

  it("switch account survives a wallet with no permission prompt", async () => {
    legacy.behaviour.accounts = [ALICE.address];
    legacy.behaviour.permissions = "unsupported";
    open();
    await shownAddress();

    fireEvent.click(screen.getByTestId("create-wallet-switch-account"));

    expect(
      await screen.findByTestId("create-wallet-same-account"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("rejecting the account switch keeps the current account", async () => {
    legacy.behaviour.accounts = [ALICE.address];
    legacy.behaviour.permissions = "reject";
    open();
    await shownAddress();

    fireEvent.click(screen.getByTestId("create-wallet-switch-account"));

    expect(await alertText()).toBe(
      "You dismissed the request, so nothing was added.",
    );
    expect(await shownAddress()).toHaveTextContent(ALICE.address);
    expect(screen.getByTestId("create-wallet-continue")).toBeEnabled();
  });

  it("keeps the account picked here when the wallet only reorders nothing", async () => {
    legacy.behaviour.accounts = [ALICE.address];
    legacy.behaviour.permissions = [ALICE.address, BOB.address];
    open();
    await shownAddress();
    fireEvent.click(screen.getByTestId("create-wallet-switch-account"));
    await vi.waitFor(async () => {
      expect(await shownAddress()).toHaveTextContent(BOB.address);
    });

    // The wallet shares a third account; its own selection is unchanged.
    act(() =>
      legacy.emit("accountsChanged", [
        ALICE.address,
        BOB.address,
        CAROL.address,
      ]),
    );

    expect(
      await screen.findByTestId(`create-wallet-account-${CAROL.address}`),
    ).toBeInTheDocument();
    expect(await shownAddress()).toHaveTextContent(BOB.address);
  });

  it("returns to the connect button when the wallet disconnects", async () => {
    legacy.behaviour.accounts = [ALICE.address];
    open();
    await shownAddress();

    legacy.behaviour.accounts = [];
    act(() => legacy.emit("accountsChanged", []));

    await vi.waitFor(() => {
      expect(connectButtons()).toHaveLength(1);
    });
    expect(screen.getByTestId("create-wallet-continue")).toBeDisabled();
  });

  it("flags an unsupported network and switches when one is picked", async () => {
    legacy.behaviour.accounts = [ALICE.address];
    legacy.behaviour.chainId = 137;
    open();
    await shownAddress();

    expect(await screen.findByText("Unsupported network")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("create-wallet-network-BASE"));

    await vi.waitFor(() => {
      expect(screen.queryByText("Unsupported network")).not.toBeInTheDocument();
    });
    expect(legacy.calls).toContain("wallet_switchEthereumChain");
    expect(legacy.behaviour.chainId).toBe(8453);
  });

  it("blocks an address already added on the chosen network", async () => {
    legacy.behaviour.accounts = [ALICE.address];
    store.dispatch({
      type: (await import("@stores/wallet/actionTypes")).default
        .FETCH_WALLETS_SUCCEEDED,
      payload: {
        items: [
          {
            id: "w1",
            address: ALICE.address.toLowerCase(),
            network: "BASE_SEPOLIA",
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      },
    });
    open();
    await shownAddress();

    expect(await alertText()).toMatch(/already added on this network/);
    expect(screen.getByTestId("create-wallet-continue")).toBeDisabled();

    store.dispatch({
      type: (await import("@stores/wallet/actionTypes")).default
        .FETCH_WALLETS_SUCCEEDED,
      payload: { items: [], total: 0, page: 1, limit: 20 },
    });
  });

  it("links the wallet with a signature the backend check accepts", async () => {
    legacy.behaviour.onConnect = [ALICE.address];
    open();
    fireEvent.click(connectButtons()[0]);
    await shownAddress();

    await finish();

    await vi.waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(createWalletChallenge).toHaveBeenCalledWith({
      address: ALICE.address,
      network: "BASE_SEPOLIA",
    });
    expect(createWalletRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        address: ALICE.address,
        network: "BASE_SEPOLIA",
        nonce: "nonce-1",
        role: "BOTH",
      }),
    );
    await expect(
      createWalletRequest.mock.results[0].value,
    ).resolves.toMatchObject({ id: "w-new" });
    expect(notifySuccess).toHaveBeenCalled();
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("links the account chosen here even when it is not the wallet's first", async () => {
    legacy.behaviour.accounts = [ALICE.address];
    legacy.behaviour.permissions = [ALICE.address, BOB.address];
    open();
    await shownAddress();
    fireEvent.click(screen.getByTestId("create-wallet-switch-account"));
    await vi.waitFor(async () => {
      expect(await shownAddress()).toHaveTextContent(BOB.address);
    });

    await finish();

    await vi.waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(createWalletRequest).toHaveBeenCalledWith(
      expect.objectContaining({ address: BOB.address }),
    );
    await expect(
      createWalletRequest.mock.results[0].value,
    ).resolves.toMatchObject({ id: "w-new" });
  });

  it("adds nothing when the signature is rejected and keeps the modal open", async () => {
    legacy.behaviour.accounts = [ALICE.address];
    legacy.behaviour.sign = "reject";
    open();
    await shownAddress();

    await finish();

    expect(await alertText()).toBe(
      "You dismissed the signature request, so nothing was linked.",
    );
    expect(createWalletRequest).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(notifyError).not.toHaveBeenCalled();
    expect(screen.getByTestId("create-wallet-submit")).toBeEnabled();
  });

  it("refuses to sign when the wallet silently moved to another account", async () => {
    legacy.behaviour.accounts = [ALICE.address];
    open();
    await shownAddress();
    fireEvent.click(screen.getByTestId("create-wallet-continue"));

    legacy.behaviour.accounts = [CAROL.address];
    fireEvent.click(await screen.findByTestId("create-wallet-submit"));

    expect(await alertText()).toMatch(/different account/);
    expect(legacy.calls).not.toContain("personal_sign");
    expect(createWalletRequest).not.toHaveBeenCalled();
  });

  it("starts clean when reopened after a failed attempt", async () => {
    legacy.behaviour.connect = "reject";
    const view = open();
    fireEvent.click(connectButtons()[0]);
    await alertText();

    view.rerender(
      <Provider store={store}>
        <CreateWalletModal isOpen={false} onClose={onClose} />
      </Provider>,
    );
    view.rerender(
      <Provider store={store}>
        <CreateWalletModal isOpen onClose={onClose} />
      </Provider>,
    );

    await vi.waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
    expect(connectButtons()).toHaveLength(1);
  });
});

describe("add a wallet with one announced wallet", () => {
  it("shows a wallet that announces while the modal is open, by name", async () => {
    rabby.behaviour.onConnect = [BOB.address];
    legacy.behaviour.onConnect = [ALICE.address];
    open();
    expect(connectButtons()[0]).toHaveTextContent("Connect wallet");

    announce(rabby, "io.rabby", "Rabby Wallet");

    expect(connectButtons()).toHaveLength(1);
    expect(connectButtons()[0]).toHaveTextContent("Connect Rabby Wallet");

    fireEvent.click(connectButtons()[0]);

    expect(await shownAddress()).toHaveTextContent(BOB.address);
    expect(legacy.calls).not.toContain("eth_requestAccounts");
  });

  it("follows account changes from the announced wallet, not window.ethereum", async () => {
    rabby.behaviour.accounts = [BOB.address];
    open();
    expect(await shownAddress()).toHaveTextContent(BOB.address);

    act(() => legacy.emit("accountsChanged", [ALICE.address]));
    expect(await shownAddress()).toHaveTextContent(BOB.address);

    rabby.behaviour.accounts = [CAROL.address];
    act(() => rabby.emit("accountsChanged", [CAROL.address]));
    await vi.waitFor(async () => {
      expect(await shownAddress()).toHaveTextContent(CAROL.address);
    });
  });
});

describe("add a wallet with several announced wallets", () => {
  beforeAll(() => {
    announce(phantom, "app.phantom", "Phantom");
  });

  it("offers one button per wallet", () => {
    open();

    expect(connectButtons().map((button) => button.textContent)).toEqual([
      "Connect Rabby Wallet",
      "Connect Phantom",
    ]);
  });

  it("connects and signs through the wallet that was picked", async () => {
    legacy.behaviour.onConnect = [ALICE.address];
    rabby.behaviour.onConnect = [BOB.address];
    phantom.behaviour.onConnect = [CAROL.address];
    open();

    fireEvent.click(connectButtons()[1]);
    expect(await shownAddress()).toHaveTextContent(CAROL.address);

    await finish();

    await vi.waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(phantom.calls).toContain("personal_sign");
    expect(rabby.calls).not.toContain("personal_sign");
    expect(rabby.calls).not.toContain("eth_requestAccounts");
    expect(legacy.calls).not.toContain("personal_sign");
    await expect(
      createWalletRequest.mock.results[0].value,
    ).resolves.toMatchObject({ id: "w-new" });
  });

  it("follows the picked wallet's events after connecting", async () => {
    rabby.behaviour.onConnect = [BOB.address];
    open();
    fireEvent.click(connectButtons()[0]);
    expect(await shownAddress()).toHaveTextContent(BOB.address);

    rabby.behaviour.accounts = [ALICE.address];
    act(() => rabby.emit("accountsChanged", [ALICE.address]));

    await vi.waitFor(async () => {
      expect(await shownAddress()).toHaveTextContent(ALICE.address);
    });
  });

  it("one wallet failing does not stop the user picking another", async () => {
    rabby.behaviour.connect = "empty";
    phantom.behaviour.onConnect = [CAROL.address];
    open();

    fireEvent.click(connectButtons()[0]);
    expect(await alertText()).toMatch(/didn't share an account/);

    fireEvent.click(connectButtons()[1]);

    expect(await shownAddress()).toHaveTextContent(CAROL.address);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
