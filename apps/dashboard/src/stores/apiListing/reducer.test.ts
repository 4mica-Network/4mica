import { describe, expect, it } from "vitest";
import {
  apiListingActionFailed,
  batchDeleteApiListings,
  batchDeleteApiListingsSucceeded,
  createApiListing,
  deleteApiListing,
  fetchApiListingsSucceeded,
  publishApiListing,
  replaceApiEndpoints,
  setApiListingFilters,
  setApiListingPage,
  setApiListingSelection,
  toggleApiListingSelected,
  updateApiListing,
} from "./actions";
import reducer, { INITIAL_STATE } from "./reducer";
import type { ApiListing, ApiListingState } from "./type";

const listing = (over: Partial<ApiListing> = {}): ApiListing => ({
  id: "listing_1",
  slug: "credit-limits",
  name: "Credit Limits API",
  summary: null,
  description: null,
  baseUrl: null,
  docsUrl: null,
  category: null,
  tags: [],
  priceLabel: null,
  visibility: "PRIVATE",
  publishedAt: null,
  walletId: null,
  network: null,
  payToAddress: null,
  assetAddress: null,
  priceAmount: null,
  priceCurrency: null,
  x402Endpoint: null,
  createdAt: "2026-09-21T00:00:00.000Z",
  updatedAt: "2026-09-21T00:00:00.000Z",
  endpoints: [],
  ...over,
});

const seeded: ApiListingState = {
  ...INITIAL_STATE,
  items: [listing(), listing({ id: "listing_2", slug: "quotes" })],
  total: 2,
  hasLoaded: true,
};

describe("apiListing reducer", () => {
  it("marks only the acting row pending", () => {
    const state = reducer(
      seeded,
      updateApiListing({ id: "listing_1", data: {} }),
    );

    expect(state.pending["apiListing:listing_1"]).toBe(true);
    expect(state.pending["apiListing:listing_2"]).toBeUndefined();
  });

  it("tracks create separately from row actions", () => {
    const state = reducer(seeded, createApiListing({ name: "New" }));

    expect(state.pending.createApiListing).toBe(true);
  });

  it("shares one pending key between edit, publish and endpoint replacement", () => {
    for (const action of [
      updateApiListing({ id: "listing_1", data: {} }),
      publishApiListing({ id: "listing_1", publish: true }),
      replaceApiEndpoints({ id: "listing_1", endpoints: [] }),
      deleteApiListing({ id: "listing_1" }),
    ]) {
      expect(reducer(seeded, action).pending).toEqual({
        "apiListing:listing_1": true,
      });
    }
  });

  it("replaces the page wholesale on fetch", () => {
    const state = reducer(
      seeded,
      fetchApiListingsSucceeded({
        items: [listing({ id: "listing_9" })],
        total: 1,
        page: 2,
        limit: 20,
      }),
    );

    expect(state.items.map((item) => item.id)).toEqual(["listing_9"]);
    expect(state.page).toBe(2);
    expect(state.hasLoaded).toBe(true);
  });

  it("drops selections for rows that left the page", () => {
    const selected = reducer(seeded, setApiListingSelection(["listing_1"]));
    const state = reducer(
      selected,
      fetchApiListingsSucceeded({
        items: [listing({ id: "listing_2" })],
        total: 1,
        page: 1,
        limit: 20,
      }),
    );

    expect(state.selectedIds).toEqual([]);
  });

  it("returns to the first page when a filter changes", () => {
    const paged = reducer(seeded, setApiListingPage(3));
    const state = reducer(paged, setApiListingFilters({ q: "credit" }));

    expect(state.page).toBe(1);
  });

  it("merges filters rather than replacing them", () => {
    const first = reducer(seeded, setApiListingFilters({ q: "credit" }));
    const state = reducer(
      first,
      setApiListingFilters({ visibility: "PUBLIC" }),
    );

    expect(state.filters).toEqual({
      q: "credit",
      visibility: "PUBLIC",
      network: "",
    });
  });

  it("clears the selection when the page changes", () => {
    const selected = reducer(seeded, setApiListingSelection(["listing_1"]));
    expect(reducer(selected, setApiListingPage(2)).selectedIds).toEqual([]);
  });

  it("toggles a row in and out", () => {
    const on = reducer(seeded, toggleApiListingSelected("listing_1"));
    expect(on.selectedIds).toEqual(["listing_1"]);
    expect(
      reducer(on, toggleApiListingSelected("listing_1")).selectedIds,
    ).toEqual([]);
  });

  it("empties the selection after a batch delete", () => {
    const selected = reducer(
      seeded,
      setApiListingSelection(["listing_1", "listing_2"]),
    );
    const pending = reducer(
      selected,
      batchDeleteApiListings({ ids: ["listing_1"] }),
    );
    const state = reducer(
      pending,
      batchDeleteApiListingsSucceeded(
        { deleted: ["listing_1"], notFound: [] },
        { pendingKey: "batchDeleteApiListings" },
      ),
    );

    expect(state.selectedIds).toEqual([]);
    expect(state.pending).toEqual({});
  });

  it("records the message and issues from a failure", () => {
    const state = reducer(
      seeded,
      apiListingActionFailed(
        "That wallet is not one of yours.",
        { walletId: "is not one of your wallets" },
        { pendingKey: "apiListing:listing_1" },
      ),
    );

    expect(state.error).toBe("That wallet is not one of yours.");
    expect(state.validationIssues).toEqual({
      walletId: "is not one of your wallets",
    });
    expect(state.pending["apiListing:listing_1"]).toBeUndefined();
  });

  it("clears stale issues when a new request starts", () => {
    const failed = reducer(
      seeded,
      apiListingActionFailed("nope", { name: "bad" }, { pendingKey: "x" }),
    );
    const state = reducer(failed, createApiListing({ name: "Again" }));

    expect(state.error).toBeNull();
    expect(state.validationIssues).toEqual({});
  });

  it("never lets the page fall below one", () => {
    expect(reducer(seeded, setApiListingPage(0)).page).toBe(1);
    expect(reducer(seeded, setApiListingPage(-5)).page).toBe(1);
  });
});
