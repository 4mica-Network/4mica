import type { Customer } from "@stores/customer/type";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));

vi.mock("@stores/hooks", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({ customer: { pending: {}, selectedIds: [], items: [] } }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { CustomerRow } = await import("./CustomerRow");

const customer = (over: Partial<Customer> = {}): Customer => ({
  id: "customer_1",
  name: "Acme Procurement",
  email: "ops@acme.example",
  type: "ORGANIZATION",
  status: "ACTIVE",
  description: null,
  notes: null,
  dailyLimit: null,
  monthlyLimit: "500",
  limitCurrency: "USD",
  identities: [
    {
      id: "identity_1",
      type: "WALLET",
      network: "BASE_SEPOLIA",
      address: "0x8a1c3f5b7d092e4a6c8b0d2f4e6a8c1b3d5f7e90",
      value: null,
      source: "VERIFIED",
      verifiedAt: "2026-09-01T00:00:00.000Z",
      validFrom: null,
      validUntil: null,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    },
  ],
  totalSpend: [
    { network: "BASE_SEPOLIA", assetAddress: null, amount: "0.340000" },
  ],
  recentSpend: [],
  txnCount: 12,
  settledCount: 10,
  failedCount: 1,
  lastActiveAt: new Date(Date.now() - 12 * 60000).toISOString(),
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  ...over,
});

const renderRow = (over: Partial<Customer> = {}) =>
  render(
    <MemoryRouter>
      <CustomerRow customer={customer(over)} onDelete={() => {}} />
    </MemoryRouter>,
  );

describe("CustomerRow", () => {
  it("links the name to the customer's own page", () => {
    renderRow();

    expect(
      screen.getByTestId("customer-name-customer_1").getAttribute("href"),
    ).toBe("/customers/customer_1");
  });

  it("trims the trailing zeros off a spend amount", () => {
    renderRow();

    expect(screen.getByText("0.34")).toBeInTheDocument();
  });

  it("shows a dash-free placeholder when there is no spend", () => {
    renderRow({ totalSpend: [] });

    expect(screen.getByText("customer.row.noSpend")).toBeInTheDocument();
  });

  it("shortens the wallet address rather than overflowing the row", () => {
    renderRow();

    expect(screen.getByText("0x8a1c…7e90")).toBeInTheDocument();
  });

  it("says when the customer was last active", () => {
    renderRow();

    expect(screen.getByText("12m ago")).toBeInTheDocument();
  });

  it("says so when the customer has never paid", () => {
    renderRow({ lastActiveAt: null });

    expect(screen.getByText("customer.row.neverActive")).toBeInTheDocument();
  });

  it("marks a blocked customer with the danger variant", () => {
    renderRow({ status: "BLOCKED" });

    expect(screen.getByText("customer.status.blocked")).toBeInTheDocument();
  });

  it("counts the identities it could not show inline", () => {
    renderRow({
      identities: [
        ...customer().identities,
        {
          id: "identity_2",
          type: "EMAIL",
          network: null,
          address: null,
          value: "ops@acme.example",
          source: "MANUAL",
          verifiedAt: null,
          validFrom: null,
          validUntil: null,
          createdAt: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    });

    expect(screen.getByText("customer.row.moreIdentities")).toBeInTheDocument();
  });

  it("keeps the checkbox clickable above the row's overlay link", () => {
    renderRow();

    const box = screen.getByTestId("customer-select-customer_1-checkbox");

    expect(box.className).toMatch(/z-10/);
  });
});
