import type { Customer, CustomerOverview } from "@stores/customer/type";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));

vi.mock("@stores/hooks", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (s: unknown) => unknown) =>
    selector({
      customer: { pending: {}, validationIssues: {}, error: null },
    }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { IdentitiesPanel } = await import("./IdentitiesPanel");
const { LimitsPanel } = await import("./LimitsPanel");

const CARD = /rounded-lg border border-overlay\/10/;

const customer = (over: Partial<Customer> = {}): Customer => ({
  id: "customer_1",
  name: "Acme Procurement",
  email: "ops@acme.example",
  type: "ORGANIZATION",
  status: "ACTIVE",
  description: null,
  notes: null,
  dailyLimit: "50",
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
  totalSpend: [],
  recentSpend: [],
  txnCount: 0,
  settledCount: 0,
  failedCount: 0,
  lastActiveAt: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  ...over,
});

const overview = (over: Partial<CustomerOverview> = {}): CustomerOverview => ({
  totalSpend: [],
  recentSpend: [{ network: "BASE_SEPOLIA", assetAddress: null, amount: "120" }],
  txnCount: 3,
  settledCount: 3,
  failedCount: 0,
  lastActiveAt: null,
  firstSeenAt: null,
  ...over,
});

describe("IdentitiesPanel", () => {
  beforeEach(() => {
    dispatch.mockClear();
  });

  const renderPanel = (over: Partial<Customer> = {}) =>
    render(
      <MemoryRouter>
        <IdentitiesPanel customer={customer(over)} />
      </MemoryRouter>,
    );

  it("lists every identity as a row inside one card", () => {
    renderPanel();

    const rows = ["identity_1", "identity_2"].map((id) =>
      screen.getByTestId(`customer-identity-${id}`),
    );

    for (const row of rows) {
      expect(row.className).not.toMatch(CARD);
      expect(row.closest(`[class*="rounded-lg"]`)?.className).toMatch(CARD);
    }

    // Both rows share the one card rather than getting a border each.
    expect(rows[0].closest(`[class*="rounded-lg"]`)).toBe(
      rows[1].closest(`[class*="rounded-lg"]`),
    );
  });

  it("keeps no rule between the identity rows", () => {
    renderPanel();

    const card = screen
      .getByTestId("customer-identity-identity_1")
      .closest(`[class*="rounded-lg"]`);

    expect(card?.innerHTML).not.toContain("divide-y");
  });

  it("leads a wallet identity with its address and an explorer link", () => {
    renderPanel();

    const link = screen.getByText("0x8a1c…7e90").closest("a");

    expect(link?.getAttribute("href")).toContain("sepolia.basescan.org");
    expect(link?.getAttribute("target")).toBe("_blank");
  });

  it("leads a non-wallet identity with its value", () => {
    renderPanel();

    expect(screen.getByText("ops@acme.example")).toBeInTheDocument();
  });

  it("offers a card to add another identity", () => {
    renderPanel();

    expect(screen.getByTestId("customer-identity-add")).toBeInTheDocument();
  });

  it("explains itself in a card when there are no identities", () => {
    renderPanel({ identities: [] });

    const empty = screen.getByText("customer.identity.empty");

    expect(empty.closest("div")?.className).toMatch(CARD);
  });
});

describe("LimitsPanel", () => {
  const renderPanel = (over: Partial<Customer> = {}, ov = overview()) =>
    render(<LimitsPanel customer={customer(over)} overview={ov} />);

  it("lists both limits as rows inside one card", () => {
    renderPanel();

    const rows = ["customer-limit-monthly", "customer-limit-daily"].map((id) =>
      screen.getByTestId(id),
    );

    for (const row of rows) {
      expect(row.className).not.toMatch(CARD);
    }

    expect(rows[0].closest(`[class*="rounded-lg"]`)).toBe(
      rows[1].closest(`[class*="rounded-lg"]`),
    );
  });

  it("measures the monthly limit against the last 30 days", () => {
    renderPanel();

    const card = screen.getByTestId("customer-limit-monthly");

    expect(card.textContent).toContain("500");
    expect(card.textContent).toContain("customer.limits.within");
  });

  it("flags an over-limit customer in the danger colour", () => {
    renderPanel(
      {},
      overview({
        recentSpend: [
          { network: "BASE_SEPOLIA", assetAddress: null, amount: "900" },
        ],
      }),
    );

    const card = screen.getByTestId("customer-limit-monthly");

    expect(card.textContent).toContain("customer.limits.over");
    expect(card.innerHTML).toContain("bg-danger");
  });

  it("states the daily limit without inventing a daily spend figure", () => {
    renderPanel();

    const card = screen.getByTestId("customer-limit-daily");

    expect(card.textContent).toContain("50");
    expect(card.textContent).not.toContain("customer.limits.within");
    expect(card.textContent).not.toContain("customer.limits.spent");
  });

  it("explains itself in a card when no limits are set", () => {
    renderPanel({ dailyLimit: null, monthlyLimit: null });

    const empty = screen.getByText("customer.limits.none");

    expect(empty.closest("div")?.className).toMatch(CARD);
  });

  it("omits a limit card the customer does not have", () => {
    renderPanel({ dailyLimit: null });

    expect(screen.getByTestId("customer-limit-monthly")).toBeInTheDocument();
    expect(screen.queryByTestId("customer-limit-daily")).toBeNull();
  });
});
