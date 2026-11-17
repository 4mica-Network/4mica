import { CANCEL } from "redux-saga";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Deferred<T> = Promise<T> & {
  resolve: (value: T) => void;
  cancelled: boolean;
};

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  }) as Deferred<T>;
  promise.resolve = resolve;
  promise.cancelled = false;
  Object.assign(promise, {
    [CANCEL]: () => {
      promise.cancelled = true;
    },
  });
  return promise;
};

const { getPayments, getMe } = vi.hoisted(() => ({
  getPayments: vi.fn(),
  getMe: vi.fn(),
}));

vi.mock("@api/payment", () => ({
  getPayments,
  getPaymentSummary: vi.fn(),
  getPaymentStats: vi.fn(),
  getPayment: vi.fn(),
}));

vi.mock("@api/user", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getMe,
}));

const { store } = await import("./index");
const { fetchPayments, setPaymentFilters } = await import("./payment/actions");
const { fetchUser } = await import("./user/actions");
const { resetSession } = await import("./session");

const page = (id: string) => ({
  items: [{ id, resource: null }],
  total: 1,
  page: 1,
  limit: 20,
});

describe("request races", () => {
  beforeEach(() => {
    getPayments.mockReset();
    getMe.mockReset();
    store.dispatch(resetSession());
  });

  it("a filter change cancels the list fetch already in flight", async () => {
    const first = deferred<ReturnType<typeof page>>();
    const second = deferred<ReturnType<typeof page>>();
    getPayments.mockReturnValueOnce(first).mockReturnValueOnce(second);

    store.dispatch(fetchPayments());
    store.dispatch(setPaymentFilters({ q: "newer" }));

    expect(first.cancelled).toBe(true);

    second.resolve(page("newer"));
    first.resolve(page("older"));
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.getState().payment.items.map((p) => p.id)).toEqual(["newer"]);
  });

  it("signing out cancels requests from the previous session", async () => {
    const stale = deferred<ReturnType<typeof page>>();
    getPayments.mockReturnValueOnce(stale);

    store.dispatch(fetchPayments());
    store.dispatch(resetSession());
    stale.resolve(page("previous-user"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(stale.cancelled).toBe(true);
    expect(store.getState().payment.items).toEqual([]);
  });

  it("still serves a fetch dispatched straight after the reset", async () => {
    getMe.mockResolvedValue({ id: "user_2", username: "next" });

    store.dispatch(resetSession());
    store.dispatch(fetchUser());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getMe).toHaveBeenCalledTimes(1);
  });
});
