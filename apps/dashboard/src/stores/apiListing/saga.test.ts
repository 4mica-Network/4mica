import { HttpError } from "@4mica/http";
import { runSaga } from "redux-saga";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getApiListings,
  createApiListingRequest,
  updateApiListingRequest,
  publishApiListingRequest,
  unpublishApiListingRequest,
  deleteApiListingRequest,
} = vi.hoisted(() => ({
  getApiListings: vi.fn(),
  createApiListingRequest: vi.fn(),
  updateApiListingRequest: vi.fn(),
  publishApiListingRequest: vi.fn(),
  unpublishApiListingRequest: vi.fn(),
  deleteApiListingRequest: vi.fn(),
}));

vi.mock("@api/apiListing", () => ({
  getApiListings,
  getApiListing: vi.fn(),
  createApiListing: createApiListingRequest,
  updateApiListing: updateApiListingRequest,
  replaceApiEndpoints: vi.fn(),
  publishApiListing: publishApiListingRequest,
  unpublishApiListing: unpublishApiListingRequest,
  deleteApiListing: deleteApiListingRequest,
  batchDeleteApiListings: vi.fn(),
}));

const { notifyError, notifySuccess } = vi.hoisted(() => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}));
vi.mock("@utils/notification", () => ({ notifyError, notifySuccess }));

const { createApiListing, fetchApiListings, publishApiListing } = await import(
  "./saga"
);
const actionTypes = (await import("./actionTypes")).default;
const { INITIAL_STATE } = await import("./reducer");

interface Dispatched {
  type: string;
  payload?: unknown;
}

const CREATE_META = { pendingKey: "createApiListing" };
const ROW_META = { pendingKey: "apiListing:listing_1" };

