import { describe, expect, it } from "vitest";
import * as actions from "./actions";
import reducer, { ACTIVITY_PAGE_SIZE, INITIAL_STATE } from "./reducer";
import type { Customer, CustomerOverview } from "./type";

const customer = (over: Partial<Customer> = {}): Customer => ({
  id: "customer_1",
  name: "Acme Procurement",
  email: "ops@acme.example",
  type: "ORGANIZATION",
  status: "ACTIVE",
  statusReason: null,
  suspendedUntil: null,
  description: null,
  notes: null,
  dailyLimit: null,
  monthlyLimit: "500",
  limitCurrency: "USD",
  freeQuotaUnit: null,
  freeQuota: null,
  freeQuotaPeriod: null,
  quotaResetAt: null,
  quotaUsed: null,
  quotaRemaining: null,
  discountPercent: null,
  discountFixed: null,
  minPaymentAmount: null,
  approvalThreshold: null,
  identities: [],
  totalSpend: [],
  recentSpend: [],
  txnCount: 0,
  settledCount: 0,
  failedCount: 0,
  lastActiveAt: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  ...over,
});

const overview = (): CustomerOverview => ({
  totalSpend: [{ network: "BASE_SEPOLIA", assetAddress: null, amount: "1" }],
  recentSpend: [],
  txnCount: 3,
  settledCount: 3,
  failedCount: 0,
  lastActiveAt: "2026-09-06T12:00:00.000Z",
  firstSeenAt: "2026-05-04T12:00:00.000Z",
});

const page = (items: Customer[]) => ({
  items,
  total: items.length,
  page: 1,
  limit: 20,
});

describe("customer reducer", () => {
  it("keeps a selection only for rows that survived the refetch", () => {
    const seeded = {
      ...INITIAL_STATE,
      selectedIds: ["customer_1", "gone"],
    };

    const next = reducer(
      seeded,
      actions.fetchCustomersSucceeded(page([customer()])),
    );

    expect(next.selectedIds).toEqual(["customer_1"]);
    expect(next.hasLoaded).toBe(true);
  });

  it("resets to the first page when a filter changes", () => {
    const seeded = { ...INITIAL_STATE, page: 4, selectedIds: ["customer_1"] };

    const next = reducer(seeded, actions.setCustomerFilters({ q: "acme" }));

    expect(next.page).toBe(1);
    expect(next.filters.q).toBe("acme");
    expect(next.selectedIds).toEqual([]);
  });

  it("never lets the page fall below one", () => {
    const next = reducer(INITIAL_STATE, actions.setCustomerPage(-3));

    expect(next.page).toBe(1);
  });

  it("defaults to ranking by the highest spend", () => {
    expect(INITIAL_STATE.filters.sort).toBe("-totalSpend");
  });

  it("toggles a row in and back out of the selection", () => {
    const once = reducer(
      INITIAL_STATE,
      actions.toggleCustomerSelected("customer_1"),
    );
    const twice = reducer(once, actions.toggleCustomerSelected("customer_1"));

    expect(once.selectedIds).toEqual(["customer_1"]);
    expect(twice.selectedIds).toEqual([]);
  });

  it("drops duplicates from a wholesale selection", () => {
    const next = reducer(
      INITIAL_STATE,
      actions.setCustomerSelection(["a", "b", "a"]),
    );

    expect(next.selectedIds).toEqual(["a", "b"]);
  });

  it("tracks a pending write under its own key", () => {
    const requested = reducer(
      INITIAL_STATE,
      actions.deleteCustomer({ id: "customer_1" }),
    );

    expect(requested.pending["customer:customer_1"]).toBe(true);

    const done = reducer(
      requested,
      actions.deleteCustomerSucceeded("customer_1", {
        pendingKey: "customer:customer_1",
      }),
    );

    expect(done.pending["customer:customer_1"]).toBeUndefined();
  });

  it("keeps the list and the activity list on separate pages", () => {
    const listPaged = reducer(INITIAL_STATE, actions.setCustomerPage(3));
    const bothPaged = reducer(
      listPaged,
      actions.setCustomerActivityPage("customer_1", 2),
    );

    expect(bothPaged.page).toBe(3);
    expect(bothPaged.detail.activity.page).toBe(2);
  });

  it("starts the activity list on its own smaller page size", () => {
    expect(INITIAL_STATE.detail.activity.limit).toBe(ACTIVITY_PAGE_SIZE);
    expect(INITIAL_STATE.limit).not.toBe(ACTIVITY_PAGE_SIZE);
  });

  it("clears the detail on reset so the next customer cannot flash the last one", () => {
    const loaded = reducer(
      INITIAL_STATE,
      actions.fetchCustomerDetailSucceeded({
        customer: customer(),
        overview: overview(),
      }),
    );

    expect(loaded.detail.customer?.id).toBe("customer_1");

    const reset = reducer(loaded, actions.resetCustomerDetail());

    expect(reset.detail.customer).toBeNull();
    expect(reset.detail.overview).toBeNull();
    expect(reset.detail.hasLoaded).toBe(false);
  });

  it("replaces the open customer when an identity changes", () => {
    const loaded = reducer(
      INITIAL_STATE,
      actions.fetchCustomerDetailSucceeded({
        customer: customer(),
        overview: overview(),
      }),
    );
    const withRow = reducer(
      loaded,
      actions.fetchCustomersSucceeded(page([customer()])),
    );

    const next = reducer(
      withRow,
      actions.customerIdentityChanged(
        customer({ txnCount: 12, name: "Acme Renamed" }),
        { pendingKey: "customerIdentity" },
      ),
    );

    expect(next.detail.customer?.txnCount).toBe(12);
    expect(next.items[0].name).toBe("Acme Renamed");
  });

  it("leaves an unrelated open customer alone when another row updates", () => {
    const loaded = reducer(
      INITIAL_STATE,
      actions.fetchCustomerDetailSucceeded({
        customer: customer({ id: "customer_1" }),
        overview: overview(),
      }),
    );

    const next = reducer(
      loaded,
      actions.updateCustomerSucceeded(
        customer({ id: "other", name: "Other" }),
        {
          pendingKey: "customer:other",
        },
      ),
    );

    expect(next.detail.customer?.id).toBe("customer_1");
  });

  it("surfaces field issues from a failed write", () => {
    const next = reducer(
      INITIAL_STATE,
      actions.customerActionFailed(
        "Another customer already holds that identity.",
        { address: "is already mapped to one of your customers" },
        { pendingKey: "createCustomer" },
      ),
    );

    expect(next.error).toBe("Another customer already holds that identity.");
    expect(next.validationIssues.address).toBe(
      "is already mapped to one of your customers",
    );

    const cleared = reducer(next, actions.clearCustomerIssues());

    expect(cleared.error).toBeNull();
    expect(cleared.validationIssues).toEqual({});
  });
});
