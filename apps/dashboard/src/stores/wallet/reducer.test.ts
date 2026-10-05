import { describe, expect, it } from "vitest";
import {
  batchDeleteWallets,
  batchDeleteWalletsSucceeded,
  createWallet,
  deleteWallet,
  fetchWalletsSucceeded,
  setWalletFilters,
  setWalletPage,
  setWalletSelection,
  toggleWalletSelected,
  updateWallet,
  walletActionFailed,
} from "./actions";
import reducer, { INITIAL_STATE } from "./reducer";
import type { Wallet, WalletState } from "./type";

const wallet = (over: Partial<Wallet> = {}): Wallet => ({
  id: "wallet_1",
  label: "Treasury",
  description: null,
  address: "0x1111111111111111111111111111111111111111",
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

const seeded: WalletState = {
  ...INITIAL_STATE,
  items: [wallet(), wallet({ id: "wallet_2", label: "Payer" })],
  total: 2,
  hasLoaded: true,
};

describe("wallet reducer", () => {
  it("marks only the acting row pending", () => {
    const state = reducer(seeded, updateWallet({ id: "wallet_1", data: {} }));

    expect(state.pending).toEqual({ "wallet:wallet_1": true });
    expect(state.pending["wallet:wallet_2"]).toBeUndefined();
  });

  it("tracks create separately from row actions", () => {
    let state = reducer(
      seeded,
      createWallet({
        label: "New",
        address: "0x2222222222222222222222222222222222222222",
        network: "BASE",
        role: "BOTH",
      }),
    );
    state = reducer(state, deleteWallet({ id: "wallet_1" }));

    expect(state.pending).toEqual({
      createWallet: true,
      "wallet:wallet_1": true,
    });
  });

  it("replaces the page wholesale on fetch", () => {
    const next = wallet({ id: "wallet_9", label: "Fresh" });
    const state = reducer(
      seeded,
      fetchWalletsSucceeded({ items: [next], total: 1, page: 2, limit: 20 }),
    );

    expect(state.items).toEqual([next]);
    expect(state.total).toBe(1);
    expect(state.page).toBe(2);
    expect(state.hasLoaded).toBe(true);
  });

  it("drops selections for rows that left the page", () => {
    const selected = reducer(
      seeded,
      setWalletSelection(["wallet_1", "wallet_2"]),
    );

    const state = reducer(
      selected,
      fetchWalletsSucceeded({
        items: [wallet({ id: "wallet_2" })],
        total: 1,
        page: 1,
        limit: 20,
      }),
    );

    expect(state.selectedIds).toEqual(["wallet_2"]);
  });

  it("returns to the first page when a filter changes", () => {
    const paged = reducer(seeded, setWalletPage(3));
    const state = reducer(paged, setWalletFilters({ q: "treasury" }));

    expect(state.page).toBe(1);
    expect(state.filters.q).toBe("treasury");
  });

  it("merges filters rather than replacing them", () => {
    let state = reducer(seeded, setWalletFilters({ q: "tre" }));
    state = reducer(state, setWalletFilters({ status: "ACTIVE" }));

    expect(state.filters).toEqual({
      q: "tre",
      status: "ACTIVE",
      network: "",
    });
  });

  it("clears the selection when the page changes", () => {
    const selected = reducer(seeded, toggleWalletSelected("wallet_1"));
    const state = reducer(selected, setWalletPage(2));

    expect(state.selectedIds).toEqual([]);
  });

  it("toggles a row in and out of the selection", () => {
    let state = reducer(seeded, toggleWalletSelected("wallet_1"));
    expect(state.selectedIds).toEqual(["wallet_1"]);

    state = reducer(state, toggleWalletSelected("wallet_1"));
    expect(state.selectedIds).toEqual([]);
  });

  it("empties the selection after a batch delete", () => {
    const selected = reducer(seeded, setWalletSelection(["wallet_1"]));
    const pending = reducer(
      selected,
      batchDeleteWallets({ ids: ["wallet_1"] }),
    );

    const state = reducer(
      pending,
      batchDeleteWalletsSucceeded(
        { deleted: ["wallet_1"], notFound: [] },
        { pendingKey: "batchDeleteWallets" },
      ),
    );

    expect(state.selectedIds).toEqual([]);
    expect(state.pending).toEqual({});
  });

  it("records the message and issues from a failure", () => {
    const pending = reducer(seeded, updateWallet({ id: "wallet_1", data: {} }));
    const state = reducer(
      pending,
      walletActionFailed(
        "That address is already linked.",
        { address: "is already linked" },
        { pendingKey: "wallet:wallet_1" },
      ),
    );

    expect(state.error).toBe("That address is already linked.");
    expect(state.validationIssues).toEqual({ address: "is already linked" });
    expect(state.pending).toEqual({});
  });

  it("clears stale issues when a new request starts", () => {
    const failed = reducer(
      seeded,
      walletActionFailed("nope", { label: "bad" }, { pendingKey: "x" }),
    );
    const state = reducer(failed, updateWallet({ id: "wallet_1", data: {} }));

    expect(state.error).toBeNull();
    expect(state.validationIssues).toEqual({});
  });

  it("never lets the page fall below one", () => {
    const state = reducer(seeded, setWalletPage(0));
    expect(state.page).toBe(1);
  });
});
