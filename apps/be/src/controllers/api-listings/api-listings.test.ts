import { clearUserCache } from "@auth/user-store";
import { apiListingRoutes } from "@routes/api-listings";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";

const {
  authenticateRequest,
  getUser,
  findUnique,
  upsert,
  apiListing,
  apiEndpoint,
  wallet,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getUser: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  apiListing: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  apiEndpoint: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  },
  wallet: { findFirst: vi.fn() },
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({ authenticateRequest, users: { getUser } })),
}));

vi.mock("@4mica/db", () => ({
  prisma: {
    agent: { count: vi.fn() },
    user: { findUnique, upsert, update: vi.fn() },
    business: { findUnique: vi.fn(), upsert: vi.fn() },
    apiListing,
    apiEndpoint,
    wallet,
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: unknown) => unknown)({ apiListing, apiEndpoint, wallet })
        : Promise.all(arg as Promise<unknown>[]),
    ),
  },
  disconnect: vi.fn(async () => {}),
}));

const USER_ID = "019fce62-0000-7000-8000-000000000000";
const LISTING_ID = "019fce62-3333-7000-8000-000000000000";
const WALLET_ID = "019fce62-1111-7000-8000-000000000000";
const OTHER_WALLET_ID = "019fce62-1111-7000-8000-0000000000ff";

const WALLET_ADDRESS = "0x6c5cc69e4c4863dbc3439ab2673806ea7715ebd5";
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

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

const storedWallet = (over: Record<string, unknown> = {}) => ({
  id: WALLET_ID,
  address: WALLET_ADDRESS,
  network: "BASE_SEPOLIA",
  role: "BOTH",
  status: "ACTIVE",
  ...over,
});

const storedListing = (over: Record<string, unknown> = {}) => ({
  id: LISTING_ID,
  slug: "credit-limits",
  name: "Credit Limits API",
  summary: null,
  description: null,
  baseUrl: null,
  docsUrl: null,
  category: null,
  tags: [],
  priceLabel: null,
  visibility: "PRIVATE",
  publishedAt: null,
  walletId: WALLET_ID,
  network: "BASE_SEPOLIA",
  payToAddress: WALLET_ADDRESS,
  assetAddress: null,
  priceAmount: null,
  priceCurrency: null,
  x402Endpoint: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  endpoints: [],
  ...over,
});

const app = () => initApp([{ plugin: apiListingRoutes }]);

