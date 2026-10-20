import { HttpError } from "@4mica/http";
import { runSaga } from "redux-saga";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getCustomers,
  getCustomer,
  getCustomerOverview,
  getCustomerActivity,
  createCustomerRequest,
  updateCustomerRequest,
  deleteCustomerRequest,
  addIdentityRequest,
  removeIdentityRequest,
} = vi.hoisted(() => ({
  getCustomers: vi.fn(),
  getCustomer: vi.fn(),
  getCustomerOverview: vi.fn(),
  getCustomerActivity: vi.fn(),
  createCustomerRequest: vi.fn(),
  updateCustomerRequest: vi.fn(),
  deleteCustomerRequest: vi.fn(),
  addIdentityRequest: vi.fn(),
  removeIdentityRequest: vi.fn(),
}));

vi.mock("@api/customer", () => ({
  getCustomers,
  getCustomer,
  getCustomerOverview,
  getCustomerActivity,
  createCustomer: createCustomerRequest,
  updateCustomer: updateCustomerRequest,
  deleteCustomer: deleteCustomerRequest,
  batchDeleteCustomers: vi.fn(),
  addCustomerIdentity: addIdentityRequest,
  updateCustomerIdentity: vi.fn(),
  removeCustomerIdentity: removeIdentityRequest,
}));

const { notifyError, notifySuccess } = vi.hoisted(() => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}));
vi.mock("@/lib/notify", () => ({ notifyError, notifySuccess }));

const {
  addCustomerIdentity,
  createCustomer,
  deleteCustomer,
  fetchCustomerActivity,
  fetchCustomerDetail,
  fetchCustomers,
  removeCustomerIdentity,
} = await import("./saga");
const actionTypes = (await import("./actionTypes")).default;
const { INITIAL_STATE } = await import("./reducer");

interface Dispatched {
  type: string;
  payload?: unknown;
}

const CREATE_META = { pendingKey: "createCustomer" };
const ROW_META = { pendingKey: "customer:customer_1" };
const IDENTITY_META = { pendingKey: "customerIdentity" };

const customerState = (over: Record<string, unknown> = {}) => ({
  customer: { ...INITIAL_STATE, ...over },
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

const customer = {
  id: "customer_1",
  name: "Acme",
  identities: [],
  totalSpend: [],
  recentSpend: [],
  txnCount: 0,
};
const listPage = { items: [], total: 0, page: 1, limit: 20 };
const activityPage = { items: [], total: 0, page: 1, limit: 10 };

describe("fetchCustomers saga", () => {
  beforeEach(() => {
    getCustomers.mockReset();
    getCustomers.mockResolvedValue(listPage);
  });

  it("omits blank filters rather than sending empty strings", async () => {
    await record(fetchCustomers, customerState());

    expect(getCustomers).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      sort: "-totalSpend",
    });
  });

  it("sends every filter the user actually set", async () => {
    await record(
      fetchCustomers,
      customerState({
        page: 2,
        filters: {
          q: "acme",
          type: "ORGANIZATION",
          status: "ACTIVE",
          network: "BASE_SEPOLIA",
          sort: "-txnCount",
        },
      }),
    );

    expect(getCustomers).toHaveBeenCalledWith({
      page: 2,
      limit: 20,
      sort: "-txnCount",
      q: "acme",
      type: "ORGANIZATION",
      status: "ACTIVE",
      network: "BASE_SEPOLIA",
    });
  });

  it("reports a pending state before the request resolves", async () => {
    const dispatched = await record(fetchCustomers, customerState());

    expect(types(dispatched)).toEqual([
      actionTypes.FETCH_CUSTOMERS_PENDING,
      actionTypes.FETCH_CUSTOMERS_SUCCEEDED,
    ]);
  });

  it("never echoes the API's auth copy at the user", async () => {
    getCustomers.mockRejectedValue(
      new HttpError(401, "Unauthorized", {
        message: "A valid Clerk session token is required.",
      }),
    );

    const dispatched = await record(fetchCustomers, customerState());
    const failure = dispatched.at(-1) as {
      payload: { message: string };
    };

    expect(failure.payload.message).not.toContain("Clerk");
    expect(failure.payload.message).toContain("session has expired");
  });
});

