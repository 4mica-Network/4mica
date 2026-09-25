import { HttpError } from "@4mica/http";
import { runSaga } from "redux-saga";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchPaymentSummarySucceeded,
  fetchPaymentsFailed,
  fetchPaymentsSucceeded,
  setPaymentFilters,
  setPaymentPage,
} from "./actions";
import reducer, { INITIAL_STATE } from "./reducer";
import type { Payment, PaymentSummary } from "./type";

const { getPayments, getPaymentSummary } = vi.hoisted(() => ({
  getPayments: vi.fn(),
  getPaymentSummary: vi.fn(),
}));

vi.mock("@api/payment", () => ({
  getPayments,
  getPaymentSummary,
  getPayment: vi.fn(),
}));

const { fetchPayments, fetchPaymentSummary } = await import("./saga");
const actionTypes = (await import("./actionTypes")).default;

const payment = (over: Partial<Payment> = {}): Payment => ({
  id: "pay_1",
  listingId: null,
  agentId: null,
  payerAddress: "0x1111111111111111111111111111111111111111",
  recipientAddress: "0x2222222222222222222222222222222222222222",
  network: "BASE_SEPOLIA",
  assetAddress: null,
  amount: "0.010000000000000000",
  status: "SETTLED",
  failureReason: null,
  reqId: "0xabc",
  txHash: null,
  resource: null,
  description: null,
  settledAt: "2026-09-21T00:00:00.000Z",
  createdAt: "2026-09-21T00:00:00.000Z",
  updatedAt: "2026-09-21T00:00:00.000Z",
  listingSlug: null,
  listingName: null,
  agentSlug: null,
  agentName: null,
  direction: "received",
  ...over,
});

describe("payment reducer", () => {
  it("replaces the page wholesale on fetch", () => {
    const state = reducer(
      INITIAL_STATE,
      fetchPaymentsSucceeded({
        items: [payment()],
        total: 1,
        page: 2,
        limit: 20,
      }),
    );

    expect(state.items).toHaveLength(1);
    expect(state.page).toBe(2);
    expect(state.hasLoaded).toBe(true);
    expect(state.isLoading).toBe(false);
  });

  it("returns to the first page when a filter changes", () => {
    const paged = reducer(INITIAL_STATE, setPaymentPage(4));
    expect(reducer(paged, setPaymentFilters({ status: "FAILED" })).page).toBe(
      1,
    );
  });

  it("merges filters rather than replacing them", () => {
    const first = reducer(INITIAL_STATE, setPaymentFilters({ q: "0xabc" }));
    const state = reducer(first, setPaymentFilters({ direction: "sent" }));

    expect(state.filters).toEqual({
      q: "0xabc",
      direction: "sent",
      status: "",
      network: "",
    });
  });

  it("never lets the page fall below one", () => {
    expect(reducer(INITIAL_STATE, setPaymentPage(0)).page).toBe(1);
  });

  it("keeps the summary independent of the list", () => {
    const summary: PaymentSummary = {
      sent: {
        count: 1,
        settledCount: 1,
        pendingCount: 0,
        failedCount: 0,
        volume: [],
      },
      received: {
        count: 0,
        settledCount: 0,
        pendingCount: 0,
        failedCount: 0,
        volume: [],
      },
    };

    const state = reducer(INITIAL_STATE, fetchPaymentSummarySucceeded(summary));

    expect(state.summary).toEqual(summary);
    expect(state.hasLoaded).toBe(false);
  });

  it("records a fetch failure", () => {
    const state = reducer(INITIAL_STATE, fetchPaymentsFailed("nope"));

    expect(state.error).toBe("nope");
    expect(state.isLoading).toBe(false);
  });
});

interface Dispatched {
  type: string;
  payload?: unknown;
}

const paymentState = (over: Record<string, unknown> = {}) => ({
  payment: { ...INITIAL_STATE, ...over },
});

const record = async <TArgs extends unknown[]>(
  saga: (...args: TArgs) => Generator,
  state: unknown,
  ...args: TArgs
): Promise<Dispatched[]> => {
  const dispatched: Dispatched[] = [];

  await runSaga(
    {
      dispatch: (action: Dispatched) => dispatched.push(action),
      getState: () => state,
    },
    saga as (...a: TArgs) => Generator,
    ...args,
  ).toPromise();

  return dispatched;
};

const page = { items: [], total: 0, page: 1, limit: 20 };

describe("payment sagas", () => {
  beforeEach(() => {
    getPayments.mockReset();
    getPaymentSummary.mockReset();
    getPayments.mockResolvedValue(page);
    getPaymentSummary.mockResolvedValue({});
  });

  it("omits blank filters rather than sending empty strings", async () => {
    await record(fetchPayments, paymentState());

    expect(getPayments).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it("sends every set filter", async () => {
    await record(
      fetchPayments,
      paymentState({
        page: 2,
        filters: {
          q: "0xabc",
          direction: "received",
          status: "SETTLED",
          network: "BASE",
        },
      }),
    );

    expect(getPayments).toHaveBeenCalledWith({
      page: 2,
      limit: 20,
      q: "0xabc",
      direction: "received",
      status: "SETTLED",
      network: "BASE",
    });
  });

  it("reports a failure without throwing", async () => {
    getPayments.mockRejectedValue(new Error("network down"));

    const dispatched = await record(fetchPayments, paymentState());

    expect(dispatched.map((a) => a.type)).toEqual([
      actionTypes.FETCH_PAYMENTS_PENDING,
      actionTypes.FETCH_PAYMENTS_FAILED,
    ]);
  });

  it("never echoes the API's auth copy at the user", async () => {
    getPayments.mockRejectedValue(
      new HttpError(401, "Unauthorized", {
        error: "unauthorized",
        message: "No user context is attached to this request.",
      }),
    );

    const dispatched = await record(fetchPayments, paymentState());
    const failure = dispatched[1] as { payload: { message: string } };

    expect(failure.payload.message).not.toContain("user context");
    expect(failure.payload.message).toContain("session");
  });

  it("leaves the tiles empty when the summary fails", async () => {
    getPaymentSummary.mockRejectedValue(new Error("nope"));

    const dispatched = await record(fetchPaymentSummary, paymentState());

    expect(dispatched).toEqual([]);
  });
});
