import { HttpError } from "@4mica/http";
import { runSaga } from "redux-saga";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getWallets, createWalletChallenge, createWalletRequest, signMessage } =
  vi.hoisted(() => ({
    getWallets: vi.fn(),
    createWalletChallenge: vi.fn(),
    createWalletRequest: vi.fn(),
    signMessage: vi.fn(),
  }));

vi.mock("@api/wallet", () => ({
  getWallets,
  getWallet: vi.fn(),
  createWalletChallenge,
  createWallet: createWalletRequest,
  updateWallet: vi.fn(),
  deleteWallet: vi.fn(),
  batchDeleteWallets: vi.fn(),
}));

class NoWalletError extends Error {}
class WalletRejectedError extends Error {}

vi.mock("@/lib/wallet-signer", () => ({
  signMessage,
  connectWallet: vi.fn(),
  hasInjectedWallet: () => true,
  NoWalletError,
  WalletRejectedError,
}));

const { notifyError, notifySuccess } = vi.hoisted(() => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}));
vi.mock("@utils/notification", () => ({ notifyError, notifySuccess }));

const { createWallet, fetchWallets } = await import("./saga");
const actionTypes = (await import("./actionTypes")).default;
const { INITIAL_STATE } = await import("./reducer");

interface Dispatched {
  type: string;
  payload?: unknown;
}

const CREATE_META = { pendingKey: "createWallet" };

