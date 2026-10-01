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
  customerPaymentIdentity,
  wallet,
  queryRaw,
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
  customerPaymentIdentity: {
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
  },
  wallet: { findMany: vi.fn() },
  queryRaw: vi.fn(),
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
  },
  prisma: {
    customer,
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

/** A stand-in for `Prisma.Decimal`: anything the mapper can `.toString()`. */
const decimal = (value: string) => ({ toString: () => value });

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
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
  ...over,
});

const storedCustomer = (over: Record<string, unknown> = {}) => ({
  id: CUSTOMER_ID,
  name: "Acme Procurement",
  email: "ops@acme.test",
  type: "ORGANIZATION",
  status: "ACTIVE",
  description: null,
  notes: null,
  dailyLimit: null,
  monthlyLimit: decimal("5000"),
  limitCurrency: "USD",
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
    for (const group of [customer, customerPaymentIdentity, wallet]) {
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
