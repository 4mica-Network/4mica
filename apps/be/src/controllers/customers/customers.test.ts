import { clearUserCache } from "@auth/user-store";
import { customerRoutes } from "@routes/customers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";

const {
  authenticateRequest,
  getUser,
  findUnique,
  upsert,
  customer,
  customerCoupon,
  customerCreditEntry,
  customerPaymentIdentity,
  wallet,
  queryRaw,
  FakeDecimal,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getUser: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  customer: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  customerCoupon: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  customerCreditEntry: {
    create: vi.fn(),
    findMany: vi.fn(),
    groupBy: vi.fn(),
  },
  customerPaymentIdentity: {
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
  },
  wallet: { findMany: vi.fn() },
  queryRaw: vi.fn(),
  // Enough of Prisma.Decimal for the quota arithmetic the repository does.
  // The raw text is kept so a scale like "10.50" survives, as it does in the
  // real column.
  FakeDecimal: class {
    private readonly raw: string;
    constructor(value: unknown) {
      this.raw = String(value);
    }
    minus(other: unknown) {
      const Self = this.constructor as new (v: unknown) => never;
      return new Self(Number(this.raw) - Number(String(other)));
    }
    plus(other: unknown) {
      const Self = this.constructor as new (v: unknown) => never;
      return new Self(Number(this.raw) + Number(String(other)));
    }
    negated() {
      const Self = this.constructor as new (v: unknown) => never;
      return new Self(-Number(this.raw));
    }
    isNegative() {
      return Number(this.raw) < 0;
    }
    toString() {
      return this.raw;
    }
  },
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({ authenticateRequest, users: { getUser } })),
}));

vi.mock("@4mica/db", () => ({
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings: [...strings],
      values,
    }),
    join: (values: unknown[], separator = ",") => ({
      strings: [],
      values,
      separator,
    }),
    empty: { strings: [], values: [] },
    Decimal: FakeDecimal,
  },
  prisma: {
    customer,
    customerCoupon,
    customerCreditEntry,
    customerPaymentIdentity,
    wallet,
    agent: { count: vi.fn() },
    user: { findUnique, upsert, update: vi.fn() },
    business: { findUnique: vi.fn(), upsert: vi.fn() },
    $queryRaw: queryRaw,
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: unknown) => unknown)({
            customer,
            customerPaymentIdentity,
          })
        : Promise.all(arg as Promise<unknown>[]),
    ),
  },
  disconnect: vi.fn(async () => {}),
}));

const USER_ID = "019fce62-0000-7000-8000-000000000000";
const CUSTOMER_ID = "019fce62-5555-7000-8000-000000000000";
const IDENTITY_ID = "019fce62-6666-7000-8000-000000000000";
const CREDIT_ID = "019fce62-aaaa-7000-8000-000000000000";
const COUPON_ID = "019fce62-bbbb-7000-8000-000000000000";
const PAYER = "0x8a1c3f5b7d092e4a6c8b0d2f4e6a8c1b3d5f7e90";

const AUTH_USER = {
  id: USER_ID,
  clerkUserId: "user_123",
  email: "ada@example.com",
  name: "Ada Lovelace",
  avatarUrl: null,
  banned: false,
  locked: false,
  deletedAt: null,
};

const signedIn = () => ({
  isAuthenticated: true,
  status: "signed-in",
  reason: null,
  toAuth: () => ({
    tokenType: "session_token",
    userId: "user_123",
    sessionId: "sess_123",
    sessionClaims: { sub: "user_123", sid: "sess_123" },
  }),
});

const signedOut = () => ({
  isAuthenticated: false,
  status: "signed-out",
  reason: "session-token-missing",
  toAuth: () => ({ tokenType: null, userId: null }),
});

const AUTH = { authorization: "Bearer good" };

const decimal = (value: string) => new FakeDecimal(value);

const storedIdentity = (over: Record<string, unknown> = {}) => ({
  id: IDENTITY_ID,
  type: "WALLET",
  network: "BASE_SEPOLIA",
  address: PAYER,
  value: null,
  source: "MANUAL",
  verifiedAt: null,
  validFrom: null,
  validUntil: null,
  blockedAt: null,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
  ...over,
});

const storedCoupon = (over: Record<string, unknown> = {}) => ({
  id: COUPON_ID,
  code: "WELCOME10",
  kind: "PERCENT",
  value: decimal("10"),
  expiresAt: null,
  usageLimit: null,
  timesRedeemed: 0,
  revokedAt: null,
  createdAt: new Date("2026-10-01T00:00:00.000Z"),
  updatedAt: new Date("2026-10-01T00:00:00.000Z"),
  ...over,
});

const storedCustomer = (over: Record<string, unknown> = {}) => ({
  id: CUSTOMER_ID,
  name: "Acme Procurement",
  email: "ops@acme.test",
  type: "ORGANIZATION",
  status: "ACTIVE",
  statusReason: null,
  suspendedUntil: null,
  description: null,
  notes: null,
  dailyLimit: null,
  monthlyLimit: decimal("5000"),
  limitCurrency: "USD",
  freeQuotaUnit: null,
  freeQuota: null,
  freeQuotaPeriod: null,
  quotaResetAt: null,
  discountPercent: null,
  discountFixed: null,
  minPaymentAmount: null,
  approvalThreshold: null,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
  identities: [storedIdentity()],
  ...over,
});

const uniqueViolation = (fields: string[]) =>
  Object.assign(new Error("unique"), {
    code: "P2002",
    meta: {
      driverAdapterError: {
        cause: { kind: "UniqueConstraintViolation", constraint: { fields } },
      },
    },
  });

/** The text of a `$queryRaw` tagged template, so a test can tell them apart. */
const sqlText = (call: unknown[]): string =>
  (call[0] as TemplateStringsArray | string[]).join(" ");

const flatten = (node: unknown, into: unknown[] = []): unknown[] => {
  if (node !== null && typeof node === "object" && "values" in node) {
    for (const value of (node as { values: unknown[] }).values) {
      flatten(value, into);
    }
    return into;
  }
  into.push(node);
  return into;
};

/** Every interpolated leaf value a `$queryRaw` call was given. */
const sqlValues = (call: unknown[]): unknown[] =>
  call.slice(1).flatMap((value) => flatten(value));

const rawCall = (match: string): unknown[] | undefined =>
  queryRaw.mock.calls.find((call) => sqlText(call).includes(match));

const respondToRawQueries = () => {
  queryRaw.mockImplementation((...call: unknown[]) => {
    const text = sqlText(call);

    if (text.includes("COUNT(*) AS total FROM customers")) {
      return Promise.resolve([{ total: 1n }]);
    }
    if (text.includes("rank_total")) {
      return Promise.resolve([{ id: CUSTOMER_ID }]);
    }
    if (text.includes("AS txn_count") && text.includes("WITH matched")) {
      return Promise.resolve([
        {
          id: CUSTOMER_ID,
          txn_count: 12n,
          settled_count: 10n,
          failed_count: 1n,
          last_active_at: new Date("2026-09-06T12:00:00.000Z"),
        },
      ]);
    }
    if (text.includes("recent_amount")) {
      return Promise.resolve([
        {
          customer_id: CUSTOMER_ID,
          network: "BASE_SEPOLIA",
          asset_address: null,
          total_amount: decimal("0.34"),
          recent_amount: decimal("0.1"),
        },
      ]);
    }
    return Promise.resolve([]);
  });
};