const walletState = (over: Record<string, unknown> = {}) => ({
  wallet: { ...INITIAL_STATE, ...over },
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

const types = (dispatched: Dispatched[]) => dispatched.map((a) => a.type);

const CHALLENGE = {
  nonce: "nonce-1",
  message: "app.test wants you to sign in…",
  expiresAt: "2026-09-15T12:05:00.000Z",
};

const payload = {
  label: "Treasury",
  description: null,
  address: "0x1111111111111111111111111111111111111111",
  network: "BASE_SEPOLIA" as const,
  role: "BOTH" as const,
};

describe("fetchWallets saga", () => {
  beforeEach(() => {
    getWallets.mockReset();
    notifyError.mockReset();
  });

  it("sends the current page and filters", async () => {
    getWallets.mockResolvedValue({ items: [], total: 0, page: 2, limit: 20 });

    await record(
      fetchWallets,
      walletState({
        page: 2,
        limit: 20,
        filters: { q: "tre", status: "ACTIVE", network: "" },
      }),
    );

    expect(getWallets).toHaveBeenCalledWith({
      page: 2,
      limit: 20,
      q: "tre",
      status: "ACTIVE",
    });
  });

  it("omits blank filters rather than sending empty strings", async () => {
    getWallets.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

    await record(fetchWallets, walletState());

    expect(getWallets).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it("reports a failure without a toast, since the page shows the error", async () => {
    getWallets.mockRejectedValue(new Error("boom"));

    const dispatched = await record(fetchWallets, walletState());

    expect(types(dispatched)).toEqual([
      actionTypes.FETCH_WALLETS_PENDING,
      actionTypes.FETCH_WALLETS_FAILED,
    ]);
  });
});

describe("createWallet saga", () => {
  beforeEach(() => {
    createWalletChallenge.mockReset();
    createWalletRequest.mockReset();
    signMessage.mockReset();
    getWallets.mockReset();
    notifyError.mockReset();
    notifySuccess.mockReset();

    getWallets.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
  });

  it("gets a challenge, signs it, then creates the wallet", async () => {
    createWalletChallenge.mockResolvedValue(CHALLENGE);
    signMessage.mockResolvedValue("0xsig");
    createWalletRequest.mockResolvedValue({ id: "wallet_1" });

    const dispatched = await record(createWallet, walletState(), {
      type: actionTypes.CREATE_WALLET_REQUESTED,
      payload,
      meta: CREATE_META,
    });

    expect(createWalletChallenge).toHaveBeenCalledWith({
      address: payload.address,
      network: payload.network,
    });

    expect(signMessage).toHaveBeenCalledWith(
      payload.address,
      CHALLENGE.message,
    );

    expect(createWalletRequest).toHaveBeenCalledWith({
      ...payload,
      nonce: CHALLENGE.nonce,
      signature: "0xsig",
    });

    expect(types(dispatched)).toEqual([
      actionTypes.CREATE_WALLET_SUCCEEDED,
      actionTypes.FETCH_WALLETS_REQUESTED,
    ]);
    expect(notifySuccess).toHaveBeenCalled();
  });

  it("never calls create when signing fails", async () => {
    createWalletChallenge.mockResolvedValue(CHALLENGE);
    signMessage.mockRejectedValue(new Error("signing blew up"));

    const dispatched = await record(createWallet, walletState(), {
      type: actionTypes.CREATE_WALLET_REQUESTED,
      payload,
      meta: CREATE_META,
    });

    expect(createWalletRequest).not.toHaveBeenCalled();
    expect(types(dispatched)).toEqual([actionTypes.WALLET_ACTION_FAILED]);
    expect(notifyError).toHaveBeenCalled();
  });

  it("stays quiet when the user dismisses the signature prompt", async () => {
    createWalletChallenge.mockResolvedValue(CHALLENGE);
    signMessage.mockRejectedValue(new WalletRejectedError());

    const dispatched = await record(createWallet, walletState(), {
      type: actionTypes.CREATE_WALLET_REQUESTED,
      payload,
      meta: CREATE_META,
    });

    expect(types(dispatched)).toEqual([actionTypes.WALLET_ACTION_FAILED]);
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("does not sign when the challenge request fails", async () => {
    createWalletChallenge.mockRejectedValue(new Error("429"));

    await record(createWallet, walletState(), {
      type: actionTypes.CREATE_WALLET_REQUESTED,
      payload,
      meta: CREATE_META,
    });

    expect(signMessage).not.toHaveBeenCalled();
    expect(createWalletRequest).not.toHaveBeenCalled();
  });

  it("refreshes the list after a successful link", async () => {
    createWalletChallenge.mockResolvedValue(CHALLENGE);
    signMessage.mockResolvedValue("0xsig");
    createWalletRequest.mockResolvedValue({ id: "wallet_1" });

    const dispatched = await record(createWallet, walletState(), {
      type: actionTypes.CREATE_WALLET_REQUESTED,
      payload,
      meta: CREATE_META,
    });

    expect(types(dispatched)).toContain(actionTypes.FETCH_WALLETS_REQUESTED);
  });
});

describe("auth failures", () => {
  beforeEach(() => {
    getWallets.mockReset();
    createWalletChallenge.mockReset();
    signMessage.mockReset();
    notifyError.mockReset();
  });

  it("never echoes the API's auth copy at the user", async () => {
    getWallets.mockRejectedValue(
      new HttpError(401, "Unauthorized", {
        error: "unauthorized",
        message: "A valid Clerk session token is required.",
      }),
    );

    const dispatched = await record(fetchWallets, walletState());
    const failure = dispatched.find(
      (a) => a.type === actionTypes.FETCH_WALLETS_FAILED,
    );
    const message = (failure?.payload as { message: string }).message;

    expect(message).not.toContain("Clerk");
    expect(message).not.toContain("token");
    expect(message).toContain("session has expired");
  });

  it("uses the same wording for a 403", async () => {
    createWalletChallenge.mockRejectedValue(
      new HttpError(403, "Forbidden", {
        error: "account_disabled",
        message: "This account cannot be modified.",
      }),
    );

    const dispatched = await record(createWallet, walletState(), {
      type: actionTypes.CREATE_WALLET_REQUESTED,
      payload,
      meta: CREATE_META,
    });

    const failure = dispatched.find(
      (a) => a.type === actionTypes.WALLET_ACTION_FAILED,
    );
    expect((failure?.payload as { message: string }).message).toContain(
      "session has expired",
    );
  });

  it("still surfaces a real validation message from the API", async () => {
    createWalletChallenge.mockRejectedValue(
      new HttpError(409, "Conflict", {
        error: "wallet_already_linked",
        message: "You have already linked that address on this network.",
        issues: [{ path: "address", message: "is already linked" }],
      }),
    );

    const dispatched = await record(createWallet, walletState(), {
      type: actionTypes.CREATE_WALLET_REQUESTED,
      payload,
      meta: CREATE_META,
    });

    const failure = dispatched.find(
      (a) => a.type === actionTypes.WALLET_ACTION_FAILED,
    );
    const body = failure?.payload as {
      message: string;
      issues: Record<string, string>;
    };
    expect(body.message).toContain("already linked");
    expect(body.issues).toEqual({ address: "is already linked" });
  });
});
