import type { Customer, CustomerOverview } from "@stores/customer/type";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));

const storeState = {
  customer: {
    pending: {} as Record<string, boolean>,
    validationIssues: {} as Record<string, string>,
    error: null as string | null,
    detail: {
      credit: null as unknown,
      creditEntries: [] as unknown[],
      coupons: [] as unknown[],
    },
  },
};

vi.mock("@stores/hooks", () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (selector: (s: unknown) => unknown) => selector(storeState),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}));

const { AccessPanel } = await import("./AccessPanel");
const { IdentitiesPanel } = await import("./IdentitiesPanel");
const { LimitsPanel } = await import("./LimitsPanel");
const { PolicyPanel } = await import("./PolicyPanel");
const { CreditPanel } = await import("./CreditPanel");
const { CouponsPanel } = await import("./CouponsPanel");
const { RemovePanel } = await import("./RemovePanel");

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

    expect(rows[0].closest(`[class*="rounded-lg"]`)).toBe(
      rows[1].closest(`[class*="rounded-lg"]`),
    );
  });

  it("rules the identity rows apart", () => {
    renderPanel();

    const list = screen.getByTestId(
      "customer-identity-identity_1",
    ).parentElement;

    expect(list?.className).toContain("divide-y");
  });

  it("keeps the row actions hidden until the row is hovered", () => {
    renderPanel();

    const actions = screen
      .getByTestId("customer-identity-remove-identity_1")
      .closest("div");

    expect(actions?.className).toContain("lg:opacity-0");
    expect(actions?.className).toContain("lg:group-hover:opacity-100");
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

  it("shows an empty state rather than a bare line when there are none", () => {
    renderPanel({ identities: [] });

    expect(
      screen.getByTestId("customer-identity-empty-empty-state"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("customer.identity.emptyTitle"),
    ).toBeInTheDocument();
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

  it("shows an empty state when no limits are set", () => {
    renderPanel({ dailyLimit: null, monthlyLimit: null });

    expect(
      screen.getByTestId("customer-limits-empty-empty-state"),
    ).toBeInTheDocument();
  });

  it("omits a limit card the customer does not have", () => {
    renderPanel({ dailyLimit: null });

    expect(screen.getByTestId("customer-limit-monthly")).toBeInTheDocument();
    expect(screen.queryByTestId("customer-limit-daily")).toBeNull();
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

  it("shows an empty state when no limits are set", () => {
    renderPanel({ dailyLimit: null, monthlyLimit: null });

    expect(
      screen.getByTestId("customer-limits-empty-empty-state"),
    ).toBeInTheDocument();
  });

  it("omits a limit card the customer does not have", () => {
    renderPanel({ dailyLimit: null });

    expect(screen.getByTestId("customer-limit-monthly")).toBeInTheDocument();
    expect(screen.queryByTestId("customer-limit-daily")).toBeNull();
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
    fireEvent.click(
      screen.getByTestId(
        "customer-reset-usage-popup-confirm-confirm-popup-confirm",
      ),
    );

    expect(lastAction()?.payload).toEqual({ id: "customer_1" });
  });
});

describe("CreditPanel", () => {
  beforeEach(() => {
    dispatch.mockClear();
    storeState.customer.detail.credit = null;
    storeState.customer.detail.creditEntries = [];
  });

  const renderPanel = () => render(<CreditPanel customer={customer()} />);
  const lastAction = () => dispatch.mock.calls.at(-1)?.[0];

  it("shows a zero balance when nothing was ever granted", () => {
    renderPanel();

    const card = screen.getByTestId("customer-credit-balance");

    expect(card.textContent).toContain("0 USD");
  });

  it("splits the balance into promotional and prepaid", () => {
    storeState.customer.detail.credit = {
      total: "25.5",
      promotional: "5",
      prepaid: "20.5",
    };

    renderPanel();

    const card = screen.getByTestId("customer-credit-balance");

    expect(card.textContent).toContain("25.5 USD");
    expect(card.textContent).toContain("customer.credit.split");
  });

  it("offers to clear only once there is a balance", () => {
    renderPanel();
    expect(screen.queryByTestId("customer-credit-zero")).toBeNull();

    storeState.customer.detail.credit = {
      total: "5",
      promotional: "5",
      prepaid: "0",
    };
    renderPanel();
    expect(
      screen.getAllByTestId("customer-credit-zero").length,
    ).toBeGreaterThan(0);
  });

  it("grants credit with the kind, amount and reason given", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("customer-credit-add"));

    fireEvent.change(
      document.getElementById("credit-amount") as HTMLInputElement,
      {
        target: { value: "5.00" },
      },
    );
    fireEvent.change(
      document.getElementById("credit-reason") as HTMLInputElement,
      {
        target: { value: "launch offer" },
      },
    );
    fireEvent.click(screen.getByTestId("customer-credit-save"));

    expect(lastAction()?.payload.data).toEqual({
      kind: "PROMOTIONAL",
      amount: "5.00",
      reason: "launch offer",
    });
  });

  it("sends a null reason rather than an empty string", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("customer-credit-add"));

    fireEvent.change(
      document.getElementById("credit-amount") as HTMLInputElement,
      {
        target: { value: "5" },
      },
    );
    fireEvent.click(screen.getByTestId("customer-credit-save"));

    expect(lastAction()?.payload.data.reason).toBeNull();
  });

  it("will not submit an empty amount", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("customer-credit-add"));

    expect(screen.getByTestId("customer-credit-save")).toBeDisabled();
  });

  it("lists the ledger with signed amounts", () => {
    storeState.customer.detail.credit = {
      total: "3",
      promotional: "3",
      prepaid: "0",
    };
    storeState.customer.detail.creditEntries = [
      {
        id: "e1",
        kind: "ADJUSTMENT",
        amount: "-2",
        reason: "clawback",
        createdAt: "2026-10-02T00:00:00.000Z",
      },
      {
        id: "e2",
        kind: "PROMOTIONAL",
        amount: "5",
        reason: "launch offer",
        createdAt: "2026-10-01T00:00:00.000Z",
      },
    ];

    renderPanel();

    const ledger = screen.getByTestId("customer-credit-ledger");

    expect(ledger.textContent).toContain("-2");
    expect(ledger.textContent).toContain("+5");
    expect(ledger.textContent).toContain("clawback");
  });

  it("hides the ledger when nothing has moved", () => {
    renderPanel();

    expect(screen.queryByTestId("customer-credit-ledger")).toBeNull();
  });
});

