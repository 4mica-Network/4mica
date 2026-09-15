import type { Wallet } from "@stores/wallet/type";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));

vi.mock("@stores/hooks", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({ wallet: { pending: {}, selectedIds: [], items: [] } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { WalletRow } = await import("./WalletRow");

const wallet = (over: Partial<Wallet> = {}): Wallet => ({
  id: "wallet_1",
  label: "Settlement treasury",
  description: "Receives settlement for the credit-limits listing.",
  address: "0x7a9f3c4b2e8d5a1f6c0b4e9d2a8c3f5b7e1d6a04",
  network: "BASE_SEPOLIA",
  role: "BOTH",
  status: "ACTIVE",
  isDefault: false,
  verifiedAt: "2026-09-15T00:00:00.000Z",
  verificationMethod: "EOA_SIGNATURE",
  verifiedChainId: 84532,
  createdAt: "2026-09-15T00:00:00.000Z",
  updatedAt: "2026-09-15T00:00:00.000Z",
  ...over,
});

const renderRow = (over: Partial<Wallet> = {}) =>
  render(
    <WalletRow wallet={wallet(over)} onEdit={() => {}} onDelete={() => {}} />,
  );

const openMenu = () =>
  fireEvent.click(screen.getByTestId("wallet-more-wallet_1"));

describe("WalletRow", () => {
  beforeEach(() => {
    dispatch.mockClear();
  });

  it("shows the wallet's name", () => {
    renderRow();
    expect(screen.getByTestId("wallet-label-wallet_1")).toHaveTextContent(
      "Settlement treasury",
    );
  });

  /**
   * The bug this guards: @4mica/ui's Checkbox renders `w-full` on its own
   * button, which as a flex item claimed the entire row and starved the name,
   * tags and address of width — the tags collapsed to slivers and the address
   * wrapped mid-string. `cn` is tailwind-merge, so passing `w-auto` removes it.
   */
  it("does not let the checkbox claim the full row width", () => {
    renderRow();
    const box = screen.getByTestId("wallet-select-wallet_1-checkbox");

    expect(box.className).not.toMatch(/(^|\s)w-full(\s|$)/);
    expect(box.className).toMatch(/(^|\s)w-auto(\s|$)/);
    expect(box.className).toMatch(/shrink-0/);
  });

  it("ranks the name above the description", () => {
    renderRow();
    const name = screen.getByTestId("wallet-label-wallet_1");
    const description = screen.getByText(
      "Receives settlement for the credit-limits listing.",
    );

    // Name: larger and the brightest ink. Description: smaller and muted.
    expect(name.className).toMatch(/text-base/);
    expect(name.className).toMatch(/text-ink-strong/);
    expect(name.className).toMatch(/font-semibold/);

    expect(description.className).toMatch(/text-sm/);
    expect(description.className).toMatch(/text-ink-muted/);
  });

  /**
   * A tablet has no hover, so controls hidden behind `opacity-0` would be
   * permanently invisible there. They may only be hover-gated from `lg` up.
   */
  it("keeps the row controls visible where there is no hover", () => {
    renderRow();
    const controls = screen
      .getByTestId("wallet-copy-wallet_1")
      .closest("div") as HTMLElement;

    expect(controls.className).not.toMatch(/(^|\s)opacity-0(\s|$)/);
    expect(controls.className).toMatch(/lg:opacity-0/);
    expect(controls.className).toMatch(/lg:group-hover:opacity-100/);
  });

  it("omits the description line when there is none", () => {
    renderRow({ description: null });
    expect(
      screen.queryByText("Receives settlement for the credit-limits listing."),
    ).toBeNull();
    expect(screen.getByTestId("wallet-label-wallet_1")).toBeInTheDocument();
  });

  it("renders status, role, address and network as tags below the text", () => {
    renderRow({ isDefault: true });

    expect(screen.getByText("wallet.row.default")).toBeInTheDocument();
    expect(screen.getByText("wallet.status.active")).toBeInTheDocument();
    expect(screen.getByText("wallet.role.both")).toBeInTheDocument();
    expect(screen.getByText("Base Sepolia")).toBeInTheDocument();

    // The address is a tag now, not a bare line with a separator dot.
    // Tag appends "-tag" to the testid it is given, as Checkbox appends
    // "-checkbox" — the shared convention across @4mica/ui.
    const address = screen.getByTestId("wallet-address-wallet_1-tag");
    expect(address).toHaveTextContent("0x7a9f…6a04");
    expect(address.className).toMatch(/font-mono/);

    // The tag row sits after the description in document order.
    const description = screen.getByText(
      "Receives settlement for the credit-limits listing.",
    );
    expect(
      description.compareDocumentPosition(address) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  /** Only copy and the overflow menu stay on the row itself. */
  it("exposes exactly two controls on the row", () => {
    renderRow();

    const controls = screen
      .getByTestId("wallet-copy-wallet_1")
      .closest("div") as HTMLElement;
    expect(controls.querySelectorAll("button")).toHaveLength(2);

    // Edit and remove live behind the menu, so they are absent until opened.
    expect(screen.queryByTestId("wallet-edit-wallet_1")).toBeNull();
    expect(screen.queryByTestId("wallet-delete-wallet_1")).toBeNull();
  });

  it("moves the remaining actions into the overflow menu", () => {
    renderRow();
    openMenu();

    for (const id of [
      "wallet-edit-wallet_1",
      "wallet-make-default-wallet_1",
      "wallet-toggle-status-wallet_1",
      "wallet-delete-wallet_1",
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
    expect(screen.getByText("wallet.row.viewOnExplorer")).toBeInTheDocument();
  });

  it("offers pause for an active wallet and resume for a paused one", () => {
    const { unmount } = renderRow();
    openMenu();
    expect(
      screen.getByTestId("wallet-toggle-status-wallet_1"),
    ).toHaveTextContent("wallet.row.pause");
    unmount();

    renderRow({ status: "PAUSED" });
    openMenu();
    expect(
      screen.getByTestId("wallet-toggle-status-wallet_1"),
    ).toHaveTextContent("wallet.row.resume");
  });

  /** A retired wallet is terminal, so there is nothing to resume. */
  it("hides the pause action for a retired wallet", () => {
    renderRow({ status: "RETIRED" });
    openMenu();
    expect(screen.queryByTestId("wallet-toggle-status-wallet_1")).toBeNull();
  });
});
