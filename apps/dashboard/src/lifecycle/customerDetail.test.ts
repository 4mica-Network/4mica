import { runSaga } from "redux-saga";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getCustomer: vi.fn(),
  getCustomerOverview: vi.fn(),
  getCustomerCredit: vi.fn(),
}));

vi.mock("@api/customer", () => api);

const { fetchCustomerDetail, fetchCustomerCredit } = await import(
  "@stores/customer/saga"
);
const { INITIAL_STATE } = await import("@stores/customer/reducer");

const showing = (id: string) => ({
  customer: { ...INITIAL_STATE, detail: { ...INITIAL_STATE.detail, id } },
});

const run = async (
  saga: (action: { type: string; payload: { id: string } }) => Generator,
  state: unknown,
  id: string,
) => {
  const dispatched: { type: string }[] = [];
  await runSaga(
    {
      dispatch: (action: { type: string }) => dispatched.push(action),
      getState: () => state,
    },
    saga,
    { type: "", payload: { id } },
  ).toPromise();
  return dispatched.map((action) => action.type);
};

describe("customer detail after navigating to another customer", () => {
  beforeEach(() => {
    api.getCustomer.mockResolvedValue({ id: "cus_a", name: "A" });
    api.getCustomerOverview.mockResolvedValue(null);
    api.getCustomerCredit.mockResolvedValue({ balance: {}, items: [] });
  });

  it("drops customer A's record once customer B is open", async () => {
    const types = await run(fetchCustomerDetail, showing("cus_b"), "cus_a");

    expect(types).not.toContain("FETCH_CUSTOMER_DETAIL_SUCCEEDED");
    expect(types).not.toContain("FETCH_CUSTOMER_ACTIVITY_REQUESTED");
  });

  it("drops customer A's credit once customer B is open", async () => {
    const types = await run(fetchCustomerCredit, showing("cus_b"), "cus_a");

    expect(types).not.toContain("FETCH_CUSTOMER_CREDIT_SUCCEEDED");
  });

  it("applies the record for the customer that is open", async () => {
    const types = await run(fetchCustomerDetail, showing("cus_a"), "cus_a");

    expect(types).toContain("FETCH_CUSTOMER_DETAIL_SUCCEEDED");
  });
});