const listingState = (over: Record<string, unknown> = {}) => ({
  apiListing: { ...INITIAL_STATE, ...over },
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

const page = { items: [], total: 0, page: 1, limit: 20 };

describe("fetchApiListings saga", () => {
  beforeEach(() => {
    getApiListings.mockReset();
    notifyError.mockReset();
  });

  it("sends the current page and filters", async () => {
    getApiListings.mockResolvedValue(page);

    await record(
      fetchApiListings,
      listingState({
        page: 3,
        limit: 50,
        filters: { q: "credit", visibility: "PUBLIC", network: "BASE" },
      }),
    );

    expect(getApiListings).toHaveBeenCalledWith({
      page: 3,
      limit: 50,
      q: "credit",
      visibility: "PUBLIC",
      network: "BASE",
    });
  });

  it("omits blank filters rather than sending empty strings", async () => {
    getApiListings.mockResolvedValue(page);

    await record(fetchApiListings, listingState());

    expect(getApiListings).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it("reports a fetch failure without a toast, since the page shows it", async () => {
    getApiListings.mockRejectedValue(new Error("network down"));

    const dispatched = await record(fetchApiListings, listingState());

    expect(types(dispatched)).toEqual([
      actionTypes.FETCH_API_LISTINGS_PENDING,
      actionTypes.FETCH_API_LISTINGS_FAILED,
    ]);
    expect(notifyError).not.toHaveBeenCalled();
  });
});

describe("createApiListing saga", () => {
  beforeEach(() => {
    for (const m of [
      getApiListings,
      createApiListingRequest,
      notifyError,
      notifySuccess,
    ]) {
      m.mockReset();
    }
    getApiListings.mockResolvedValue(page);
  });

  const action = {
    type: actionTypes.CREATE_API_LISTING_REQUESTED,
    payload: { name: "Credit Limits API" },
    meta: CREATE_META,
  };

  it("refreshes the list after a create", async () => {
    createApiListingRequest.mockResolvedValue({ id: "listing_1" });

    const dispatched = await record(createApiListing, listingState(), action);

    expect(types(dispatched)).toEqual([
      actionTypes.CREATE_API_LISTING_SUCCEEDED,
      actionTypes.FETCH_API_LISTINGS_REQUESTED,
    ]);
    expect(notifySuccess).toHaveBeenCalled();
  });

  it("maps server issues onto field paths", async () => {
    createApiListingRequest.mockRejectedValue(
      new HttpError(400, "Bad Request", {
        error: "wallet_not_active",
        message: "A paused or retired wallet cannot receive payments.",
        issues: [{ path: "walletId", message: "must be an active wallet" }],
      }),
    );

    const dispatched = await record(createApiListing, listingState(), action);
    const failure = dispatched[0] as {
      type: string;
      payload: { message: string; issues: Record<string, string> };
    };

    expect(failure.type).toBe(actionTypes.API_LISTING_ACTION_FAILED);
    expect(failure.payload.issues).toEqual({
      walletId: "must be an active wallet",
    });
    expect(failure.payload.message).toBe(
      "A paused or retired wallet cannot receive payments.",
    );
  });

  it("never echoes the API's auth copy at the user", async () => {
    for (const status of [401, 403]) {
      createApiListingRequest.mockRejectedValue(
        new HttpError(status, "Unauthorized", {
          error: "unauthorized",
          message: "No user context is attached to this request.",
        }),
      );

      const dispatched = await record(createApiListing, listingState(), action);
      const failure = dispatched[0] as { payload: { message: string } };

      expect(failure.payload.message, String(status)).not.toContain(
        "user context",
      );
      expect(failure.payload.message, String(status)).toContain("session");
    }
  });

  it("still surfaces a real validation message from the API", async () => {
    createApiListingRequest.mockRejectedValue(
      new HttpError(409, "Conflict", {
        error: "slug_taken",
        message: "You already have a listing at that address.",
        issues: [
          { path: "slug", message: "is already in use on your profile" },
        ],
      }),
    );

    const dispatched = await record(createApiListing, listingState(), action);
    const failure = dispatched[0] as { payload: { message: string } };

    expect(failure.payload.message).toBe(
      "You already have a listing at that address.",
    );
  });
});

describe("publishApiListing saga", () => {
  beforeEach(() => {
    for (const m of [
      getApiListings,
      publishApiListingRequest,
      unpublishApiListingRequest,
      notifySuccess,
      notifyError,
    ]) {
      m.mockReset();
    }
    getApiListings.mockResolvedValue(page);
  });

  it("calls publish or unpublish depending on the flag", async () => {
    publishApiListingRequest.mockResolvedValue({ id: "listing_1" });
    unpublishApiListingRequest.mockResolvedValue({ id: "listing_1" });

    await record(publishApiListing, listingState(), {
      type: actionTypes.PUBLISH_API_LISTING_REQUESTED,
      payload: { id: "listing_1", publish: true },
      meta: ROW_META,
    });
    expect(publishApiListingRequest).toHaveBeenCalledWith("listing_1");

    await record(publishApiListing, listingState(), {
      type: actionTypes.PUBLISH_API_LISTING_REQUESTED,
      payload: { id: "listing_1", publish: false },
      meta: ROW_META,
    });
    expect(unpublishApiListingRequest).toHaveBeenCalledWith("listing_1");
  });

  it("surfaces listing_not_payable against the wallet field", async () => {
    publishApiListingRequest.mockRejectedValue(
      new HttpError(409, "Conflict", {
        error: "listing_not_payable",
        message: "Choose a receiving wallet before publishing.",
        issues: [
          { path: "walletId", message: "is required before publishing" },
        ],
      }),
    );

    const dispatched = await record(publishApiListing, listingState(), {
      type: actionTypes.PUBLISH_API_LISTING_REQUESTED,
      payload: { id: "listing_1", publish: true },
      meta: ROW_META,
    });
    const failure = dispatched[0] as {
      payload: { issues: Record<string, string> };
    };

    expect(failure.payload.issues.walletId).toBe(
      "is required before publishing",
    );
  });
});