describe("customer detail saga", () => {
  beforeEach(() => {
    for (const mock of [
      getCustomer,
      getCustomerOverview,
      getCustomerActivity,
    ]) {
      mock.mockReset();
    }
    getCustomer.mockResolvedValue(customer);
    getCustomerOverview.mockResolvedValue({ txnCount: 0 });
    getCustomerActivity.mockResolvedValue(activityPage);
  });

  it("loads the record and its totals together", async () => {
    const dispatched = await record(fetchCustomerDetail, customerState(), {
      type: "",
      payload: { id: "customer_1" },
    });

    expect(getCustomer).toHaveBeenCalledWith("customer_1");
    expect(getCustomerOverview).toHaveBeenCalledWith("customer_1");
    expect(types(dispatched)).toContain(
      actionTypes.FETCH_CUSTOMER_DETAIL_SUCCEEDED,
    );
  });

  it("kicks off the activity fetch once the record is in", async () => {
    const dispatched = await record(fetchCustomerDetail, customerState(), {
      type: "",
      payload: { id: "customer_1" },
    });

    expect(types(dispatched)).toContain(
      actionTypes.FETCH_CUSTOMER_ACTIVITY_REQUESTED,
    );
  });

  it("pages the activity list from its own page, not the list's", async () => {
    await record(
      fetchCustomerActivity,
      customerState({
        page: 7,
        detail: {
          ...INITIAL_STATE.detail,
          activity: { items: [], total: 0, page: 3, limit: 10 },
        },
      }),
      { type: "", payload: { id: "customer_1" } },
    );

    expect(getCustomerActivity).toHaveBeenCalledWith("customer_1", {
      page: 3,
      limit: 10,
    });
  });

  it("stays quiet when only the activity fetch fails", async () => {
    getCustomerActivity.mockRejectedValue(new Error("network"));

    const dispatched = await record(fetchCustomerActivity, customerState(), {
      type: "",
      payload: { id: "customer_1" },
    });

    expect(dispatched).toEqual([]);
    expect(notifyError).not.toHaveBeenCalled();
  });
});

describe("customer writes", () => {
  beforeEach(() => {
    for (const mock of [
      createCustomerRequest,
      updateCustomerRequest,
      deleteCustomerRequest,
      addIdentityRequest,
      removeIdentityRequest,
      getCustomer,
      getCustomerActivity,
      notifyError,
      notifySuccess,
    ]) {
      mock.mockReset();
    }
    createCustomerRequest.mockResolvedValue(customer);
    deleteCustomerRequest.mockResolvedValue(undefined);
    addIdentityRequest.mockResolvedValue(customer);
    removeIdentityRequest.mockResolvedValue(undefined);
    getCustomer.mockResolvedValue(customer);
    getCustomerActivity.mockResolvedValue(activityPage);
  });

  it("refreshes the list after a create", async () => {
    const dispatched = await record(createCustomer, customerState(), {
      type: "",
      payload: { name: "Acme" },
      meta: CREATE_META,
    });

    expect(types(dispatched)).toEqual([
      actionTypes.CREATE_CUSTOMER_SUCCEEDED,
      actionTypes.FETCH_CUSTOMERS_REQUESTED,
    ]);
    expect(notifySuccess).toHaveBeenCalled();
  });

  it("maps a 409 onto the field that collided", async () => {
    createCustomerRequest.mockRejectedValue(
      new HttpError(409, "Conflict", {
        message:
          "Another customer in this account already holds that identity.",
        issues: [
          {
            path: "address",
            message: "is already mapped to one of your customers",
          },
        ],
      }),
    );

    const dispatched = await record(createCustomer, customerState(), {
      type: "",
      payload: { name: "Acme" },
      meta: CREATE_META,
    });

    const failure = dispatched[0] as {
      payload: { issues: Record<string, string> };
    };

    expect(failure.payload.issues.address).toBe(
      "is already mapped to one of your customers",
    );
    expect(notifyError).toHaveBeenCalled();
  });

  it("refreshes the list after a delete", async () => {
    const dispatched = await record(deleteCustomer, customerState(), {
      type: "",
      payload: { id: "customer_1" },
      meta: ROW_META,
    });

    expect(types(dispatched)).toEqual([
      actionTypes.DELETE_CUSTOMER_SUCCEEDED,
      actionTypes.FETCH_CUSTOMERS_REQUESTED,
    ]);
  });

  it("refetches activity when a wallet is attached, so history appears at once", async () => {
    const dispatched = await record(addCustomerIdentity, customerState(), {
      type: "",
      payload: {
        id: "customer_1",
        data: { type: "WALLET", network: "BASE_SEPOLIA", address: "0xabc" },
      },
      meta: IDENTITY_META,
    });

    expect(types(dispatched)).toEqual([
      actionTypes.CUSTOMER_IDENTITY_CHANGED,
      actionTypes.FETCH_CUSTOMER_ACTIVITY_REQUESTED,
    ]);
  });

  it("re-reads the customer after detaching an identity", async () => {
    const dispatched = await record(removeCustomerIdentity, customerState(), {
      type: "",
      payload: { id: "customer_1", identityId: "identity_1" },
      meta: { pendingKey: "customerIdentity:identity_1" },
    });

    expect(removeIdentityRequest).toHaveBeenCalledWith(
      "customer_1",
      "identity_1",
    );
    expect(getCustomer).toHaveBeenCalledWith("customer_1");
    expect(types(dispatched)).toContain(actionTypes.CUSTOMER_IDENTITY_CHANGED);
  });
});
