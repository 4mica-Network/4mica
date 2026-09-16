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
  useTranslation: () => ({ t: (key: string) => key }),
}));

const {
  connectWallet,
  currentAccount,
  currentChainId,
  watchWallet,
  requestAccountSwitch,
  switchChain,
} = vi.hoisted(() => ({
  connectWallet: vi.fn(),
  currentAccount: vi.fn(),
  currentChainId: vi.fn(),
  watchWallet: vi.fn(() => () => {}),
  requestAccountSwitch: vi.fn(),
  switchChain: vi.fn(),
}));

vi.mock("@/lib/wallet-signer", () => ({
  connectWallet,
  currentAccount,
  currentChainId,
  watchWallet,
  requestAccountSwitch,
  switchChain,
  hasInjectedWallet: () => true,
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

  it("reopens the wallet's account picker instead of reconnecting", async () => {
    const first = "0x7A9f3C4B2e8d5a1f6C0b4e9d2a8C3F5B7e1d6A04";
    const second = "0x4f2C8b6D1e9A3f5c7B0d2E4a6C8f1B3d5E7a9C02";
    currentAccount.mockResolvedValue(first);
    requestAccountSwitch.mockResolvedValue(second);

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
});
