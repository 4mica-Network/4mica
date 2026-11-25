import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dispatch, state } = vi.hoisted(() => ({
  dispatch: vi.fn(),
  state: {
    error: null as string | null,
    issues: {} as Record<string, string>,
    pending: {} as Record<string, boolean>,
    items: [] as unknown[],
  },
}));

vi.mock("@stores/hooks", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({
      wallet: {
        error: state.error,
        validationIssues: state.issues,
        pending: state.pending,
        items: state.items,
      },
    }),
}));

vi.mock("react-i18next", () => ({
  initReactI18next: { type: "3rdParty", init: () => {} },
  useTranslation: () => ({ t: (key: string) => key }),
}));

const {
  connectWallet,
  currentAccount,
  currentChainId,
  watchWallet,
  requestAccountSwitch,
  switchChain,
  detectedWallets,
  selectWallet,
  NoAccountsError,
} = vi.hoisted(() => ({
  detectedWallets: vi.fn((): unknown[] => []),
  selectWallet: vi.fn(),
  NoAccountsError: class extends Error {},
  connectWallet: vi.fn(),
  currentAccount: vi.fn(),
  currentChainId: vi.fn(),
  watchWallet: vi.fn(() => () => {}),
  requestAccountSwitch: vi.fn(),
  switchChain: vi.fn(),
}));

vi.mock("@/lib/wallet-signer", () => ({
  connectAccounts: async () => [await connectWallet()],
  currentAccounts: async () => {
    const account = await currentAccount();
    return account ? [account] : [];
  },
  currentChainId,
  watchWallet,
  requestAccountSwitch,
  switchChain,
  hasInjectedWallet: () => true,
  detectedWallets,
  subscribeWallets: () => () => {},
  selectWallet,
  NoAccountsError,
  NoWalletError: class extends Error {},
  WalletRejectedError: class extends Error {},
}));

const { CreateWalletModal } = await import("./CreateWalletModal");
const actionTypes = (await import("@stores/wallet/actionTypes")).default;