describe("api listing routes", () => {
  beforeEach(() => {
    for (const m of [authenticateRequest, getUser, findUnique, upsert]) {
      m.mockReset();
    }
    for (const group of [apiListing, apiEndpoint, wallet]) {
      for (const fn of Object.values(group)) {
        fn.mockReset();
      }
    }
    clearUserCache();

    authenticateRequest.mockResolvedValue(signedIn());
    upsert.mockResolvedValue(AUTH_USER);

    wallet.findFirst.mockResolvedValue(storedWallet());

    apiListing.findMany.mockResolvedValue([storedListing()]);
    apiListing.count.mockResolvedValue(1);
    apiListing.findFirst.mockResolvedValue(storedListing());
    apiListing.create.mockResolvedValue(storedListing());
    apiListing.update.mockResolvedValue(storedListing());
    apiListing.updateMany.mockResolvedValue({ count: 1 });
    apiEndpoint.deleteMany.mockResolvedValue({ count: 0 });
    apiEndpoint.createMany.mockResolvedValue({ count: 0 });
  });

  it("requires authentication on every api-listing route", async () => {
    authenticateRequest.mockResolvedValue(signedOut());
    const instance = await app();

    for (const [method, url] of [
      ["GET", "/me/api-listings"],
      ["GET", `/me/api-listings/${LISTING_ID}`],
      ["POST", "/me/api-listings"],
      ["PATCH", `/me/api-listings/${LISTING_ID}`],
      ["PUT", `/me/api-listings/${LISTING_ID}/endpoints`],
      ["POST", `/me/api-listings/${LISTING_ID}/publish`],
      ["POST", `/me/api-listings/${LISTING_ID}/unpublish`],
      ["DELETE", `/me/api-listings/${LISTING_ID}`],
      ["POST", "/me/api-listings/batch-delete"],
    ] as const) {
      const res = await instance.inject({ method, url, payload: {} });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }

    await instance.close();
  });

  describe("payment facts are derived, never accepted", () => {
    it("ignores payToAddress and network sent in the body", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/api-listings",
        headers: AUTH,
        payload: {
          name: "Credit Limits API",
          walletId: WALLET_ID,
          payToAddress: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
          network: "BASE",
        },
      });

      expect(res.statusCode).toBe(201);
      const written = apiListing.create.mock.calls[0][0].data;
      expect(written.payToAddress).toBe(WALLET_ADDRESS);
      expect(written.network).toBe("BASE_SEPOLIA");

      await instance.close();
    });

    it("leaves the payment half null when no wallet is chosen", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/api-listings",
        headers: AUTH,
        payload: { name: "Draft listing" },
      });

      expect(res.statusCode).toBe(201);
      const written = apiListing.create.mock.calls[0][0].data;
      expect(written.walletId).toBeNull();
      expect(written.network).toBeNull();
      expect(written.payToAddress).toBeNull();
      expect(wallet.findFirst).not.toHaveBeenCalled();

      await instance.close();
    });

    it("clears network and payToAddress when the wallet is unlinked", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "PATCH",
        url: `/me/api-listings/${LISTING_ID}`,
        headers: AUTH,
        payload: { walletId: null },
      });

      expect(res.statusCode).toBe(200);
      const written = apiListing.updateMany.mock.calls[0][0].data;
      expect(written.walletId).toBeNull();
      expect(written.network).toBeNull();
      expect(written.payToAddress).toBeNull();

      await instance.close();
    });
  });

  describe("wallet eligibility", () => {
    it("rejects a wallet that is not the caller's", async () => {
      wallet.findFirst.mockResolvedValue(null);
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/api-listings",
        headers: AUTH,
        payload: { name: "Listing", walletId: OTHER_WALLET_ID },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("wallet_not_found");
      expect(res.json().issues[0].path).toBe("walletId");

      await instance.close();
    });

    it("scopes the wallet lookup to the caller", async () => {
      const instance = await app();

      await instance.inject({
        method: "POST",
        url: "/me/api-listings",
        headers: AUTH,
        payload: { name: "Listing", walletId: WALLET_ID },
      });

      expect(wallet.findFirst.mock.calls[0][0].where).toMatchObject({
        id: WALLET_ID,
        ownerId: USER_ID,
      });

      await instance.close();
    });

    it("rejects a paused wallet", async () => {
      wallet.findFirst.mockResolvedValue(storedWallet({ status: "PAUSED" }));
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/api-listings",
        headers: AUTH,
        payload: { name: "Listing", walletId: WALLET_ID },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("wallet_not_active");

      await instance.close();
    });

    it("rejects a payer-only wallet", async () => {
      wallet.findFirst.mockResolvedValue(storedWallet({ role: "PAYER" }));
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/api-listings",
        headers: AUTH,
        payload: { name: "Listing", walletId: WALLET_ID },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("wallet_not_recipient");

      await instance.close();
    });
  });

  describe("money", () => {
    it("keeps the price a string so 18 decimals survive", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/api-listings",
        headers: AUTH,
        payload: {
          name: "Listing",
          priceAmount: "0.000000000000000001",
          priceCurrency: "usd",
        },
      });

      expect(res.statusCode).toBe(201);
      const written = apiListing.create.mock.calls[0][0].data;
      expect(written.priceAmount).toBe("0.000000000000000001");
      expect(written.priceCurrency).toBe("USD");

      await instance.close();
    });

    it("rejects a price sent as a JSON number", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/api-listings",
        headers: AUTH,
        payload: { name: "Listing", priceAmount: 0.01 },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].path).toBe("priceAmount");

      await instance.close();
    });

    it("rejects a zero or negative price", async () => {
      const instance = await app();

      for (const priceAmount of ["0", "0.0", "-1"]) {
        const res = await instance.inject({
          method: "POST",
          url: "/me/api-listings",
          headers: AUTH,
          payload: { name: "Listing", priceAmount },
        });
        expect(res.statusCode, priceAmount).toBe(400);
      }

      await instance.close();
    });

    it("lower-cases a checksummed asset address", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/api-listings",
        headers: AUTH,
        payload: { name: "Listing", assetAddress: USDC },
      });

      expect(res.statusCode).toBe(201);
      expect(apiListing.create.mock.calls[0][0].data.assetAddress).toBe(
        USDC.toLowerCase(),
      );

      await instance.close();
    });

    it("rejects an address with a bad checksum", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/api-listings",
        headers: AUTH,
        payload: {
          name: "Listing",
          assetAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7E",
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].path).toBe("assetAddress");

      await instance.close();
    });
  });

  describe("slugs", () => {
    it("generates a slug from the name", async () => {
      apiListing.findMany.mockResolvedValue([]);
      const instance = await app();

      await instance.inject({
        method: "POST",
        url: "/me/api-listings",
        headers: AUTH,
        payload: { name: "Credit Limits API" },
      });

      expect(apiListing.create.mock.calls[0][0].data.slug).toBe(
        "credit-limits-api",
      );

      await instance.close();
    });

    it("de-duplicates a generated slug", async () => {
      apiListing.findMany.mockResolvedValue([
        { slug: "credit-limits-api" },
        { slug: "credit-limits-api-2" },
      ]);
      const instance = await app();

      await instance.inject({
        method: "POST",
        url: "/me/api-listings",
        headers: AUTH,
        payload: { name: "Credit Limits API" },
      });

      expect(apiListing.create.mock.calls[0][0].data.slug).toBe(
        "credit-limits-api-3",
      );

      await instance.close();
    });

    it("refuses an explicit slug that is taken rather than renaming it", async () => {
      apiListing.findMany.mockResolvedValue([{ slug: "taken" }]);
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/api-listings",
        headers: AUTH,
        payload: { name: "Listing", slug: "taken" },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("slug_taken");

      await instance.close();
    });

    it("rejects a uuid-shaped slug, which would shadow a row id", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/api-listings",
        headers: AUTH,
        payload: { name: "Listing", slug: LISTING_ID },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].path).toBe("slug");

      await instance.close();
    });

    it("rejects a slug the playground's parser would reject", async () => {
      apiListing.findMany.mockResolvedValue([]);
      const instance = await app();

      for (const slug of ["has spaces", "punctuation!", "../escape", "a/b"]) {
        const res = await instance.inject({
          method: "POST",
          url: "/me/api-listings",
          headers: AUTH,
          payload: { name: "Listing", slug },
        });
        expect(res.statusCode, slug).toBe(400);
        expect(res.json().issues[0].path, slug).toBe("slug");
      }

      await instance.close();
    });

    it("normalises a slug's case rather than rejecting it", async () => {
      apiListing.findMany.mockResolvedValue([]);
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/api-listings",
        headers: AUTH,
        payload: { name: "Listing", slug: "Credit-Limits" },
      });

      expect(res.statusCode).toBe(201);
      expect(apiListing.create.mock.calls[0][0].data.slug).toBe(
        "credit-limits",
      );

      await instance.close();
    });
  });

  describe("publish", () => {
    it("refuses to publish a listing with no receiving wallet", async () => {
      apiListing.findFirst.mockResolvedValue(
        storedListing({ walletId: null, network: null, payToAddress: null }),
      );
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: `/me/api-listings/${LISTING_ID}/publish`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("listing_not_payable");
      expect(res.json().issues[0].path).toBe("walletId");

      await instance.close();
    });

    it("stamps publishedAt on the first publish", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: `/me/api-listings/${LISTING_ID}/publish`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(200);
      const written = apiListing.updateMany.mock.calls[0][0].data;
      expect(written.visibility).toBe("PUBLIC");
      expect(written.publishedAt).toBeInstanceOf(Date);

      await instance.close();
    });

    it("keeps the original publishedAt when re-publishing", async () => {
      const first = new Date("2026-01-01T00:00:00.000Z");
      apiListing.findFirst.mockResolvedValue(
        storedListing({ publishedAt: first, visibility: "PRIVATE" }),
      );
      const instance = await app();

      await instance.inject({
        method: "POST",
        url: `/me/api-listings/${LISTING_ID}/publish`,
        headers: AUTH,
      });

      expect(apiListing.updateMany.mock.calls[0][0].data.publishedAt).toBe(
        first,
      );

      await instance.close();
    });

    it("leaves publishedAt alone when unpublishing", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: `/me/api-listings/${LISTING_ID}/unpublish`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(200);
      const written = apiListing.updateMany.mock.calls[0][0].data;
      expect(written.visibility).toBe("PRIVATE");
      expect(written).not.toHaveProperty("publishedAt");

      await instance.close();
    });
  });

  describe("endpoints", () => {
    it("replaces the endpoint set wholesale", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "PUT",
        url: `/me/api-listings/${LISTING_ID}/endpoints`,
        headers: AUTH,
        payload: {
          endpoints: [
            { method: "GET", path: "/limits" },
            { method: "POST", path: "/holds", priceAmount: "0.05" },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      expect(apiEndpoint.deleteMany).toHaveBeenCalledWith({
        where: { listingId: LISTING_ID },
      });
      expect(apiEndpoint.createMany.mock.calls[0][0].data).toHaveLength(2);

      await instance.close();
    });

    it("rejects two endpoints with the same method and path", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "PUT",
        url: `/me/api-listings/${LISTING_ID}/endpoints`,
        headers: AUTH,
        payload: {
          endpoints: [
            { method: "GET", path: "/limits" },
            { method: "GET", path: "/limits" },
          ],
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].path).toBe("endpoints");

      await instance.close();
    });

    it("requires a leading slash, which the snippet builder assumes", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "PUT",
        url: `/me/api-listings/${LISTING_ID}/endpoints`,
        headers: AUTH,
        payload: { endpoints: [{ method: "GET", path: "limits" }] },
      });

      expect(res.statusCode).toBe(400);

      await instance.close();
    });

    it("caps the endpoint list", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "PUT",
        url: `/me/api-listings/${LISTING_ID}/endpoints`,
        headers: AUTH,
        payload: {
          endpoints: Array.from({ length: 51 }, (_, i) => ({
            method: "GET",
            path: `/r${i}`,
          })),
        },
      });

      expect(res.statusCode).toBe(400);

      await instance.close();
    });

    it("404s when the listing is not the caller's", async () => {
      apiListing.findFirst.mockResolvedValue(null);
      const instance = await app();

      const res = await instance.inject({
        method: "PUT",
        url: `/me/api-listings/${LISTING_ID}/endpoints`,
        headers: AUTH,
        payload: { endpoints: [] },
      });

      expect(res.statusCode).toBe(404);

      await instance.close();
    });
  });

  describe("soft delete", () => {
    it("marks deleted and releases the slug", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "DELETE",
        url: `/me/api-listings/${LISTING_ID}`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(204);
      const written = apiListing.update.mock.calls[0][0].data;
      expect(written.deletedAt).toBeInstanceOf(Date);
      expect(written.slug).not.toBe("credit-limits");
      expect(written.slug).toContain("deleted");

      await instance.close();
    });

    it("404s for a listing that is not the caller's", async () => {
      apiListing.findFirst.mockResolvedValue(null);
      const instance = await app();

      const res = await instance.inject({
        method: "DELETE",
        url: `/me/api-listings/${LISTING_ID}`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(404);

      await instance.close();
    });

    it("excludes soft-deleted rows from the list", async () => {
      const instance = await app();

      await instance.inject({
        method: "GET",
        url: "/me/api-listings",
        headers: AUTH,
      });

      expect(apiListing.findMany.mock.calls[0][0].where).toMatchObject({
        ownerId: USER_ID,
        deletedAt: null,
      });

      await instance.close();
    });
  });

  describe("listing", () => {
    it("escapes LIKE wildcards so % cannot match every row", async () => {
      const instance = await app();

      await instance.inject({
        method: "GET",
        url: "/me/api-listings?q=%25",
        headers: AUTH,
      });

      const where = apiListing.findMany.mock.calls[0][0].where;
      expect(where.OR[0].name.contains).toBe("\\%");

      await instance.close();
    });

    it("orders by a tiebroken key so a row cannot straddle two pages", async () => {
      const instance = await app();

      await instance.inject({
        method: "GET",
        url: "/me/api-listings",
        headers: AUTH,
      });

      expect(apiListing.findMany.mock.calls[0][0].orderBy).toEqual([
        { createdAt: "desc" },
        { id: "desc" },
      ]);

      await instance.close();
    });

    it("rejects an unreachable page rather than scanning to it", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: "/me/api-listings?page=100000&limit=100",
        headers: AUTH,
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].path).toBe("page");

      await instance.close();
    });

    it("rejects an oversized limit", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: "/me/api-listings?limit=101",
        headers: AUTH,
      });

      expect(res.statusCode).toBe(400);

      await instance.close();
    });

    it("returns the paging envelope", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: "/me/api-listings",
        headers: AUTH,
      });

      expect(res.json()).toMatchObject({ total: 1, page: 1, limit: 20 });

      await instance.close();
    });

    it("serialises the price as a string, not a mangled Decimal", async () => {
      apiListing.findMany.mockResolvedValue([
        storedListing({
          priceAmount: { toString: () => "0.010000000000000000" },
        }),
      ]);
      const instance = await app();

      const res = await instance.inject({
        method: "GET",
        url: "/me/api-listings",
        headers: AUTH,
      });

      expect(res.json().items[0].priceAmount).toBe("0.010000000000000000");

      await instance.close();
    });
  });

  describe("batch delete", () => {
    it("deletes only the caller's listings and reports the rest as notFound", async () => {
      const other = "019fce62-3333-7000-8000-0000000000ff";
      apiListing.findMany.mockResolvedValue([
        { id: LISTING_ID, slug: "credit-limits" },
      ]);
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/api-listings/batch-delete",
        headers: AUTH,
        payload: { ids: [LISTING_ID, other] },
      });

      expect(res.json()).toEqual({ deleted: [LISTING_ID], notFound: [other] });
      expect(apiListing.findMany.mock.calls[0][0].where).toMatchObject({
        ownerId: USER_ID,
        deletedAt: null,
      });

      await instance.close();
    });

    it("rejects a non-uuid id rather than letting Prisma 500", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/api-listings/batch-delete",
        headers: AUTH,
        payload: { ids: ["not-a-uuid"] },
      });

      expect(res.statusCode).toBe(400);

      await instance.close();
    });

    it("requires at least one id and caps the batch at 100", async () => {
      const instance = await app();

      const empty = await instance.inject({
        method: "POST",
        url: "/me/api-listings/batch-delete",
        headers: AUTH,
        payload: { ids: [] },
      });
      expect(empty.statusCode).toBe(400);

      const tooMany = await instance.inject({
        method: "POST",
        url: "/me/api-listings/batch-delete",
        headers: AUTH,
        payload: {
          ids: Array.from(
            { length: 101 },
            (_, i) => `019fce62-3333-7000-8000-${String(i).padStart(12, "0")}`,
          ),
        },
      });
      expect(tooMany.statusCode).toBe(400);

      await instance.close();
    });
  });

  it("blocks a banned account from creating a listing", async () => {
    upsert.mockResolvedValue({ ...AUTH_USER, banned: true });
    const instance = await app();

    const res = await instance.inject({
      method: "POST",
      url: "/me/api-listings",
      headers: AUTH,
      payload: { name: "Listing" },
    });

    expect(res.statusCode).toBe(403);

    await instance.close();
  });

  it("scopes read and update to the owner", async () => {
    const instance = await app();

    await instance.inject({
      method: "GET",
      url: `/me/api-listings/${LISTING_ID}`,
      headers: AUTH,
    });
    expect(apiListing.findFirst.mock.calls[0][0].where).toMatchObject({
      id: LISTING_ID,
      ownerId: USER_ID,
      deletedAt: null,
    });

    await instance.inject({
      method: "PATCH",
      url: `/me/api-listings/${LISTING_ID}`,
      headers: AUTH,
      payload: { name: "Renamed" },
    });
    expect(apiListing.updateMany.mock.calls[0][0].where).toMatchObject({
      id: LISTING_ID,
      ownerId: USER_ID,
      deletedAt: null,
    });

    await instance.close();
  });
});
