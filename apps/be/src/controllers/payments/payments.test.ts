import { clearUserCache } from "@auth/user-store";
import { paymentRoutes } from "@routes/payments";
import { hashSecret } from "@utils/secrets";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";

const {
  authenticateRequest,
  getUser,
  findUnique,
  upsert,
  payment,
  wallet,
  apiKey,
  apiListing,
  agent,
  redeemPaymentBenefits,
} = vi.hoisted(() => ({
  redeemPaymentBenefits: vi.fn(),
  authenticateRequest: vi.fn(),
  getUser: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  payment: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  wallet: { findMany: vi.fn(), findFirst: vi.fn() },
  apiKey: { findUnique: vi.fn(), update: vi.fn() },
  apiListing: { findFirst: vi.fn() },
  agent: { findFirst: vi.fn() },
}));

vi.mock("@controllers/customers/repository", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  redeemPaymentBenefits,
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({ authenticateRequest, users: { getUser } })),
}));

vi.mock("@4mica/db", () => ({
  Prisma: {
    join: (values: unknown[]) => ({ values }),
    sql: (strings: TemplateStringsArray) => ({ strings }),
  },
  prisma: {
    payment,
    wallet,
    apiKey,
    apiListing,
    agent,
    user: { findUnique, upsert, update: vi.fn() },
    business: { findUnique: vi.fn(), upsert: vi.fn() },
    $queryRaw: vi.fn(async () => []),
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: unknown) => unknown)({ payment, wallet })
        : Promise.all(arg as Promise<unknown>[]),
    ),
  },
  disconnect: vi.fn(async () => {}),
}));

const USER_ID = "019fce62-0000-7000-8000-000000000000";
const OWNER_ID = "019fce62-0000-7000-8000-00000000aaaa";
const PAYMENT_ID = "019fce62-5555-7000-8000-000000000000";

const MY_ADDRESS = "0x6c5cc69e4c4863dbc3439ab2673806ea7715ebd5";
const OTHER_ADDRESS = "0x3d8e1f5a7c9b2d4e6a8c0f2b4d6e8a1c3f5b7d09";
const CHECKSUMMED = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const API_KEY = "4mica_sk_abcdefghijklmnop";

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
const KEY_AUTH = { authorization: `Bearer ${API_KEY}` };

const storedKey = (over: Record<string, unknown> = {}) => ({
  id: "key_1",
  ownerId: OWNER_ID,
  listingId: null,
  agentId: null,
  revokedAt: null,
  expiresAt: null,
  owner: { banned: false, locked: false, deletedAt: null },
  listing: null,
  agent: null,
  ...over,
});

const storedPayment = (over: Record<string, unknown> = {}) => ({
  id: PAYMENT_ID,
  listingId: null,
  agentId: null,
  payerAddress: OTHER_ADDRESS,
  recipientAddress: MY_ADDRESS,
  network: "BASE_SEPOLIA",
  assetAddress: null,
  amount: { toFixed: () => "0.010000000000000000" },
  status: "SETTLED",
  failureReason: null,
  reqId: "0xabc",
  txHash: null,
  resource: null,
  description: null,
  couponCode: null,
  creditApplied: null,
  redeemedAt: null,
  settledAt: new Date("2026-09-21T00:00:00.000Z"),
  createdAt: new Date(),
  updatedAt: new Date(),
  listing: null,
  agent: null,
  ...over,
});

const existingPayment = (over: Record<string, unknown> = {}) => ({
  id: PAYMENT_ID,
  status: "SETTLED",
  settledAt: new Date("2026-09-21T00:00:00.000Z"),
  payerAddress: OTHER_ADDRESS,
  recipientAddress: MY_ADDRESS,
  network: "BASE_SEPOLIA",
  assetAddress: null,
  amount: { toFixed: () => "0.010000000000000000" },
  listingId: null,
  agentId: null,
  failureReason: null,
  guaranteeClaims: null,
  guaranteeSignature: null,
  txHash: null,
  resource: null,
  description: null,
  ...over,
});

const validReport = (over: Record<string, unknown> = {}) => ({
  reqId: "0xabc123",
  payerAddress: "0x3D8E1f5a7c9B2D4E6a8C0F2B4D6E8A1c3F5B7D09",
  recipientAddress: "0x6c5CC69E4C4863DbC3439Ab2673806ea7715eBD5",
  network: "BASE_SEPOLIA",
  amount: "0.01",
  ...over,
});