describe("CreateWalletModal", () => {
  beforeEach(() => {
    dispatch.mockClear();
    state.error = null;
    state.issues = {};
    state.pending = {};
    state.items = [];
    currentAccount.mockResolvedValue(null);
    currentChainId.mockResolvedValue(84532);
    connectWallet.mockReset();
    requestAccountSwitch.mockReset();
    switchChain.mockReset();
    selectWallet.mockClear();
    detectedWallets.mockReturnValue([]);
  });

  it("clears a stale error when it opens", async () => {
    state.error = "Couldn't load your wallets.";

    render(<CreateWalletModal isOpen onClose={() => {}} />);

    await vi.waitFor(() => {
      expect(
        dispatch.mock.calls.some(
          ([action]) => action.type === actionTypes.CLEAR_WALLET_ISSUES,
        ),
      ).toBe(true);
    });
  });

  it("does not clear anything while it is closed", () => {
    state.error = "Couldn't load your wallets.";

    render(<CreateWalletModal isOpen={false} onClose={() => {}} />);

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("adopts an already-authorized account without a connect click", async () => {
    currentAccount.mockResolvedValue(
      "0x7A9f3C4B2e8d5a1f6C0b4e9d2a8C3F5B7e1d6A04",
    );

    render(<CreateWalletModal isOpen onClose={() => {}} />);

    expect(
      await screen.findByTestId("create-wallet-address"),
    ).toHaveTextContent("0x7A9f3C4B2e8d5a1f6C0b4e9d2a8C3F5B7e1d6A04");
    expect(connectWallet).not.toHaveBeenCalled();
  });

  it("ignores a wallet answer that arrives after the modal was reopened", async () => {
    const stale = "0x7A9f3C4B2e8d5a1f6C0b4e9d2a8C3F5B7e1d6A04";
    const fresh = "0x4f2C8b6D1e9A3f5c7B0d2E4a6C8f1B3d5E7a9C02";
    let answerFirstOpen: (account: string) => void = () => {};
    currentAccount
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            answerFirstOpen = resolve;
          }),
      )
      .mockResolvedValue(fresh);

    const { rerender } = render(
      <CreateWalletModal isOpen onClose={() => {}} />,
    );
    rerender(<CreateWalletModal isOpen={false} onClose={() => {}} />);
    rerender(<CreateWalletModal isOpen onClose={() => {}} />);

    expect(
      await screen.findByTestId("create-wallet-address"),
    ).toHaveTextContent(fresh);

    answerFirstOpen(stale);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(screen.getByTestId("create-wallet-address")).toHaveTextContent(
      fresh,
    );
  });

  it("reopens the wallet's account picker instead of reconnecting", async () => {
    const first = "0x7A9f3C4B2e8d5a1f6C0b4e9d2a8C3F5B7e1d6A04";
    const second = "0x4f2C8b6D1e9A3f5c7B0d2E4a6C8f1B3d5E7a9C02";
    currentAccount.mockResolvedValue(first);
    requestAccountSwitch.mockResolvedValue([first, second]);

    render(<CreateWalletModal isOpen onClose={() => {}} />);
    await screen.findByTestId("create-wallet-address");

    fireEvent.click(screen.getByTestId("create-wallet-switch-account"));

    await vi.waitFor(() => {
      expect(requestAccountSwitch).toHaveBeenCalled();
    });
    expect(connectWallet).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(screen.getByTestId("create-wallet-address")).toHaveTextContent(
        second,
      );
    });

    fireEvent.click(screen.getByTestId(`create-wallet-account-${first}`));
    expect(screen.getByTestId("create-wallet-address")).toHaveTextContent(
      first,
    );
  });

  it("explains what to do when the wallet stays on the same account", async () => {
    const only = "0x7A9f3C4B2e8d5a1f6C0b4e9d2a8C3F5B7e1d6A04";
    currentAccount.mockResolvedValue(only);
    requestAccountSwitch.mockResolvedValue([only]);

    render(<CreateWalletModal isOpen onClose={() => {}} />);
    await screen.findByTestId("create-wallet-address");
    fireEvent.click(screen.getByTestId("create-wallet-switch-account"));

    expect(
      await screen.findByTestId("create-wallet-same-account"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("create-wallet-address")).toHaveTextContent(only);
  });

  it("offers every network, so the same address can be added on another", async () => {
    currentAccount.mockResolvedValue(
      "0x7A9f3C4B2e8d5a1f6C0b4e9d2a8C3F5B7e1d6A04",
    );

    render(<CreateWalletModal isOpen onClose={() => {}} />);
    await screen.findByTestId("create-wallet-address");

    for (const network of ["BASE", "BASE_SEPOLIA", "ETHEREUM_SEPOLIA"]) {
      expect(
        screen.getByTestId(`create-wallet-network-${network}`),
      ).toBeInTheDocument();
    }

    fireEvent.click(screen.getByTestId("create-wallet-network-BASE"));
    await vi.waitFor(() => {
      expect(switchChain).toHaveBeenCalledWith(
        expect.objectContaining({ chainId: 8453 }),
      );
    });
  });

  it("blocks Continue only for the address+network pair already added", async () => {
    const address = "0x7A9f3C4B2e8d5a1f6C0b4e9d2a8C3F5B7e1d6A04";
    currentAccount.mockResolvedValue(address);
    state.items = [
      { id: "w1", address: address.toLowerCase(), network: "BASE_SEPOLIA" },
    ];

    render(<CreateWalletModal isOpen onClose={() => {}} />);
    await screen.findByTestId("create-wallet-address");

    await vi.waitFor(() => {
      expect(screen.getByTestId("create-wallet-continue")).toBeDisabled();
    });
  });

  it("offers each announced wallet by name and connects through the one picked", async () => {
    const address = "0x7A9f3C4B2e8d5a1f6C0b4e9d2a8C3F5B7e1d6A04";
    detectedWallets.mockReturnValue([
      { id: "io.rabby", name: "Rabby", icon: null },
      { id: "app.phantom", name: "Phantom", icon: null },
    ]);
    connectWallet.mockResolvedValue(address);

    render(<CreateWalletModal isOpen onClose={() => {}} />);

    const buttons = await screen.findAllByTestId("create-wallet-connect");
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]);

    expect(
      await screen.findByTestId("create-wallet-address"),
    ).toHaveTextContent(address);
    expect(selectWallet).toHaveBeenLastCalledWith("app.phantom");
  });

  it("says the wallet shared no account instead of blaming a dismissal", async () => {
    connectWallet.mockRejectedValue(new NoAccountsError());

    render(<CreateWalletModal isOpen onClose={() => {}} />);
    fireEvent.click(await screen.findByTestId("create-wallet-connect"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "wallet.create.verify.noAccounts",
    );
  });
});
