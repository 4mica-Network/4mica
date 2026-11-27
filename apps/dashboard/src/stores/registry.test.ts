import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSupportRequests } = vi.hoisted(() => ({
  getSupportRequests: vi.fn(),
}));

vi.mock("@api/support", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSupportRequests,
}));

vi.mock("@/lib/notify", () => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));

const { store } = await import("./index");
const { resetSession } = await import("./session");
const { registerStore } = await import("./registry");

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("lazy stores", () => {
  beforeEach(() => {
    getSupportRequests.mockReset();
    getSupportRequests.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });
  });

  it("starts with only the stores every page needs", () => {
    expect(Object.keys(store.getState()).sort()).toEqual([
      "banner",
      "config",
      "organization",
      "project",
      "user",
    ]);
  });

  it("adds a store's slice and sagas when its entry module loads", async () => {
    const { INITIAL_STATE } = await import("./support/reducer");
    const { fetchSupportRequests } = await import("./support");

    expect(store.getState().support).toEqual(INITIAL_STATE);

    store.dispatch(fetchSupportRequests());
    await settle();

    expect(getSupportRequests).toHaveBeenCalledTimes(1);
  });

  it("registers a store once, however often it is registered", async () => {
    const { fetchSupportRequests } = await import("./support");
    const reducer = (await import("./support/reducer")).default;
    const watchers = (await import("./support/saga")).default;

    registerStore("support", reducer, watchers);
    store.dispatch(fetchSupportRequests());
    await settle();

    expect(getSupportRequests).toHaveBeenCalledTimes(1);
  });

  it("keeps a registered store, and its sagas, across a session reset", async () => {
    const { INITIAL_STATE } = await import("./support/reducer");
    const { fetchSupportRequests } = await import("./support");

    store.dispatch(resetSession());
    expect(store.getState().support).toEqual(INITIAL_STATE);

    store.dispatch(fetchSupportRequests());
    await settle();

    expect(getSupportRequests).toHaveBeenCalledTimes(1);
  });
});