const app = () => initApp([{ plugin: paymentRoutes }]);

describe("payment routes", () => {
  beforeEach(() => {
    for (const m of [authenticateRequest, getUser, findUnique, upsert]) {
      m.mockReset();
    }
    for (const group of [payment, wallet, apiKey, apiListing, agent]) {
      for (const fn of Object.values(group)) {
        fn.mockReset();
      }
    }
    clearUserCache();

    authenticateRequest.mockResolvedValue(signedIn());
    upsert.mockResolvedValue(AUTH_USER);

    wallet.findMany.mockResolvedValue([{ address: MY_ADDRESS }]);
    wallet.findFirst.mockResolvedValue({ id: "wallet_1" });
    payment.findMany.mockResolvedValue([storedPayment()]);
    payment.findFirst.mockResolvedValue(storedPayment());
    payment.count.mockResolvedValue(1);
    payment.groupBy.mockResolvedValue([]);
    payment.create.mockResolvedValue(storedPayment());
    payment.updateMany.mockResolvedValue({ count: 1 });
    payment.findUnique.mockResolvedValue(null);

    apiKey.findUnique.mockResolvedValue(storedKey());
    apiKey.update.mockResolvedValue({});

    redeemPaymentBenefits.mockReset();
    redeemPaymentBenefits.mockResolvedValue(null);
  });

  describe("session-authenticated reads", () => {
    it("requires authentication", async () => {
      authenticateRequest.mockResolvedValue(signedOut());
      const instance = await app();

      for (const url of [
        "/me/payments",
        "/me/payments/summary",
        `/me/payments/${PAYMENT_ID}`,
      ]) {
        const res = await instance.inject({ method: "GET", url });
        expect(res.statusCode, url).toBe(401);
      }

      await instance.close();
    });

    it("scopes the list to addresses the caller has proved they control", async () => {
      const instance = await app();

      await instance.inject({
        method: "GET",
        url: "/me/payments",
        headers: AUTH,
      });

      expect(wallet.findMany.mock.calls[0][0].where).toEqual({
        ownerId: USER_ID,
      });
      const where = payment.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { payerAddress: { in: [MY_ADDRESS] } },
        { recipientAddress: { in: [MY_ADDRESS] } },
      ]);

      await instance.close();
    });

    it("returns nothing at all when the caller has no wallets", async () => {
      wallet.findMany.mockResolvedValue([]);
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: "/me/payments",
        headers: AUTH,
      });

      expect(res.json()).toEqual({ items: [], total: 0, page: 1, limit: 20 });
      expect(payment.findMany).not.toHaveBeenCalled();

      await instance.close();
    });

    it("narrows to one direction on request", async () => {
      const instance = await app();

      await instance.inject({
        method: "GET",
        url: "/me/payments?direction=sent",
        headers: AUTH,
      });
      expect(payment.findMany.mock.calls[0][0].where).toMatchObject({
        payerAddress: { in: [MY_ADDRESS] },
      });

      payment.findMany.mockClear();
      await instance.inject({
        method: "GET",
        url: "/me/payments?direction=received",
        headers: AUTH,
      });
      expect(payment.findMany.mock.calls[0][0].where).toMatchObject({
        recipientAddress: { in: [MY_ADDRESS] },
      });

      await instance.close();
    });

    it("labels each row with its direction for this caller", async () => {
      payment.findMany.mockResolvedValue([
        storedPayment({
          payerAddress: OTHER_ADDRESS,
          recipientAddress: MY_ADDRESS,
        }),
        storedPayment({
          id: "other",
          payerAddress: MY_ADDRESS,
          recipientAddress: OTHER_ADDRESS,
        }),
      ]);
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: "/me/payments",
        headers: AUTH,
      });

      expect(
        res.json().items.map((p: { direction: string }) => p.direction),
      ).toEqual(["received", "sent"]);

      await instance.close();
    });

    it("serialises the amount as a string, not a mangled Decimal", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: "/me/payments",
        headers: AUTH,
      });

      expect(res.json().items[0].amount).toBe("0.010000000000000000");

      await instance.close();
    });

    it("never exposes the guarantee blobs", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: "/me/payments",
        headers: AUTH,
      });

      expect(payment.findMany.mock.calls[0][0].select).not.toHaveProperty(
        "guaranteeClaims",
      );
      expect(res.body).not.toContain("guaranteeClaims");

      await instance.close();
    });

    it("escapes LIKE wildcards in the search", async () => {
      const instance = await app();

      await instance.inject({
        method: "GET",
        url: "/me/payments?q=%25",
        headers: AUTH,
      });

      const or = payment.findMany.mock.calls[0][0].where.AND[0].OR;
      expect(or[0].payerAddress.contains).toBe("\\%");

      await instance.close();
    });

    it("rejects an unreachable page", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: "/me/payments?page=100000&limit=100",
        headers: AUTH,
      });

      expect(res.statusCode).toBe(400);

      await instance.close();
    });

    it("404s a payment that involves none of the caller's addresses", async () => {
      payment.findFirst.mockResolvedValue(null);
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: `/me/payments/${PAYMENT_ID}`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(404);

      await instance.close();
    });

    it("routes /stats to the stats handler, not the :id one", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: "/me/payments/stats",
        headers: AUTH,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveProperty("months");
      expect(res.json()).toHaveProperty("received");
      expect(payment.findFirst).not.toHaveBeenCalled();

      await instance.close();
    });

    it("returns contiguous months, including empty ones", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: "/me/payments/stats?months=3",
        headers: AUTH,
      });

      const body = res.json();
      expect(body.months).toHaveLength(3);
      expect(body.received).toHaveLength(3);
      expect(body.sent).toHaveLength(3);
      expect(body.months).toEqual([...body.months].sort());

      await instance.close();
    });

    it("splits the summary by direction", async () => {
      payment.count.mockResolvedValue(3);
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: "/me/payments/summary",
        headers: AUTH,
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveProperty("sent");
      expect(res.json()).toHaveProperty("received");

      await instance.close();
    });
  });

  describe("API-key reporting", () => {
    it("rejects a missing or malformed key", async () => {
      const instance = await app();

      for (const headers of [
        undefined,
        { authorization: "nonsense" },
        { authorization: "Bearer " },
      ]) {
        const res = await instance.inject({
          method: "POST",
          url: "/v1/payments",
          headers,
          payload: validReport(),
        });
        expect(res.statusCode).toBe(401);
      }

      await instance.close();
    });

    it("looks the key up by hash, never by plaintext", async () => {
      const instance = await app();

      await instance.inject({
        method: "POST",
        url: "/v1/payments",
        headers: KEY_AUTH,
        payload: validReport(),
      });

      const where = apiKey.findUnique.mock.calls[0][0].where;
      expect(where.hashedKey).toBe(hashSecret(API_KEY));
      expect(JSON.stringify(where)).not.toContain(API_KEY);

      await instance.close();
    });

    it("rejects a revoked, expired, banned or locked key", async () => {
      const instance = await app();

      for (const key of [
        storedKey({ revokedAt: new Date() }),
        storedKey({ expiresAt: new Date(Date.now() - 1000) }),
        storedKey({ owner: { banned: true, locked: false, deletedAt: null } }),
        storedKey({ owner: { banned: false, locked: true, deletedAt: null } }),
        storedKey({
          owner: { banned: false, locked: false, deletedAt: new Date() },
        }),
        null,
      ]) {
        apiKey.findUnique.mockResolvedValue(key);
        const res = await instance.inject({
          method: "POST",
          url: "/v1/payments",
          headers: KEY_AUTH,
          payload: validReport(),
        });
        expect(res.statusCode).toBe(401);
      }

      await instance.close();
    });

    it("files the payment against the key's owner, not a body field", async () => {
      const instance = await app();

      await instance.inject({
        method: "POST",
        url: "/v1/payments",
        headers: KEY_AUTH,
        payload: validReport({
          ownerId: "019fce62-dead-7000-8000-000000000000",
        }),
      });

      expect(
        payment.findUnique.mock.calls[0][0].where.ownerId_reqId.ownerId,
      ).toBe(OWNER_ID);
      expect(payment.create.mock.calls[0][0].data.ownerId).toBe(OWNER_ID);

      await instance.close();
    });

    it("lower-cases the addresses it stores", async () => {
      const instance = await app();

      await instance.inject({
        method: "POST",
        url: "/v1/payments",
        headers: KEY_AUTH,
        payload: validReport({ assetAddress: CHECKSUMMED }),
      });

      const written = payment.create.mock.calls[0][0].data;
      expect(written.payerAddress).toBe(OTHER_ADDRESS);
      expect(written.recipientAddress).toBe(MY_ADDRESS);
      expect(written.assetAddress).toBe(CHECKSUMMED.toLowerCase());

      await instance.close();
    });

    it("is idempotent on reqId: 201 the first time, 200 after", async () => {
      const instance = await app();

      const first = await instance.inject({
        method: "POST",
        url: "/v1/payments",
        headers: KEY_AUTH,
        payload: validReport(),
      });
      expect(first.statusCode).toBe(201);

      payment.findUnique
        .mockResolvedValueOnce(existingPayment())
        .mockResolvedValueOnce(storedPayment());
      const second = await instance.inject({
        method: "POST",
        url: "/v1/payments",
        headers: KEY_AUTH,
        payload: validReport(),
      });
      expect(second.statusCode).toBe(200);

      expect(payment.create).toHaveBeenCalledTimes(1);
      expect(payment.updateMany).not.toHaveBeenCalled();

      await instance.close();
    });

    it("refuses a replay that changes the amount of a reported payment", async () => {
      payment.findUnique.mockResolvedValueOnce(existingPayment());
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/v1/payments",
        headers: KEY_AUTH,
        payload: validReport({ amount: "1000" }),
      });

      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({
        error: "payment_conflict",
        issues: [{ path: "amount" }],
      });
      expect(payment.updateMany).not.toHaveBeenCalled();
      expect(payment.create).not.toHaveBeenCalled();

      await instance.close();
    });

    it("treats 0.01 and 0.010000 as the same amount", async () => {
      payment.findUnique
        .mockResolvedValueOnce(existingPayment())
        .mockResolvedValueOnce(storedPayment());
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/v1/payments",
        headers: KEY_AUTH,
        payload: validReport({ amount: "0.010000" }),
      });

      expect(res.statusCode).toBe(200);

      await instance.close();
    });

    it("records the coupon and credit the paywall applied", async () => {
      const instance = await app();

      await instance.inject({
        method: "POST",
        url: "/v1/payments",
        headers: KEY_AUTH,
        payload: validReport({ couponCode: "welcome10", creditApplied: "4" }),
      });

      expect(payment.create.mock.calls[0][0].data).toMatchObject({
        couponCode: "WELCOME10",
        creditApplied: "4",
      });

      await instance.close();
    });

    it("rejects a malformed coupon code or credit amount", async () => {
      const instance = await app();

      for (const over of [
        { couponCode: "no spaces" },
        { creditApplied: "0" },
      ]) {
        const res = await instance.inject({
          method: "POST",
          url: "/v1/payments",
          headers: KEY_AUTH,
          payload: validReport(over),
        });
        expect(res.statusCode, JSON.stringify(over)).toBe(400);
      }

      await instance.close();
    });

    it("redeems once the settled payment carries a coupon or credit", async () => {
      payment.create.mockResolvedValue(
        storedPayment({ couponCode: "WELCOME10" }),
      );
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/v1/payments",
        headers: KEY_AUTH,
        payload: validReport({ couponCode: "WELCOME10" }),
      });

      expect(res.statusCode).toBe(201);
      expect(redeemPaymentBenefits).toHaveBeenCalledWith(OWNER_ID, PAYMENT_ID);
      expect(res.json()).not.toHaveProperty("couponCode");

      await instance.close();
    });

    it("skips redemption while the payment is pending or already redeemed", async () => {
      const instance = await app();

      for (const over of [
        { status: "PENDING", couponCode: "WELCOME10" },
        { couponCode: "WELCOME10", redeemedAt: new Date() },
        {},
      ]) {
        payment.create.mockResolvedValueOnce(storedPayment(over));
        await instance.inject({
          method: "POST",
          url: "/v1/payments",
          headers: KEY_AUTH,
          payload: validReport({ reqId: "0xabc124" }),
        });
      }

      expect(redeemPaymentBenefits).not.toHaveBeenCalled();

      await instance.close();
    });

    it("still records the payment when redemption fails", async () => {
      payment.create.mockResolvedValue(
        storedPayment({ creditApplied: { toFixed: () => "4" } }),
      );
      redeemPaymentBenefits.mockRejectedValue(new Error("serialization"));
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/v1/payments",
        headers: KEY_AUTH,
        payload: validReport({ creditApplied: "4" }),
      });

      expect(res.statusCode).toBe(201);
      expect(redeemPaymentBenefits).toHaveBeenCalled();

      await instance.close();
    });

    it("matches a tiny stored amount that Decimal would print as 1e-8", async () => {
      const tiny = { toFixed: () => "0.00000001", toString: () => "1e-8" };
      payment.findUnique
        .mockResolvedValueOnce(existingPayment({ amount: tiny }))
        .mockResolvedValueOnce(storedPayment({ amount: tiny }));
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/v1/payments",
        headers: KEY_AUTH,
        payload: validReport({ amount: "0.00000001" }),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().amount).toBe("0.00000001");

      await instance.close();
    });

    it("refuses to move a final payment back to pending", async () => {
      payment.findUnique.mockResolvedValueOnce(existingPayment());
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/v1/payments",
        headers: KEY_AUTH,
        payload: validReport({ status: "PENDING" }),
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().issues).toEqual([
        expect.objectContaining({ path: "status" }),
      ]);
      expect(payment.updateMany).not.toHaveBeenCalled();

      await instance.close();
    });

    it("settles a pending payment, guarded on the status it read", async () => {
      payment.findUnique
        .mockResolvedValueOnce(
          existingPayment({ status: "PENDING", settledAt: null }),
        )
        .mockResolvedValueOnce(storedPayment());
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/v1/payments",
        headers: KEY_AUTH,
        payload: validReport({ status: "SETTLED", txHash: "0xfeed" }),
      });

      expect(res.statusCode).toBe(200);
      const [call] = payment.updateMany.mock.calls;
      expect(call[0].where).toEqual({ id: PAYMENT_ID, status: "PENDING" });
      expect(call[0].data).toMatchObject({
        status: "SETTLED",
        txHash: "0xfeed",
      });
      expect(call[0].data.settledAt).toBeInstanceOf(Date);

      await instance.close();
    });

    it("only fills gaps on a final payment, never overwrites", async () => {
      payment.findUnique
        .mockResolvedValueOnce(existingPayment({ description: "original" }))
        .mockResolvedValueOnce(storedPayment());
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/v1/payments",
        headers: KEY_AUTH,
        payload: validReport({ txHash: "0xfeed", description: "rewritten" }),
      });

      expect(res.statusCode).toBe(200);
      expect(payment.updateMany.mock.calls[0][0].data).toEqual({
        txHash: "0xfeed",
      });

      await instance.close();
    });

    it("re-reads instead of failing when a concurrent first report wins", async () => {
      payment.create.mockRejectedValueOnce(
        Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
      );
      payment.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(existingPayment())
        .mockResolvedValueOnce(storedPayment());
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/v1/payments",
        headers: KEY_AUTH,
        payload: validReport(),
      });

      expect(res.statusCode).toBe(200);
      expect(payment.create).toHaveBeenCalledTimes(1);

      await instance.close();
    });

    it("rejects a resource that is not an http(s) URL", async () => {
      const instance = await app();

      for (const resource of [
        "javascript:alert(1)",
        "data:text/html,<script>alert(1)</script>",
      ]) {
        const res = await instance.inject({
          method: "POST",
          url: "/v1/payments",
          headers: KEY_AUTH,
          payload: validReport({ resource }),
        });
        expect(res.statusCode).toBe(400);
      }
      expect(payment.create).not.toHaveBeenCalled();

      await instance.close();
    });

    it("keeps the amount an exact decimal string", async () => {
      const instance = await app();

      await instance.inject({
        method: "POST",
        url: "/v1/payments",
        headers: KEY_AUTH,
        payload: validReport({ amount: "0.000000000000000001" }),
      });

      expect(payment.create.mock.calls[0][0].data.amount).toBe(
        "0.000000000000000001",
      );

      await instance.close();
    });

    it("rejects an amount sent as a JSON number", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/v1/payments",
        headers: KEY_AUTH,
        payload: validReport({ amount: 0.01 }),
      });

      expect(res.statusCode).toBe(400);

      await instance.close();
    });

    it("refuses a payment from an address to itself", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/v1/payments",
        headers: KEY_AUTH,
        payload: validReport({
          recipientAddress: validReport().payerAddress,
        }),
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].path).toBe("recipientAddress");

      await instance.close();
    });

    it("requires a reason when the status is FAILED", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/v1/payments",
        headers: KEY_AUTH,
        payload: validReport({ status: "FAILED" }),
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].path).toBe("failureReason");

      await instance.close();
    });

    it("only stamps settledAt for a settled payment", async () => {
      const instance = await app();

      await instance.inject({
        method: "POST",
        url: "/v1/payments",
        headers: KEY_AUTH,
        payload: validReport({ status: "PENDING" }),
      });
      expect(payment.create.mock.calls[0][0].data.settledAt).toBeNull();

      payment.create.mockClear();
      await instance.inject({
        method: "POST",
        url: "/v1/payments",
        headers: KEY_AUTH,
        payload: validReport({ status: "SETTLED" }),
      });
      expect(payment.create.mock.calls[0][0].data.settledAt).toBeInstanceOf(
        Date,
      );

      await instance.close();
    });

    it("refuses a recipient that is not one of the key owner's wallets", async () => {
      wallet.findFirst.mockResolvedValue(null);
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/v1/payments",
        headers: KEY_AUTH,
        payload: validReport(),
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].path).toBe("recipientAddress");
      expect(wallet.findFirst.mock.calls[0][0].where).toEqual({
        ownerId: OWNER_ID,
        address: MY_ADDRESS,
        network: "BASE_SEPOLIA",
      });
      expect(payment.create).not.toHaveBeenCalled();

      await instance.close();
    });

    it("refuses a listing slug that is not the key owner's", async () => {
      apiListing.findFirst.mockResolvedValue(null);
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/v1/payments",
        headers: KEY_AUTH,
        payload: validReport({ listingSlug: "someone-elses" }),
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].path).toBe("listingSlug");

      await instance.close();
    });

    it("attributes a payment to the key owner's listing", async () => {
      apiListing.findFirst.mockResolvedValue({ id: "listing_1" });
      const instance = await app();

      await instance.inject({
        method: "POST",
        url: "/v1/payments",
        headers: KEY_AUTH,
        payload: validReport({ listingSlug: "credit-limits" }),
      });

      expect(apiListing.findFirst.mock.calls[0][0].where).toMatchObject({
        ownerId: OWNER_ID,
        slug: "credit-limits",
        deletedAt: null,
      });
      expect(payment.create.mock.calls[0][0].data.listingId).toBe("listing_1");

      await instance.close();
    });

    it("pins a listing key's payment to that listing", async () => {
      apiKey.findUnique.mockResolvedValue(
        storedKey({ listingId: "listing_1" }),
      );
      const instance = await app();

      await instance.inject({
        method: "POST",
        url: "/v1/payments",
        headers: KEY_AUTH,
        payload: validReport(),
      });

      expect(apiListing.findFirst).not.toHaveBeenCalled();
      expect(payment.create.mock.calls[0][0].data.listingId).toBe("listing_1");

      await instance.close();
    });

    it("refuses a listing key reporting against another listing", async () => {
      apiKey.findUnique.mockResolvedValue(
        storedKey({ listingId: "listing_1" }),
      );
      apiListing.findFirst.mockResolvedValue({ id: "listing_2" });
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/v1/payments",
        headers: KEY_AUTH,
        payload: validReport({ listingSlug: "other-listing" }),
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0]).toEqual({
        path: "listingSlug",
        message: "does not match this key",
      });
      expect(payment.create).not.toHaveBeenCalled();

      await instance.close();
    });

    it("pins an agent key's payment to that agent", async () => {
      apiKey.findUnique.mockResolvedValue(storedKey({ agentId: "agent_1" }));
      const instance = await app();

      await instance.inject({
        method: "POST",
        url: "/v1/payments",
        headers: KEY_AUTH,
        payload: validReport(),
      });

      expect(agent.findFirst).not.toHaveBeenCalled();
      expect(payment.create.mock.calls[0][0].data.agentId).toBe("agent_1");

      await instance.close();
    });

    it("records that the key was used", async () => {
      const instance = await app();

      await instance.inject({
        method: "POST",
        url: "/v1/payments",
        headers: KEY_AUTH,
        payload: validReport(),
      });

      expect(apiKey.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "key_1" } }),
      );

      await instance.close();
    });

    it("does not accept a session token in place of an API key", async () => {
      apiKey.findUnique.mockResolvedValue(null);
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/v1/payments",
        headers: AUTH,
        payload: validReport(),
      });

      expect(res.statusCode).toBe(401);

      await instance.close();
    });
  });
});