describe("CouponsPanel", () => {
  const coupon = (over: Record<string, unknown> = {}) => ({
    id: "coupon_1",
    code: "WELCOME10",
    kind: "PERCENT",
    value: "10",
    expiresAt: null,
    usageLimit: null,
    timesRedeemed: 0,
    revokedAt: null,
    unusableReason: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    ...over,
  });

  beforeEach(() => {
    dispatch.mockClear();
    storeState.customer.detail.coupons = [];
  });

  const renderPanel = () => render(<CouponsPanel customer={customer()} />);
  const lastAction = () => dispatch.mock.calls.at(-1)?.[0];

  it("shows an empty state rather than a bare line when there are none", () => {
    renderPanel();

    expect(
      screen.getByTestId("customer-coupon-empty-empty-state"),
    ).toBeInTheDocument();
    expect(screen.getByText("customer.coupon.emptyTitle")).toBeInTheDocument();
  });

  it("rules the coupon rows apart", () => {
    storeState.customer.detail.coupons = [coupon()];
    renderPanel();

    const list = screen.getByTestId("customer-coupon-coupon_1").parentElement;

    expect(list?.className).toContain("divide-y");
  });

  it("keeps the coupon actions hidden until the row is hovered", () => {
    storeState.customer.detail.coupons = [coupon()];
    renderPanel();

    const actions = screen
      .getByTestId("customer-coupon-remove-coupon_1")
      .closest("div");

    expect(actions?.className).toContain("lg:opacity-0");
  });

  it("lists a coupon with its code and worth", () => {
    storeState.customer.detail.coupons = [coupon()];
    renderPanel();

    const row = screen.getByTestId("customer-coupon-coupon_1");

    expect(row.textContent).toContain("WELCOME10");
    expect(row.textContent).toContain("customer.coupon.offPercent");
    expect(row.textContent).toContain("customer.coupon.usable");
  });

  it("says why a coupon cannot be used", () => {
    storeState.customer.detail.coupons = [
      coupon({ unusableReason: "expired" }),
    ];
    renderPanel();

    expect(screen.getByText("customer.coupon.expired")).toBeInTheDocument();
  });

  it("creates a coupon with an expiry and a limit", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("customer-coupon-add"));

    const set = (id: string, value: string) =>
      fireEvent.change(document.getElementById(id) as HTMLInputElement, {
        target: { value },
      });

    set("coupon-code", "welcome10");
    set("coupon-value", "10");
    set("coupon-expiry", "2026-12-31");
    set("coupon-limit", "5");
    fireEvent.click(screen.getByTestId("customer-coupon-save"));

    expect(lastAction()?.payload.data).toEqual({
      kind: "PERCENT",
      code: "WELCOME10",
      value: "10",
      expiresAt: "2026-12-31T23:59:59.000Z",
      usageLimit: 5,
    });
  });

  it("sends nulls for a coupon with no expiry or limit", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("customer-coupon-add"));

    fireEvent.change(
      document.getElementById("coupon-code") as HTMLInputElement,
      {
        target: { value: "FOREVER" },
      },
    );
    fireEvent.change(
      document.getElementById("coupon-value") as HTMLInputElement,
      { target: { value: "5" } },
    );
    fireEvent.click(screen.getByTestId("customer-coupon-save"));

    expect(lastAction()?.payload.data).toMatchObject({
      expiresAt: null,
      usageLimit: null,
    });
  });

  it("will not submit without a code and a value", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("customer-coupon-add"));

    expect(screen.getByTestId("customer-coupon-save")).toBeDisabled();
  });

  it("revokes and restores a coupon", () => {
    storeState.customer.detail.coupons = [coupon()];
    renderPanel();

    fireEvent.click(screen.getByTestId("customer-coupon-revoke-coupon_1"));
    expect(lastAction()?.payload.data).toEqual({ revoked: true });

    storeState.customer.detail.coupons = [
      coupon({
        revokedAt: "2026-10-02T00:00:00.000Z",
        unusableReason: "revoked",
      }),
    ];
    renderPanel();

    fireEvent.click(
      screen.getAllByTestId("customer-coupon-revoke-coupon_1")[1],
    );
    expect(lastAction()?.payload.data).toEqual({ revoked: false });
  });

  it("removes a coupon", () => {
    storeState.customer.detail.coupons = [coupon()];
    renderPanel();

    fireEvent.click(screen.getByTestId("customer-coupon-remove-coupon_1"));
    fireEvent.click(
      screen.getByTestId(
        "customer-coupon-remove-coupon_1-popup-confirm-confirm-popup-confirm",
      ),
    );

    expect(lastAction()?.payload).toEqual({
      id: "customer_1",
      couponId: "coupon_1",
    });
  });
});

