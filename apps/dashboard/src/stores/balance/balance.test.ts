import { HttpError } from "@4mica/http";
import { runSaga } from "redux-saga";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchBalancesFailed, fetchBalancesSucceeded } from "./actions";
import reducer, { INITIAL_STATE } from "./reducer";
import type { BalancesResponse } from "./type";

const { getBalances } = vi.hoisted(() => ({ getBalances: vi.fn() }));

vi.mock("@api/balance", () => ({ getBalances }));

const { fetchBalances } = await import("./saga");

type Dispatched = { type: string; payload?: unknown };

const record = async (): Promise<Dispatched[]> => {
  const dispatched: Dispatched[] = [];
  await runSaga(
    { dispatch: (action: Dispatched) => dispatched.push(action) },
    fetchBalances,
  ).toPromise();
  return dispatched;
};

const response: BalancesResponse = {
  network: "BASE_SEPOLIA",
  wallets: [
    {
      id: "wallet_1",
      label: "Treasury",
      address: "0x6c5cc69e4c4863dbc3439ab2673806ea7715ebd5",
      role: "BOTH",
      assets: [
        {
          assetAddress: "0x0000000000000000000000000000000000000000",
          symbol: "ETH",
          decimals: 18,
          total: "5000",
          locked: "1200",
          available: "3800",
          updatedAt: null,
        },
      ],
    },
  ],
};

describe("balance reducer", () => {
  it("stores the wallets core returned", () => {
    const state = reducer(INITIAL_STATE, fetchBalancesSucceeded(response));

    expect(state).toMatchObject({ ...response, hasLoaded: true, error: null });
  });

  it("keeps the last good balances when a refresh fails", () => {
    const loaded = reducer(INITIAL_STATE, fetchBalancesSucceeded(response));
    const state = reducer(loaded, fetchBalancesFailed("down"));

    expect(state.wallets).toEqual(response.wallets);
    expect(state.error).toBe("down");
  });
});

describe("balance saga", () => {
  beforeEach(() => {
    getBalances.mockReset();
  });

  it("loads the balances", async () => {
    getBalances.mockResolvedValue(response);

    const dispatched = await record();

    expect(dispatched.at(-1)).toEqual(fetchBalancesSucceeded(response));
  });

  it("surfaces the API's reason when core is unreachable", async () => {
    getBalances.mockRejectedValue(
      new HttpError(503, "Service Unavailable", {
        error: "core_unavailable",
        message: "4mica core is unreachable. Retry shortly.",
      }),
    );

    const dispatched = await record();

    expect(dispatched.at(-1)).toEqual(
      fetchBalancesFailed("4mica core is unreachable. Retry shortly."),
    );
  });
});