const app = () => initApp([{ plugin: customerRoutes }]);

describe("customer routes", () => {
  beforeEach(() => {
    for (const mock of [authenticateRequest, getUser, findUnique, upsert]) {
      mock.mockReset();
    }
    for (const group of [
      customer,
      customerCoupon,
      customerCreditEntry,
      customerPaymentIdentity,
      wallet,
    ]) {
      for (const fn of Object.values(group)) {
        fn.mockReset();
      }
    }
    queryRaw.mockReset();
    clearUserCache();

    authenticateRequest.mockResolvedValue(signedIn());
    upsert.mockResolvedValue(AUTH_USER);

    wallet.findMany.mockResolvedValue([
      { address: "0x4f2c8b6d1e9a3f5c7b0d2e4a6c8f1b3d5e7a9c02" },
    ]);
    customer.findMany.mockResolvedValue([storedCustomer()]);
    customer.findFirst.mockResolvedValue(storedCustomer());
    customer.create.mockResolvedValue(storedCustomer());
    customer.updateMany.mockResolvedValue({ count: 1 });
    customerPaymentIdentity.create.mockResolvedValue(storedIdentity());
    customerPaymentIdentity.updateMany.mockResolvedValue({ count: 1 });
    customerPaymentIdentity.deleteMany.mockResolvedValue({ count: 1 });
    customerCoupon.findMany.mockResolvedValue([]);
    customerCoupon.updateMany.mockResolvedValue({ count: 1 });
    customerCoupon.deleteMany.mockResolvedValue({ count: 1 });
    customerCoupon.create.mockResolvedValue(storedCoupon());
    customerCoupon.findFirst.mockResolvedValue(storedCoupon());
    customerCreditEntry.groupBy.mockResolvedValue([]);
    customerCreditEntry.findMany.mockResolvedValue([]);
    customerCreditEntry.create.mockResolvedValue({
      id: CREDIT_ID,
      kind: "PROMOTIONAL",
      amount: decimal("5"),
      reason: "launch offer",
      createdAt: new Date("2026-10-01T00:00:00.000Z"),
    });
    respondToRawQueries();
  });

  it("requires authentication on every customer route", async () => {
    authenticateRequest.mockResolvedValue(signedOut());
    const instance = await app();

    for (const [method, url] of [
      ["GET", "/me/customers"],
      ["GET", `/me/customers/${CUSTOMER_ID}`],
      ["POST", "/me/customers"],
      ["PATCH", `/me/customers/${CUSTOMER_ID}`],
      ["PATCH", `/me/customers/${CUSTOMER_ID}/status`],
      ["PATCH", `/me/customers/${CUSTOMER_ID}/policy`],
      ["POST", `/me/customers/${CUSTOMER_ID}/reset-usage`],
      ["GET", `/me/customers/${CUSTOMER_ID}/credit`],
      ["POST", `/me/customers/${CUSTOMER_ID}/credit`],
      ["DELETE", `/me/customers/${CUSTOMER_ID}/credit`],
      ["GET", `/me/customers/${CUSTOMER_ID}/coupons`],
      ["POST", `/me/customers/${CUSTOMER_ID}/coupons`],
      ["PATCH", `/me/customers/${CUSTOMER_ID}/coupons/${COUPON_ID}`],
      ["DELETE", `/me/customers/${CUSTOMER_ID}/coupons/${COUPON_ID}`],
      ["DELETE", `/me/customers/${CUSTOMER_ID}`],
      ["POST", "/me/customers/batch-delete"],
      ["POST", `/me/customers/${CUSTOMER_ID}/identities`],
      ["PATCH", `/me/customers/${CUSTOMER_ID}/identities/${IDENTITY_ID}`],
      ["DELETE", `/me/customers/${CUSTOMER_ID}/identities/${IDENTITY_ID}`],
      ["GET", `/me/customers/${CUSTOMER_ID}/overview`],
      ["GET", `/me/customers/${CUSTOMER_ID}/activity`],
      ["GET", `/me/customers/${CUSTOMER_ID}/breakdown`],
    ] as const) {
      const response = await instance.inject({ method, url, payload: {} });
      expect(response.statusCode, `${method} ${url}`).toBe(401);
    }

    await instance.close();
  });

  describe("listing", () => {
    it("returns the paging envelope", async () => {
      const instance = await app();
      const response = await instance.inject({
        method: "GET",
        url: "/me/customers",
        headers: AUTH,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ total: 1, page: 1, limit: 20 });

      await instance.close();
    });

    it("escapes LIKE wildcards so % cannot match every row", async () => {
      const instance = await app();
      await instance.inject({
        method: "GET",
        url: "/me/customers?q=%25",
        headers: AUTH,
      });

      const call = rawCall("rank_total");
      expect(sqlValues(call as unknown[])).toContain("%\\%%");

      await instance.close();
    });

    it("orders by a tiebroken key so a row cannot straddle two pages", async () => {
      const instance = await app();
      await instance.inject({
        method: "GET",
        url: "/me/customers",
        headers: AUTH,
      });

      expect(sqlText(rawCall("rank_total") as unknown[])).toContain("ORDER BY");
      const ordering = (rawCall("rank_total") as unknown[]).find(
        (value) =>
          value !== null &&
          typeof value === "object" &&
          "strings" in value &&
          (value as { strings: string[] }).strings.some((part) =>
            part.includes("c.id"),
          ),
      );
      expect(ordering).toBeDefined();

      await instance.close();
    });

    it("scopes the list to the owner", async () => {
      const instance = await app();
      await instance.inject({
        method: "GET",
        url: "/me/customers",
        headers: AUTH,
      });

      expect(sqlValues(rawCall("rank_total") as unknown[])).toContain(USER_ID);

      await instance.close();
    });

    it("rejects an unreachable page rather than scanning to it", async () => {
      const instance = await app();
      const response = await instance.inject({
        method: "GET",
        url: "/me/customers?page=100000&limit=100",
        headers: AUTH,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().issues[0].path).toBe("page");

      await instance.close();
    });

    it("rejects an oversized limit", async () => {
      const instance = await app();
      const response = await instance.inject({
        method: "GET",
        url: "/me/customers?limit=101",
        headers: AUTH,
      });

      expect(response.statusCode).toBe(400);

      await instance.close();
    });

    it("rejects a sort it does not define", async () => {
      const instance = await app();
      const response = await instance.inject({
        method: "GET",
        url: "/me/customers?sort=-notAColumn",
        headers: AUTH,
      });

      expect(response.statusCode).toBe(400);

      await instance.close();
    });

    it("serialises spend and limits as strings, not mangled Decimals", async () => {
      const instance = await app();
      const response = await instance.inject({
        method: "GET",
        url: "/me/customers",
        headers: AUTH,
      });

      const [row] = response.json().items;
      expect(row.monthlyLimit).toBe("5000");
      expect(row.dailyLimit).toBeNull();
      expect(row.totalSpend).toEqual([
        { network: "BASE_SEPOLIA", assetAddress: null, amount: "0.34" },
      ]);
      expect(row.recentSpend[0].amount).toBe("0.1");
      expect(row.txnCount).toBe(12);

      await instance.close();
    });

    it("groups spend per asset rather than summing unlike tokens", async () => {
      queryRaw.mockImplementation((...call: unknown[]) => {
        const text = sqlText(call);
        if (text.includes("COUNT(*) AS total FROM customers")) {
          return Promise.resolve([{ total: 1n }]);
        }
        if (text.includes("rank_total")) {
          return Promise.resolve([{ id: CUSTOMER_ID }]);
        }
        if (text.includes("recent_amount")) {
          return Promise.resolve([
            {
              customer_id: CUSTOMER_ID,
              network: "BASE_SEPOLIA",
              asset_address: null,
              total_amount: decimal("1"),
              recent_amount: null,
            },
            {
              customer_id: CUSTOMER_ID,
              network: "BASE_SEPOLIA",
              asset_address: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
              total_amount: decimal("2"),
              recent_amount: null,
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const instance = await app();
      const response = await instance.inject({
        method: "GET",
        url: "/me/customers",
        headers: AUTH,
      });

      const [row] = response.json().items;
      expect(row.totalSpend).toHaveLength(2);
      expect(row.recentSpend).toEqual([]);

      await instance.close();
    });

    it("returns empty aggregates when the account has no wallets", async () => {
      wallet.findMany.mockResolvedValue([]);

      const instance = await app();
      const response = await instance.inject({
        method: "GET",
        url: "/me/customers",
        headers: AUTH,
      });

      const [row] = response.json().items;
      expect(row.totalSpend).toEqual([]);
      expect(row.txnCount).toBe(0);
      expect(row.lastActiveAt).toBeNull();

      await instance.close();
    });
  });

  describe("spend attribution", () => {
    it("counts only payments received by this account's own wallets", async () => {
      const instance = await app();
      await instance.inject({
        method: "GET",
        url: "/me/customers",
        headers: AUTH,
      });

      const page = sqlText(rawCall("rank_total") as unknown[]);
      expect(page).toContain("p.recipient_address IN");
      expect(sqlValues(rawCall("rank_total") as unknown[])).toContain(
        "0x4f2c8b6d1e9a3f5c7b0d2e4a6c8f1b3d5e7a9c02",
      );

      await instance.close();
    });

    it("matches a wallet identity on network and address together", async () => {
      const instance = await app();
      await instance.inject({
        method: "GET",
        url: "/me/customers",
        headers: AUTH,
      });

      const page = sqlText(rawCall("rank_total") as unknown[]);
      expect(page).toContain("p.payer_address = i.address");
      expect(page).toContain("p.network       = i.network");

      await instance.close();
    });

    it("honours an identity's validity window when attributing a payment", async () => {
      const instance = await app();
      await instance.inject({
        method: "GET",
        url: "/me/customers",
        headers: AUTH,
      });

      const page = sqlText(rawCall("rank_total") as unknown[]);
      expect(page).toContain("i.valid_from");
      expect(page).toContain("i.valid_until");

      await instance.close();
    });

    it("ignores identities that are not wallets", async () => {
      const instance = await app();
      await instance.inject({
        method: "GET",
        url: "/me/customers",
        headers: AUTH,
      });

      expect(sqlText(rawCall("rank_total") as unknown[])).toContain(
        "i.type = 'WALLET'",
      );

      await instance.close();
    });
  });

  describe("creating", () => {
    it("creates a customer with an attached wallet identity", async () => {
      const instance = await app();
      const response = await instance.inject({
        method: "POST",
        url: "/me/customers",
        headers: AUTH,
        payload: {
          name: "Acme Procurement",
          email: "ops@acme.test",
          identities: [
            { type: "WALLET", network: "BASE_SEPOLIA", address: PAYER },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
      expect(customer.create.mock.calls[0][0].data).toMatchObject({
        ownerId: USER_ID,
        name: "Acme Procurement",
      });

      await instance.close();
    });

    it("lowercases a checksummed address before storing it", async () => {
      const instance = await app();
      await instance.inject({
        method: "POST",
        url: "/me/customers",
        headers: AUTH,
        payload: {
          name: "Acme",
          identities: [
            {
              type: "WALLET",
              network: "BASE_SEPOLIA",
              address: "0x8A1C3F5b7D092e4a6c8B0D2f4e6a8c1B3D5F7e90",
            },
          ],
        },
      });

      const created = customer.create.mock.calls[0][0].data.identities.create;
      expect(created[0].address).toBe(PAYER);

      await instance.close();
    });

    it("refuses a wallet identity with no network", async () => {
      const instance = await app();
      const response = await instance.inject({
        method: "POST",
        url: "/me/customers",
        headers: AUTH,
        payload: {
          name: "Acme",
          identities: [{ type: "WALLET", address: PAYER }],
        },
      });

      expect(response.statusCode).toBe(400);

      await instance.close();
    });

    it("refuses an email identity carrying a wallet address", async () => {
      const instance = await app();
      const response = await instance.inject({
        method: "POST",
        url: "/me/customers",
        headers: AUTH,
        payload: {
          name: "Acme",
          identities: [{ type: "EMAIL", network: "BASE_SEPOLIA" }],
        },
      });

      expect(response.statusCode).toBe(400);

      await instance.close();
    });

    it("requires a name", async () => {
      const instance = await app();
      const response = await instance.inject({
        method: "POST",
        url: "/me/customers",
        headers: AUTH,
        payload: { email: "ops@acme.test" },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().issues[0].path).toBe("name");

      await instance.close();
    });

    it("refuses a second customer claiming an address already mapped here", async () => {
      customer.create.mockRejectedValue(
        uniqueViolation(["owner_id", "network", "address"]),
      );

      const instance = await app();
      const response = await instance.inject({
        method: "POST",
        url: "/me/customers",
        headers: AUTH,
        payload: {
          name: "Acme",
          identities: [
            { type: "WALLET", network: "BASE_SEPOLIA", address: PAYER },
          ],
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ error: "identity_taken" });
      expect(response.json().issues[0].path).toBe("address");

      await instance.close();
    });

    it("points a duplicate email identity at the value, not the address", async () => {
      customer.create.mockRejectedValue(
        uniqueViolation(["owner_id", "type", "value"]),
      );

      const instance = await app();
      const response = await instance.inject({
        method: "POST",
        url: "/me/customers",
        headers: AUTH,
        payload: {
          name: "Acme",
          identities: [{ type: "EMAIL", value: "ops@acme.test" }],
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().issues[0].path).toBe("value");

      await instance.close();
    });

    it("blocks a banned account from creating a customer", async () => {
      upsert.mockResolvedValue({ ...AUTH_USER, banned: true });

      const instance = await app();
      const response = await instance.inject({
        method: "POST",
        url: "/me/customers",
        headers: AUTH,
        payload: { name: "Acme" },
      });

      expect(response.statusCode).toBe(403);

      await instance.close();
    });
  });

  describe("reading and updating", () => {
    it("scopes read and update to the owner", async () => {
      const instance = await app();

      await instance.inject({
        method: "GET",
        url: `/me/customers/${CUSTOMER_ID}`,
        headers: AUTH,
      });
      expect(customer.findFirst.mock.calls[0][0].where).toMatchObject({
        id: CUSTOMER_ID,
        ownerId: USER_ID,
        deletedAt: null,
      });

      await instance.inject({
        method: "PATCH",
        url: `/me/customers/${CUSTOMER_ID}`,
        headers: AUTH,
        payload: { name: "Renamed" },
      });
      expect(customer.updateMany.mock.calls[0][0].where).toMatchObject({
        id: CUSTOMER_ID,
        ownerId: USER_ID,
        deletedAt: null,
      });

      await instance.close();
    });

    it("404s for a customer that is not the caller's", async () => {
      customer.findFirst.mockResolvedValue(null);

      const instance = await app();
      const response = await instance.inject({
        method: "GET",
        url: `/me/customers/${CUSTOMER_ID}`,
        headers: AUTH,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ error: "not_found" });

      await instance.close();
    });

    it("clears a limit when it is set to null", async () => {
      const instance = await app();
      await instance.inject({
        method: "PATCH",
        url: `/me/customers/${CUSTOMER_ID}`,
        headers: AUTH,
        payload: { monthlyLimit: null },
      });

      expect(customer.updateMany.mock.calls[0][0].data).toMatchObject({
        monthlyLimit: null,
      });

      await instance.close();
    });

    it("refuses a negative limit", async () => {
      const instance = await app();
      const response = await instance.inject({
        method: "PATCH",
        url: `/me/customers/${CUSTOMER_ID}`,
        headers: AUTH,
        payload: { monthlyLimit: "-5" },
      });

      expect(response.statusCode).toBe(400);

      await instance.close();
    });
  });

  describe("access control", () => {
    const setStatus = (payload: Record<string, unknown>) => ({
      method: "PATCH" as const,
      url: `/me/customers/${CUSTOMER_ID}/status`,
      headers: AUTH,
      payload,
    });

    it("blocks a customer and keeps the reason", async () => {
      const instance = await app();
      const response = await instance.inject(
        setStatus({ status: "BLOCKED", reason: "chargeback fraud" }),
      );

      expect(response.statusCode).toBe(200);
      expect(customer.updateMany.mock.calls[0][0].data).toMatchObject({
        status: "BLOCKED",
        statusReason: "chargeback fraud",
        suspendedUntil: null,
      });

      await instance.close();
    });

    it("clears the suspension window when reactivating", async () => {
      const instance = await app();
      await instance.inject(setStatus({ status: "ACTIVE" }));

      expect(customer.updateMany.mock.calls[0][0].data).toEqual({
        status: "ACTIVE",
        suspendedUntil: null,
        statusReason: null,
      });

      await instance.close();
    });

    it("suspends until a date it was given", async () => {
      const until = new Date(Date.now() + 86_400_000).toISOString();

      const instance = await app();
      const response = await instance.inject(
        setStatus({ status: "SUSPENDED", suspendedUntil: until }),
      );

      expect(response.statusCode).toBe(200);
      expect(customer.updateMany.mock.calls[0][0].data).toMatchObject({
        status: "SUSPENDED",
        suspendedUntil: new Date(until),
      });

      await instance.close();
    });

    it("refuses a suspension with no end date", async () => {
      const instance = await app();
      const response = await instance.inject(
        setStatus({ status: "SUSPENDED" }),
      );

      expect(response.statusCode).toBe(400);

      await instance.close();
    });

    it("refuses a suspension that ends in the past", async () => {
      const instance = await app();
      const response = await instance.inject(
        setStatus({
          status: "SUSPENDED",
          suspendedUntil: "2020-01-01T00:00:00.000Z",
        }),
      );

      expect(response.statusCode).toBe(400);
      expect(response.json().issues[0].path).toBe("suspendedUntil");

      await instance.close();
    });

    it("refuses a status it does not define", async () => {
      const instance = await app();
      const response = await instance.inject(setStatus({ status: "RETIRED" }));

      expect(response.statusCode).toBe(400);

      await instance.close();
    });

    it("will not let a plain update reach a status", async () => {
      const instance = await app();
      await instance.inject({
        method: "PATCH",
        url: `/me/customers/${CUSTOMER_ID}`,
        headers: AUTH,
        payload: { status: "BLOCKED", name: "Renamed" },
      });

      // ajv strips the unknown key and valibot never sees it, so the status
      // can only move through the route that enforces its shape.
      expect(customer.updateMany.mock.calls[0][0].data).toEqual({
        name: "Renamed",
      });

      await instance.close();
    });

    it("scopes a status change to the owner", async () => {
      const instance = await app();
      await instance.inject(setStatus({ status: "BLOCKED" }));

      expect(customer.updateMany.mock.calls[0][0].where).toMatchObject({
        id: CUSTOMER_ID,
        ownerId: USER_ID,
        deletedAt: null,
      });

      await instance.close();
    });

    it("404s a status change for a customer that is not the caller's", async () => {
      customer.updateMany.mockResolvedValue({ count: 0 });

      const instance = await app();
      const response = await instance.inject(setStatus({ status: "BLOCKED" }));

      expect(response.statusCode).toBe(404);

      await instance.close();
    });

    it("blocks a single identity without touching the customer", async () => {
      const instance = await app();
      const response = await instance.inject({
        method: "PATCH",
        url: `/me/customers/${CUSTOMER_ID}/identities/${IDENTITY_ID}`,
        headers: AUTH,
        payload: { blocked: true },
      });

      expect(response.statusCode).toBe(200);
      expect(
        customerPaymentIdentity.updateMany.mock.calls[0][0].data.blockedAt,
      ).toBeInstanceOf(Date);
      expect(customer.updateMany).not.toHaveBeenCalled();

      await instance.close();
    });

    it("unblocks an identity by clearing the timestamp", async () => {
      const instance = await app();
      await instance.inject({
        method: "PATCH",
        url: `/me/customers/${CUSTOMER_ID}/identities/${IDENTITY_ID}`,
        headers: AUTH,
        payload: { blocked: false },
      });

      expect(customerPaymentIdentity.updateMany.mock.calls[0][0].data).toEqual({
        blockedAt: null,
      });

      await instance.close();
    });

    it("serialises the suspension window as a string", async () => {
      customer.findFirst.mockResolvedValue(
        storedCustomer({
          status: "SUSPENDED",
          suspendedUntil: new Date("2026-12-01T00:00:00.000Z"),
          statusReason: "late payment",
        }),
      );

      const instance = await app();
      const response = await instance.inject({
        method: "GET",
        url: `/me/customers/${CUSTOMER_ID}`,
        headers: AUTH,
      });

      expect(response.json()).toMatchObject({
        status: "SUSPENDED",
        suspendedUntil: "2026-12-01T00:00:00.000Z",
        statusReason: "late payment",
      });

      await instance.close();
    });
  });

  describe("billing policy", () => {
    const setPolicy = (payload: Record<string, unknown>) => ({
      method: "PATCH" as const,
      url: `/me/customers/${CUSTOMER_ID}/policy`,
      headers: AUTH,
      payload,
    });

    it("stores a request allowance and starts its window", async () => {
      const instance = await app();
      const response = await instance.inject(
        setPolicy({
          freeQuotaUnit: "REQUESTS",
          freeQuota: "500",
          freeQuotaPeriod: "MONTH",
        }),
      );

      expect(response.statusCode).toBe(200);

      const data = customer.updateMany.mock.calls[0][0].data;
      expect(data).toMatchObject({
        freeQuotaUnit: "REQUESTS",
        freeQuota: "500",
        freeQuotaPeriod: "MONTH",
      });
      expect(data.quotaResetAt).toBeInstanceOf(Date);

      await instance.close();
    });

    it("refuses an allowance with no period", async () => {
      const instance = await app();
      const response = await instance.inject(
        setPolicy({ freeQuotaUnit: "REQUESTS", freeQuota: "500" }),
      );

      expect(response.statusCode).toBe(400);
      expect(response.json().issues[0].path).toBe("freeQuota");

      await instance.close();
    });

    it("refuses a fractional request allowance", async () => {
      const instance = await app();
      const response = await instance.inject(
        setPolicy({
          freeQuotaUnit: "REQUESTS",
          freeQuota: "10.5",
          freeQuotaPeriod: "MONTH",
        }),
      );

      expect(response.statusCode).toBe(400);

      await instance.close();
    });

    it("accepts a fractional amount allowance", async () => {
      const instance = await app();
      const response = await instance.inject(
        setPolicy({
          freeQuotaUnit: "AMOUNT",
          freeQuota: "10.5",
          freeQuotaPeriod: "MONTH",
        }),
      );

      expect(response.statusCode).toBe(200);

      await instance.close();
    });

    it("clears the window when the allowance is removed", async () => {
      const instance = await app();
      await instance.inject(
        setPolicy({
          freeQuotaUnit: null,
          freeQuota: null,
          freeQuotaPeriod: null,
        }),
      );

      expect(customer.updateMany.mock.calls[0][0].data).toMatchObject({
        freeQuotaUnit: null,
        quotaResetAt: null,
      });

      await instance.close();
    });

    it("leaves the window alone when only a discount changes", async () => {
      const instance = await app();
      await instance.inject(setPolicy({ discountPercent: "10" }));

      expect("quotaResetAt" in customer.updateMany.mock.calls[0][0].data).toBe(
        false,
      );

      await instance.close();
    });

    it("refuses a discount above 100 percent", async () => {
      const instance = await app();
      const response = await instance.inject(
        setPolicy({ discountPercent: "120" }),
      );

      expect(response.statusCode).toBe(400);

      await instance.close();
    });

    it("accepts a discount of exactly 100 percent", async () => {
      const instance = await app();
      const response = await instance.inject(
        setPolicy({ discountPercent: "100" }),
      );

      expect(response.statusCode).toBe(200);

      await instance.close();
    });

    it("refuses a negative fixed discount", async () => {
      const instance = await app();
      const response = await instance.inject(
        setPolicy({ discountFixed: "-5" }),
      );

      expect(response.statusCode).toBe(400);

      await instance.close();
    });

    it("stores a minimum payment and an approval threshold", async () => {
      const instance = await app();
      const response = await instance.inject(
        setPolicy({ minPaymentAmount: "0.01", approvalThreshold: "100" }),
      );

      expect(response.statusCode).toBe(200);
      expect(customer.updateMany.mock.calls[0][0].data).toMatchObject({
        minPaymentAmount: "0.01",
        approvalThreshold: "100",
      });

      await instance.close();
    });

    it("scopes a policy change to the owner", async () => {
      const instance = await app();
      await instance.inject(setPolicy({ discountPercent: "10" }));

      expect(customer.updateMany.mock.calls[0][0].where).toMatchObject({
        id: CUSTOMER_ID,
        ownerId: USER_ID,
        deletedAt: null,
      });

      await instance.close();
    });

    it("404s a policy change for a customer that is not the caller's", async () => {
      customer.updateMany.mockResolvedValue({ count: 0 });

      const instance = await app();
      const response = await instance.inject(
        setPolicy({ discountPercent: "10" }),
      );

      expect(response.statusCode).toBe(404);

      await instance.close();
    });

    it("resets usage by moving the window, not by touching payments", async () => {
      const instance = await app();
      const response = await instance.inject({
        method: "POST",
        url: `/me/customers/${CUSTOMER_ID}/reset-usage`,
        headers: AUTH,
      });

      expect(response.statusCode).toBe(200);
      expect(Object.keys(customer.updateMany.mock.calls[0][0].data)).toEqual([
        "quotaResetAt",
      ]);

      await instance.close();
    });

    it("serialises the policy amounts as strings", async () => {
      customer.findFirst.mockResolvedValue(
        storedCustomer({
          freeQuotaUnit: "REQUESTS",
          freeQuota: decimal("500"),
          freeQuotaPeriod: "MONTH",
          discountPercent: decimal("10.50"),
          discountFixed: decimal("1.25"),
          minPaymentAmount: decimal("0.01"),
          approvalThreshold: decimal("100"),
        }),
      );

      const instance = await app();
      const response = await instance.inject({
        method: "GET",
        url: `/me/customers/${CUSTOMER_ID}`,
        headers: AUTH,
      });

      expect(response.json()).toMatchObject({
        freeQuota: "500",
        discountPercent: "10.50",
        discountFixed: "1.25",
        minPaymentAmount: "0.01",
        approvalThreshold: "100",
      });

      await instance.close();
    });
  });

  describe("credit", () => {
    const grant = (payload: Record<string, unknown>) => ({
      method: "POST" as const,
      url: `/me/customers/${CUSTOMER_ID}/credit`,
      headers: AUTH,
      payload,
    });

    it("sums the ledger into a balance per kind", async () => {
      customerCreditEntry.groupBy.mockResolvedValue([
        { kind: "PROMOTIONAL", _sum: { amount: decimal("5") } },
        { kind: "PREPAID", _sum: { amount: decimal("20.50") } },
      ]);

      const instance = await app();
      const response = await instance.inject({
        method: "GET",
        url: `/me/customers/${CUSTOMER_ID}/credit`,
        headers: AUTH,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().balance).toEqual({
        total: "25.5",
        promotional: "5",
        prepaid: "20.50",
      });

      await instance.close();
    });

    it("reports a zero balance on an empty ledger", async () => {
      const instance = await app();
      const response = await instance.inject({
        method: "GET",
        url: `/me/customers/${CUSTOMER_ID}/credit`,
        headers: AUTH,
      });

      expect(response.json().balance).toEqual({
        total: "0",
        promotional: "0",
        prepaid: "0",
      });

      await instance.close();
    });

    it("grants credit as a signed movement", async () => {
      const instance = await app();
      const response = await instance.inject(
        grant({ kind: "PROMOTIONAL", amount: "5", reason: "launch offer" }),
      );

      expect(response.statusCode).toBe(201);
      expect(customerCreditEntry.create.mock.calls[0][0].data).toMatchObject({
        ownerId: USER_ID,
        customerId: CUSTOMER_ID,
        kind: "PROMOTIONAL",
        amount: "5",
        reason: "launch offer",
      });

      await instance.close();
    });

    it("accepts a negative movement so credit can be taken back", async () => {
      const instance = await app();
      const response = await instance.inject(
        grant({ kind: "ADJUSTMENT", amount: "-2" }),
      );

      expect(response.statusCode).toBe(201);
      expect(customerCreditEntry.create.mock.calls[0][0].data.amount).toBe(
        "-2",
      );

      await instance.close();
    });

    it("refuses a movement of zero", async () => {
      const instance = await app();
      const response = await instance.inject(
        grant({ kind: "PROMOTIONAL", amount: "0" }),
      );

      expect(response.statusCode).toBe(400);
      expect(customerCreditEntry.create).not.toHaveBeenCalled();

      await instance.close();
    });

    it("refuses a kind it does not define", async () => {
      const instance = await app();
      const response = await instance.inject(
        grant({ kind: "GIFT", amount: "5" }),
      );

      expect(response.statusCode).toBe(400);

      await instance.close();
    });

    it("refuses an amount that is not a decimal string", async () => {
      const instance = await app();
      const response = await instance.inject(
        grant({ kind: "PREPAID", amount: "1,000" }),
      );

      expect(response.statusCode).toBe(400);

      await instance.close();
    });

    it("serialises a granted amount as a string", async () => {
      const instance = await app();
      const response = await instance.inject(
        grant({ kind: "PROMOTIONAL", amount: "5" }),
      );

      expect(response.json().entry.amount).toBe("5");

      await instance.close();
    });

    it("zeroes the balance by writing the offsetting movement", async () => {
      customerCreditEntry.groupBy.mockResolvedValue([
        { kind: "PROMOTIONAL", _sum: { amount: decimal("23.5") } },
      ]);

      const instance = await app();
      const response = await instance.inject({
        method: "DELETE",
        url: `/me/customers/${CUSTOMER_ID}/credit`,
        headers: AUTH,
      });

      expect(response.statusCode).toBe(200);
      expect(customerCreditEntry.create.mock.calls[0][0].data).toMatchObject({
        kind: "ADJUSTMENT",
        reason: "reset",
      });
      expect(
        customerCreditEntry.create.mock.calls[0][0].data.amount.toString(),
      ).toBe("-23.5");

      await instance.close();
    });

    it("writes nothing when zeroing an already-zero balance", async () => {
      const instance = await app();
      const response = await instance.inject({
        method: "DELETE",
        url: `/me/customers/${CUSTOMER_ID}/credit`,
        headers: AUTH,
      });

      expect(response.statusCode).toBe(200);
      expect(customerCreditEntry.create).not.toHaveBeenCalled();

      await instance.close();
    });

    it("scopes the ledger to the owner", async () => {
      const instance = await app();
      await instance.inject({
        method: "GET",
        url: `/me/customers/${CUSTOMER_ID}/credit`,
        headers: AUTH,
      });

      expect(customerCreditEntry.groupBy.mock.calls[0][0].where).toEqual({
        ownerId: USER_ID,
        customerId: CUSTOMER_ID,
      });

      await instance.close();
    });

    it("404s credit for a customer that is not the caller's", async () => {
      customer.findFirst.mockResolvedValue(null);

      const instance = await app();

      for (const method of ["GET", "POST", "DELETE"] as const) {
        const response = await instance.inject({
          method,
          url: `/me/customers/${CUSTOMER_ID}/credit`,
          headers: AUTH,
          payload: { kind: "PROMOTIONAL", amount: "5" },
        });
        expect(response.statusCode, method).toBe(404);
      }

      await instance.close();
    });
  });

  describe("coupons", () => {
    const soon = new Date(Date.now() + 86_400_000).toISOString();

    const create = (payload: Record<string, unknown>) => ({
      method: "POST" as const,
      url: `/me/customers/${CUSTOMER_ID}/coupons`,
      headers: AUTH,
      payload,
    });

    it("creates a percentage coupon with an expiry and a limit", async () => {
      const instance = await app();
      const response = await instance.inject(
        create({
          kind: "PERCENT",
          code: "welcome10",
          value: "10",
          expiresAt: soon,
          usageLimit: 5,
        }),
      );

      expect(response.statusCode).toBe(201);
      expect(customerCoupon.create.mock.calls[0][0].data).toMatchObject({
        ownerId: USER_ID,
        customerId: CUSTOMER_ID,
        code: "WELCOME10",
        kind: "PERCENT",
        value: "10",
        usageLimit: 5,
      });

      await instance.close();
    });

    it("refuses a percentage above 100", async () => {
      const instance = await app();
      const response = await instance.inject(
        create({ kind: "PERCENT", code: "HALF", value: "150" }),
      );

      expect(response.statusCode).toBe(400);

      await instance.close();
    });

    it("allows a fixed amount above 100", async () => {
      const instance = await app();
      const response = await instance.inject(
        create({ kind: "FIXED", code: "BIG", value: "150" }),
      );

      expect(response.statusCode).toBe(201);

      await instance.close();
    });

    it("refuses an expiry in the past", async () => {
      const instance = await app();
      const response = await instance.inject(
        create({
          kind: "PERCENT",
          code: "OLD",
          value: "10",
          expiresAt: "2020-01-01T00:00:00.000Z",
        }),
      );

      expect(response.statusCode).toBe(400);
      expect(response.json().issues[0].path).toBe("expiresAt");

      await instance.close();
    });

    it("refuses a usage limit below one", async () => {
      const instance = await app();
      const response = await instance.inject(
        create({ kind: "PERCENT", code: "ZERO", value: "10", usageLimit: 0 }),
      );

      expect(response.statusCode).toBe(400);

      await instance.close();
    });

    it("refuses a code with spaces", async () => {
      const instance = await app();
      const response = await instance.inject(
        create({ kind: "PERCENT", code: "two words", value: "10" }),
      );

      expect(response.statusCode).toBe(400);

      await instance.close();
    });

    it("refuses a second coupon with the same code", async () => {
      customerCoupon.create.mockRejectedValue(
        uniqueViolation(["owner_id", "code"]),
      );

      const instance = await app();
      const response = await instance.inject(
        create({ kind: "PERCENT", code: "WELCOME10", value: "10" }),
      );

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ error: "coupon_code_taken" });

      await instance.close();
    });

    it("says why a coupon cannot be used", async () => {
      customerCoupon.findMany.mockResolvedValue([
        storedCoupon({ id: "c1", code: "REVOKED", revokedAt: new Date() }),
        storedCoupon({
          id: "c2",
          code: "EXPIRED",
          expiresAt: new Date("2020-01-01T00:00:00.000Z"),
        }),
        storedCoupon({
          id: "c3",
          code: "USEDUP",
          usageLimit: 2,
          timesRedeemed: 2,
        }),
        storedCoupon({ id: "c4", code: "FINE" }),
      ]);

      const instance = await app();
      const response = await instance.inject({
        method: "GET",
        url: `/me/customers/${CUSTOMER_ID}/coupons`,
        headers: AUTH,
      });

      expect(
        response
          .json()
          .items.map(
            (item: { unusableReason: string | null }) => item.unusableReason,
          ),
      ).toEqual(["revoked", "expired", "exhausted", null]);

      await instance.close();
    });

    it("counts a coupon revoked even when it is also used up", async () => {
      customerCoupon.findMany.mockResolvedValue([
        storedCoupon({
          revokedAt: new Date(),
          usageLimit: 1,
          timesRedeemed: 1,
        }),
      ]);

      const instance = await app();
      const response = await instance.inject({
        method: "GET",
        url: `/me/customers/${CUSTOMER_ID}/coupons`,
        headers: AUTH,
      });

      expect(response.json().items[0].unusableReason).toBe("revoked");

      await instance.close();
    });

    it("revokes and restores a coupon", async () => {
      const instance = await app();

      await instance.inject({
        method: "PATCH",
        url: `/me/customers/${CUSTOMER_ID}/coupons/${COUPON_ID}`,
        headers: AUTH,
        payload: { revoked: true },
      });
      expect(
        customerCoupon.updateMany.mock.calls[0][0].data.revokedAt,
      ).toBeInstanceOf(Date);

      await instance.inject({
        method: "PATCH",
        url: `/me/customers/${CUSTOMER_ID}/coupons/${COUPON_ID}`,
        headers: AUTH,
        payload: { revoked: false },
      });
      expect(customerCoupon.updateMany.mock.calls[1][0].data).toEqual({
        revokedAt: null,
      });

      await instance.close();
    });

    it("will not let an update change what a coupon is worth", async () => {
      const instance = await app();
      await instance.inject({
        method: "PATCH",
        url: `/me/customers/${CUSTOMER_ID}/coupons/${COUPON_ID}`,
        headers: AUTH,
        payload: { value: "90", kind: "FIXED", code: "OTHER" },
      });

      expect(customerCoupon.updateMany.mock.calls[0][0].data).toEqual({});

      await instance.close();
    });

    it("scopes a coupon change to the owner and its customer", async () => {
      const instance = await app();
      await instance.inject({
        method: "PATCH",
        url: `/me/customers/${CUSTOMER_ID}/coupons/${COUPON_ID}`,
        headers: AUTH,
        payload: { usageLimit: 3 },
      });

      expect(customerCoupon.updateMany.mock.calls[0][0].where).toEqual({
        id: COUPON_ID,
        customerId: CUSTOMER_ID,
        ownerId: USER_ID,
      });

      await instance.close();
    });

    it("404s a coupon that is not the caller's", async () => {
      customerCoupon.updateMany.mockResolvedValue({ count: 0 });
      customerCoupon.deleteMany.mockResolvedValue({ count: 0 });

      const instance = await app();

      const patched = await instance.inject({
        method: "PATCH",
        url: `/me/customers/${CUSTOMER_ID}/coupons/${COUPON_ID}`,
        headers: AUTH,
        payload: { usageLimit: 3 },
      });
      expect(patched.statusCode).toBe(404);

      const removed = await instance.inject({
        method: "DELETE",
        url: `/me/customers/${CUSTOMER_ID}/coupons/${COUPON_ID}`,
        headers: AUTH,
      });
      expect(removed.statusCode).toBe(404);

      await instance.close();
    });

    it("removes a coupon", async () => {
      const instance = await app();
      const response = await instance.inject({
        method: "DELETE",
        url: `/me/customers/${CUSTOMER_ID}/coupons/${COUPON_ID}`,
        headers: AUTH,
      });

      expect(response.statusCode).toBe(204);

      await instance.close();
    });

    it("serialises the coupon value as a string", async () => {
      customerCoupon.findMany.mockResolvedValue([
        storedCoupon({ value: decimal("12.50") }),
      ]);

      const instance = await app();
      const response = await instance.inject({
        method: "GET",
        url: `/me/customers/${CUSTOMER_ID}/coupons`,
        headers: AUTH,
      });

      expect(response.json().items[0].value).toBe("12.50");

      await instance.close();
    });
  });

  describe("identities", () => {
    it("attaches an identity and answers with the customer", async () => {
      const instance = await app();
      const response = await instance.inject({
        method: "POST",
        url: `/me/customers/${CUSTOMER_ID}/identities`,
        headers: AUTH,
        payload: { type: "WALLET", network: "BASE_SEPOLIA", address: PAYER },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().id).toBe(CUSTOMER_ID);
      expect(
        customerPaymentIdentity.create.mock.calls[0][0].data,
      ).toMatchObject({
        ownerId: USER_ID,
        customerId: CUSTOMER_ID,
        address: PAYER,
      });

      await instance.close();
    });

    it("404s before touching the table when the customer is not the caller's", async () => {
      customer.findFirst.mockResolvedValue(null);

      const instance = await app();
      const response = await instance.inject({
        method: "POST",
        url: `/me/customers/${CUSTOMER_ID}/identities`,
        headers: AUTH,
        payload: { type: "WALLET", network: "BASE_SEPOLIA", address: PAYER },
      });

      expect(response.statusCode).toBe(404);
      expect(customerPaymentIdentity.create).not.toHaveBeenCalled();

      await instance.close();
    });

    it("scopes an identity change to the owner and its customer", async () => {
      const instance = await app();
      await instance.inject({
        method: "PATCH",
        url: `/me/customers/${CUSTOMER_ID}/identities/${IDENTITY_ID}`,
        headers: AUTH,
        payload: { validFrom: "2026-06-01T00:00:00.000Z" },
      });

      expect(customerPaymentIdentity.updateMany.mock.calls[0][0]).toMatchObject(
        {
          where: {
            id: IDENTITY_ID,
            customerId: CUSTOMER_ID,
            ownerId: USER_ID,
          },
        },
      );

      await instance.close();
    });

    it("404s for an identity that is not the caller's customer's", async () => {
      customerPaymentIdentity.updateMany.mockResolvedValue({ count: 0 });

      const instance = await app();
      const response = await instance.inject({
        method: "PATCH",
        url: `/me/customers/${CUSTOMER_ID}/identities/${IDENTITY_ID}`,
        headers: AUTH,
        payload: { source: "VERIFIED" },
      });

      expect(response.statusCode).toBe(404);

      await instance.close();
    });

    it("detaches an identity", async () => {
      const instance = await app();
      const response = await instance.inject({
        method: "DELETE",
        url: `/me/customers/${CUSTOMER_ID}/identities/${IDENTITY_ID}`,
        headers: AUTH,
      });

      expect(response.statusCode).toBe(204);

      await instance.close();
    });

    it("rejects a validity window that ends before it starts", async () => {
      const instance = await app();
      const response = await instance.inject({
        method: "PATCH",
        url: `/me/customers/${CUSTOMER_ID}/identities/${IDENTITY_ID}`,
        headers: AUTH,
        payload: { validFrom: "not-a-date" },
      });

      expect(response.statusCode).toBe(400);

      await instance.close();
    });
  });

  describe("soft delete", () => {
    it("frees the claimed addresses so they can be remapped", async () => {
      const instance = await app();
      const response = await instance.inject({
        method: "DELETE",
        url: `/me/customers/${CUSTOMER_ID}`,
        headers: AUTH,
      });

      expect(response.statusCode).toBe(204);
      expect(customerPaymentIdentity.deleteMany).toHaveBeenCalledWith({
        where: { customerId: CUSTOMER_ID },
      });
      expect(customer.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(
        Date,
      );

      await instance.close();
    });

    it("404s rather than reporting a delete it did not make", async () => {
      customer.findFirst.mockResolvedValue(null);

      const instance = await app();
      const response = await instance.inject({
        method: "DELETE",
        url: `/me/customers/${CUSTOMER_ID}`,
        headers: AUTH,
      });

      expect(response.statusCode).toBe(404);

      await instance.close();
    });

    it("reports which of a batch existed", async () => {
      const other = "019fce62-7777-7000-8000-000000000000";
      customer.findMany.mockResolvedValue([{ id: CUSTOMER_ID }]);

      const instance = await app();
      const response = await instance.inject({
        method: "POST",
        url: "/me/customers/batch-delete",
        headers: AUTH,
        payload: { ids: [CUSTOMER_ID, other] },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        deleted: [CUSTOMER_ID],
        notFound: [other],
      });

      await instance.close();
    });

    it("refuses a batch delete of ids that are not uuids", async () => {
      const instance = await app();
      const response = await instance.inject({
        method: "POST",
        url: "/me/customers/batch-delete",
        headers: AUTH,
        payload: { ids: ["not-a-uuid"] },
      });

      expect(response.statusCode).toBe(400);

      await instance.close();
    });
  });

  describe("detail panels", () => {
    it("answers the overview with first and last activity", async () => {
      queryRaw.mockImplementation((...call: unknown[]) => {
        const text = sqlText(call);
        if (text.includes("AS txn_count")) {
          return Promise.resolve([
            {
              id: CUSTOMER_ID,
              txn_count: 12n,
              settled_count: 10n,
              failed_count: 1n,
              last_active_at: new Date("2026-09-06T12:00:00.000Z"),
            },
          ]);
        }
        if (text.includes("first_seen_at")) {
          return Promise.resolve([
            { first_seen_at: new Date("2026-05-04T12:00:00.000Z") },
          ]);
        }
        return Promise.resolve([]);
      });

      const instance = await app();
      const response = await instance.inject({
        method: "GET",
        url: `/me/customers/${CUSTOMER_ID}/overview`,
        headers: AUTH,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        txnCount: 12,
        settledCount: 10,
        failedCount: 1,
        lastActiveAt: "2026-09-06T12:00:00.000Z",
        firstSeenAt: "2026-05-04T12:00:00.000Z",
      });

      await instance.close();
    });

    it("serialises an activity amount as a string", async () => {
      queryRaw.mockImplementation((...call: unknown[]) => {
        const text = sqlText(call);
        if (text.includes("COUNT(*) AS total")) {
          return Promise.resolve([{ total: 1n }]);
        }
        if (text.includes("p.req_id")) {
          return Promise.resolve([
            {
              id: "019fce62-8888-7000-8000-000000000000",
              listing_id: null,
              agent_id: null,
              payer_address: PAYER,
              recipient_address: "0x4f2c8b6d1e9a3f5c7b0d2e4a6c8f1b3d5e7a9c02",
              network: "BASE_SEPOLIA",
              asset_address: null,
              amount: decimal("0.01"),
              status: "SETTLED",
              failure_reason: null,
              req_id: "0xseed0001",
              tx_hash: null,
              resource: null,
              description: null,
              settled_at: new Date("2026-09-06T12:00:00.000Z"),
              created_at: new Date("2026-09-06T12:00:00.000Z"),
              updated_at: new Date("2026-09-06T12:00:00.000Z"),
              listing_slug: null,
              listing_name: null,
              agent_slug: null,
              agent_name: null,
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const instance = await app();
      const response = await instance.inject({
        method: "GET",
        url: `/me/customers/${CUSTOMER_ID}/activity`,
        headers: AUTH,
      });

      expect(response.statusCode).toBe(200);
      const [row] = response.json().items;
      expect(row.amount).toBe("0.01");
      expect(row.direction).toBe("received");

      await instance.close();
    });

    it("returns no activity when the account has no wallets", async () => {
      wallet.findMany.mockResolvedValue([]);

      const instance = await app();
      const response = await instance.inject({
        method: "GET",
        url: `/me/customers/${CUSTOMER_ID}/activity`,
        headers: AUTH,
      });

      expect(response.json()).toMatchObject({ items: [], total: 0 });

      await instance.close();
    });

    it("rejects an unreachable activity page", async () => {
      const instance = await app();
      const response = await instance.inject({
        method: "GET",
        url: `/me/customers/${CUSTOMER_ID}/activity?page=100000&limit=100`,
        headers: AUTH,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().issues[0].path).toBe("page");

      await instance.close();
    });

    it("groups the breakdown by what was paid for", async () => {
      queryRaw.mockImplementation((...call: unknown[]) => {
        if (sqlText(call).includes("listing_slug")) {
          return Promise.resolve([
            {
              listing_id: "019fce62-9999-7000-8000-000000000000",
              agent_id: null,
              listing_slug: "credit-limits",
              listing_name: "Credit Limits API",
              agent_slug: null,
              agent_name: null,
              network: "BASE_SEPOLIA",
              asset_address: null,
              txn_count: 12n,
              amount: decimal("0.34"),
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const instance = await app();
      const response = await instance.inject({
        method: "GET",
        url: `/me/customers/${CUSTOMER_ID}/breakdown`,
        headers: AUTH,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().items[0]).toMatchObject({
        kind: "listing",
        name: "Credit Limits API",
        txnCount: 12,
        volume: [
          { network: "BASE_SEPOLIA", assetAddress: null, amount: "0.34" },
        ],
      });

      await instance.close();
    });

    it("404s a detail panel for a customer that is not the caller's", async () => {
      customer.findFirst.mockResolvedValue(null);

      const instance = await app();

      for (const panel of ["overview", "activity", "breakdown"]) {
        const response = await instance.inject({
          method: "GET",
          url: `/me/customers/${CUSTOMER_ID}/${panel}`,
          headers: AUTH,
        });
        expect(response.statusCode, panel).toBe(404);
      }

      await instance.close();
    });
  });
});
