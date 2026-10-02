import type { Customer, CustomerOverview } from "@stores/customer/type";
import { fireEvent, render, screen } from "@testing-library/react";
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

const { AccessPanel } = await import("./AccessPanel");
const { IdentitiesPanel } = await import("./IdentitiesPanel");
const { LimitsPanel } = await import("./LimitsPanel");
const { PolicyPanel } = await import("./PolicyPanel");

const CARD = /rounded-lg border border-overlay\/10/;

const customer = (over: Partial<Customer> = {}): Customer => ({
  id: "customer_1",
  name: "Acme Procurement",
  email: "ops@acme.example",
  type: "ORGANIZATION",
  status: "ACTIVE",
  statusReason: null,
  suspendedUntil: null,
  description: null,
  notes: null,
  dailyLimit: "50",
  monthlyLimit: "500",
  limitCurrency: "USD",
  freeQuotaUnit: null,
  freeQuota: null,
  freeQuotaPeriod: null,
  quotaResetAt: null,
  quotaUsed: null,
  quotaRemaining: null,
  discountPercent: null,
  discountFixed: null,
  minPaymentAmount: null,
  approvalThreshold: null,
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
      blockedAt: null,
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
      blockedAt: null,
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

  it("blocks one address without touching the customer", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("customer-identity-block-identity_1"));

    const action = dispatch.mock.calls.at(-1)?.[0];

    expect(action?.payload).toMatchObject({
      identityId: "identity_1",
      data: { blocked: true },
    });
  });

  it("unblocks an address that is already blocked", () => {
    const [wallet, email] = customer().identities;
    render(
      <MemoryRouter>
        <IdentitiesPanel
          customer={customer({
            identities: [
              { ...wallet, blockedAt: "2026-10-01T00:00:00.000Z" },
              email,
            ],
          })}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("customer-identity-block-identity_1"));

    expect(dispatch.mock.calls.at(-1)?.[0]?.payload.data).toEqual({
      blocked: false,
    });
  });

  it("marks a blocked address in the row", () => {
    const [wallet, email] = customer().identities;
    render(
      <MemoryRouter>
        <IdentitiesPanel
          customer={customer({
            identities: [
              { ...wallet, blockedAt: "2026-10-01T00:00:00.000Z" },
              email,
            ],
          })}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("customer.identity.blocked")).toBeInTheDocument();
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

describe("AccessPanel", () => {
  beforeEach(() => {
    dispatch.mockClear();
  });

  const renderPanel = (over: Partial<Customer> = {}) =>
    render(<AccessPanel customer={customer(over)} />);

  const lastAction = () => dispatch.mock.calls.at(-1)?.[0];

  it("offers block and suspend while the customer is active", () => {
    renderPanel();

    expect(screen.getByTestId("customer-block")).toBeInTheDocument();
    expect(screen.getByTestId("customer-suspend-30")).toBeInTheDocument();
    expect(screen.queryByTestId("customer-unblock")).toBeNull();
  });

  it("offers only reactivate once blocked", () => {
    renderPanel({ status: "BLOCKED" });

    expect(screen.getByTestId("customer-unblock")).toBeInTheDocument();
    expect(screen.queryByTestId("customer-block")).toBeNull();
    expect(screen.queryByTestId("customer-suspend-30")).toBeNull();
  });

  it("sends the reason the owner typed when blocking", () => {
    renderPanel();

    const field = document.getElementById("access-reason") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "chargeback fraud" } });
    fireEvent.click(screen.getByTestId("customer-block"));

    expect(lastAction()?.payload.data).toEqual({
      status: "BLOCKED",
      reason: "chargeback fraud",
    });
  });

  it("sends a null reason rather than an empty string", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("customer-block"));

    expect(lastAction()?.payload.data.reason).toBeNull();
  });

  it("suspends with a future end date", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("customer-suspend-7"));

    const data = lastAction()?.payload.data;

    expect(data.status).toBe("SUSPENDED");
    expect(new Date(data.suspendedUntil).getTime()).toBeGreaterThan(Date.now());
  });

  it("reactivates without a reason or an end date", () => {
    renderPanel({ status: "SUSPENDED" });
    fireEvent.click(screen.getByTestId("customer-unblock"));

    expect(lastAction()?.payload.data).toEqual({ status: "ACTIVE" });
  });

  it("shows the reason and window it was given", () => {
    renderPanel({
      status: "SUSPENDED",
      statusReason: "late payment",
      suspendedUntil: "2026-12-01T00:00:00.000Z",
    });

    expect(screen.getByText("late payment")).toBeInTheDocument();
    expect(
      screen.getByText("customer.access.suspendedUntil"),
    ).toBeInTheDocument();
  });
});

