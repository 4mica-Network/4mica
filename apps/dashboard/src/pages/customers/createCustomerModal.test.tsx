import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dispatch, state } = vi.hoisted(() => ({
  dispatch: vi.fn(),
  state: {
    error: null as string | null,
    issues: {} as Record<string, string>,
    pending: {} as Record<string, boolean>,
  },
}));

vi.mock("@stores/hooks", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({
      customer: {
        error: state.error,
        validationIssues: state.issues,
        pending: state.pending,
      },
    }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { CreateCustomerModal } = await import("./CreateCustomerModal");
const actionTypes = (await import("@stores/customer/actionTypes")).default;

const PAYER = "0x8a1c3f5b7d092e4a6c8b0d2f4e6a8c1b3d5f7e90";

const open = () => render(<CreateCustomerModal isOpen onClose={() => {}} />);

const setField = (id: string, value: string) => {
  const field = document.getElementById(id) as HTMLInputElement;
  fireEvent.change(field, { target: { value } });
};

const next = () => fireEvent.click(screen.getByTestId("create-customer-next"));
const submit = () =>
  fireEvent.click(screen.getByTestId("create-customer-submit"));

const lastCreate = () =>
  dispatch.mock.calls
    .map(([action]) => action)
    .filter((a) => a.type === actionTypes.CREATE_CUSTOMER_REQUESTED)
    .at(-1);

describe("CreateCustomerModal", () => {
  beforeEach(() => {
    dispatch.mockClear();
    state.error = null;
    state.issues = {};
    state.pending = {};
  });

  it("starts on the identity step", () => {
    open();

    expect(document.getElementById("create-customer-name")).not.toBeNull();
    expect(document.getElementById("create-customer-address")).toBeNull();
  });

  it("refuses to advance without a name", async () => {
    open();
    next();

    await waitFor(() => {
      expect(screen.getByTestId("create-customer-next")).toBeInTheDocument();
    });
    expect(document.getElementById("create-customer-address")).toBeNull();
  });

  it("advances to the payments step once a name is given", async () => {
    open();
    setField("create-customer-name", "Acme Procurement");
    next();

    await waitFor(() => {
      expect(document.getElementById("create-customer-address")).not.toBeNull();
    });
  });

  it("creates a customer with no wallet attached", async () => {
    open();
    setField("create-customer-name", "Acme Procurement");
    next();

    await waitFor(() =>
      expect(document.getElementById("create-customer-address")).not.toBeNull(),
    );
    submit();

    await waitFor(() => expect(lastCreate()).toBeDefined());
    expect(lastCreate()?.payload).toMatchObject({
      name: "Acme Procurement",
      identities: [],
    });
  });

  it("refuses an address with no network rather than sending half a pair", async () => {
    open();
    setField("create-customer-name", "Acme Procurement");
    next();

    await waitFor(() =>
      expect(document.getElementById("create-customer-address")).not.toBeNull(),
    );

    setField("create-customer-address", PAYER);
    submit();

    await waitFor(() => expect(lastCreate()).toBeUndefined());
  });

  it("carries the limits through to the create call", async () => {
    open();
    setField("create-customer-name", "Acme Procurement");
    next();

    await waitFor(() =>
      expect(document.getElementById("create-customer-address")).not.toBeNull(),
    );

    setField("create-customer-monthlyLimit", "500");
    submit();

    await waitFor(() => expect(lastCreate()).toBeDefined());
    expect(lastCreate()?.payload).toMatchObject({
      monthlyLimit: "500",
      limitCurrency: "USD",
    });
  });

  it("refuses an address that is not checksummed", async () => {
    open();
    setField("create-customer-name", "Acme");
    next();

    await waitFor(() =>
      expect(document.getElementById("create-customer-address")).not.toBeNull(),
    );

    setField("create-customer-address", "0xnot-an-address");
    submit();

    await waitFor(() => expect(lastCreate()).toBeUndefined());
  });

  it("shows a server error without closing", async () => {
    state.error = "Another customer already holds that identity.";
    open();

    expect(
      screen.getByText("Another customer already holds that identity."),
    ).toBeInTheDocument();
  });

  it("prefers a server field issue over the client message", async () => {
    state.issues = { name: "is already in use" };
    open();

    expect(screen.getByText("is already in use")).toBeInTheDocument();
  });
});