describe("AccessPanel", () => {
  beforeEach(() => {
    dispatch.mockClear();
  });

  const renderPanel = (over: Partial<Customer> = {}) =>
    render(<AccessPanel customer={customer(over)} />);

  const lastAction = () => dispatch.mock.calls.at(-1)?.[0];

  const pickStatus = (index: number) => {
    fireEvent.click(screen.getByTestId("access-status-select-trigger"));
    fireEvent.click(screen.getByTestId(`access-status-select-option-${index}`));
  };

  const ACTIVE = 0;
  const BLOCKED = 1;
  const SUSPENDED = 2;

  const save = () =>
    fireEvent.click(screen.getByTestId("customer-access-save"));

  it("opens on the customer's current status", () => {
    renderPanel();

    expect(
      screen.getByTestId("access-status-select-selected").textContent,
    ).toContain("customer.status.active");
  });

  it("opens on Blocked for a blocked customer", () => {
    renderPanel({ status: "BLOCKED" });

    expect(
      screen.getByTestId("access-status-select-selected").textContent,
    ).toContain("customer.status.blocked");
  });

  it("keeps Update disabled until the status changes", () => {
    renderPanel();

    expect(screen.getByTestId("customer-access-save")).toBeDisabled();
  });

  it("hides the reason and duration while the customer stays active", () => {
    renderPanel();

    expect(document.getElementById("access-reason")).toBeNull();
    expect(screen.queryByTestId("access-suspend-days-select")).toBeNull();
  });

  it("asks for a reason once a stopping status is picked", () => {
    renderPanel();
    pickStatus(BLOCKED);

    expect(document.getElementById("access-reason")).not.toBeNull();
  });

  it("asks how long only for a suspension", () => {
    renderPanel();
    pickStatus(SUSPENDED);

    expect(
      screen.getByTestId("access-suspend-days-select"),
    ).toBeInTheDocument();
  });

  it("blocks with the reason the owner typed", () => {
    renderPanel();
    pickStatus(BLOCKED);

    fireEvent.change(
      document.getElementById("access-reason") as HTMLInputElement,
      { target: { value: "chargeback fraud" } },
    );
    save();

    expect(lastAction()?.payload.data).toEqual({
      status: "BLOCKED",
      reason: "chargeback fraud",
    });
  });

  it("sends a null reason rather than an empty string", () => {
    renderPanel();
    pickStatus(BLOCKED);
    save();

    expect(lastAction()?.payload.data.reason).toBeNull();
  });

  it("suspends with a future end date", () => {
    renderPanel();
    pickStatus(SUSPENDED);
    save();

    const data = lastAction()?.payload.data;

    expect(data.status).toBe("SUSPENDED");
    expect(new Date(data.suspendedUntil).getTime()).toBeGreaterThan(Date.now());
  });

  it("reactivates without a reason or an end date", () => {
    renderPanel({ status: "BLOCKED" });
    pickStatus(ACTIVE);
    save();

    expect(lastAction()?.payload.data).toEqual({ status: "ACTIVE" });
  });

  it("shows the window a suspension runs to", () => {
    renderPanel({
      status: "SUSPENDED",
      suspendedUntil: "2026-12-01T00:00:00.000Z",
    });

    expect(
      screen.getByText("customer.access.suspendedUntil"),
    ).toBeInTheDocument();
  });

  it("carries the existing reason into the field", () => {
    renderPanel({ status: "BLOCKED", statusReason: "late payment" });

    expect(
      (document.getElementById("access-reason") as HTMLInputElement).value,
    ).toBe("late payment");
  });
});