describe("PolicyPanel", () => {
  beforeEach(() => {
    dispatch.mockClear();
  });

  const renderPanel = (over: Partial<Customer> = {}) =>
    render(<PolicyPanel customer={customer(over)} />);

  const lastAction = () => dispatch.mock.calls.at(-1)?.[0];

  const type = (id: string, value: string) =>
    fireEvent.change(document.getElementById(id) as HTMLInputElement, {
      target: { value },
    });

  it("hides the allowance amount until a unit is picked", () => {
    renderPanel();

    // The library Select renders its test id with a -select suffix;
    // TextInput keeps a real DOM id.
    expect(screen.getByTestId("policy-quota-unit-select")).toBeInTheDocument();
    expect(document.getElementById("policy-quota")).toBeNull();
    expect(screen.queryByTestId("policy-quota-period-select")).toBeNull();
  });

  it("shows the allowance amount and period once a unit is set", () => {
    renderPanel({
      freeQuotaUnit: "REQUESTS",
      freeQuota: "500",
      freeQuotaPeriod: "MONTH",
    });

    expect(document.getElementById("policy-quota")).not.toBeNull();
    expect(
      screen.getByTestId("policy-quota-period-select"),
    ).toBeInTheDocument();
  });

  it("keeps Update disabled until something changes", () => {
    renderPanel();

    expect(
      screen.getByRole("button", { name: "settings.update" }),
    ).toBeDisabled();
  });

  it("sends the discounts and thresholds the owner typed", () => {
    renderPanel();

    type("policy-discount-percent", "10");
    type("policy-discount-fixed", "0.50");
    type("policy-min-payment", "0.01");
    type("policy-approval", "100");
    fireEvent.click(screen.getByRole("button", { name: "settings.update" }));

    expect(lastAction()?.payload.data).toMatchObject({
      discountPercent: "10",
      discountFixed: "0.50",
      minPaymentAmount: "0.01",
      approvalThreshold: "100",
    });
  });

  it("sends nulls rather than empty strings for untouched fields", () => {
    renderPanel();

    type("policy-discount-percent", "10");
    fireEvent.click(screen.getByRole("button", { name: "settings.update" }));

    expect(lastAction()?.payload.data).toMatchObject({
      discountFixed: null,
      minPaymentAmount: null,
      approvalThreshold: null,
      freeQuotaUnit: null,
    });
  });

  it("clears the whole allowance triple when the unit is cleared", () => {
    renderPanel({
      freeQuotaUnit: "REQUESTS",
      freeQuota: "500",
      freeQuotaPeriod: "MONTH",
    });

    type("policy-discount-percent", "5");
    fireEvent.click(screen.getByRole("button", { name: "settings.update" }));

    const data = lastAction()?.payload.data;

    expect(data.freeQuotaUnit).toBe("REQUESTS");
    expect(data.freeQuota).toBe("500");
    expect(data.freeQuotaPeriod).toBe("MONTH");
  });

  it("shows allowance usage against the quota", () => {
    renderPanel({
      freeQuotaUnit: "REQUESTS",
      freeQuota: "500",
      freeQuotaPeriod: "MONTH",
      quotaUsed: "41",
      quotaRemaining: "459",
    });

    const card = screen.getByTestId("customer-quota-usage");

    expect(card.textContent).toContain("customer.policy.usageCount");
    expect(card.textContent).toContain("customer.policy.usageRemaining");
  });

  it("flags an exhausted allowance in the danger colour", () => {
    renderPanel({
      freeQuotaUnit: "REQUESTS",
      freeQuota: "500",
      freeQuotaPeriod: "MONTH",
      quotaUsed: "500",
      quotaRemaining: "0",
    });

    const card = screen.getByTestId("customer-quota-usage");

    expect(card.textContent).toContain("customer.policy.usageExhausted");
    expect(card.innerHTML).toContain("bg-danger");
  });

  it("hides the usage card when there is no allowance", () => {
    renderPanel();

    expect(screen.queryByTestId("customer-quota-usage")).toBeNull();
  });

  it("resets the allowance without sending any other field", () => {
    renderPanel({
      freeQuotaUnit: "REQUESTS",
      freeQuota: "500",
      freeQuotaPeriod: "MONTH",
      quotaUsed: "41",
      quotaRemaining: "459",
    });

    fireEvent.click(screen.getByTestId("customer-reset-usage"));

    expect(lastAction()?.payload).toEqual({ id: "customer_1" });
  });
});