describe("RemovePanel", () => {
  beforeEach(() => {
    dispatch.mockClear();
    navigate.mockClear();
    storeState.customer.pending = {};
  });

  const renderPanel = () =>
    render(
      <MemoryRouter>
        <RemovePanel customer={customer()} />
      </MemoryRouter>,
    );

  it("asks before removing rather than removing on the first click", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("customer-remove-button"));

    expect(dispatch).not.toHaveBeenCalled();
    expect(
      screen.getByTestId(
        "customer-remove-popup-confirm-confirm-popup-dropdown",
      ),
    ).toBeInTheDocument();
  });

  it("removes once the question is answered", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("customer-remove-button"));
    fireEvent.click(
      screen.getByTestId("customer-remove-popup-confirm-confirm-popup-confirm"),
    );

    expect(dispatch.mock.calls.at(-1)?.[0]?.payload).toEqual({
      id: "customer_1",
    });
  });

  it("removes nothing when the question is dismissed", () => {
    renderPanel();
    fireEvent.click(screen.getByTestId("customer-remove-button"));
    fireEvent.click(
      screen.getByTestId("customer-remove-popup-confirm-confirm-popup-cancel"),
    );

    expect(dispatch).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId(
        "customer-remove-popup-confirm-confirm-popup-dropdown",
      ),
    ).toBeNull();
  });

  it("leaves for the list once the delete lands", () => {
    storeState.customer.pending = { "customer:customer_1": true };
    const view = renderPanel();

    expect(navigate).not.toHaveBeenCalled();

    storeState.customer.pending = {};
    view.rerender(
      <MemoryRouter>
        <RemovePanel customer={customer()} />
      </MemoryRouter>,
    );

    expect(navigate).toHaveBeenCalledWith("/customers");
  });
});
