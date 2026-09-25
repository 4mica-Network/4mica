import { clearUserCache } from "@auth/user-store";
import { walletRoutes } from "@routes/wallets";
import { buildWalletLinkMessage } from "@services/siwe";
import { privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";

const {
  authenticateRequest,
  getUser,
  findUnique,
  upsert,
  wallet,
  walletNonce,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getUser: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
  wallet: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  walletNonce: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({ authenticateRequest, users: { getUser } })),
}));

vi.mock("@4mica/db", () => ({
  prisma: {
    agent: { count: vi.fn() },
    user: { findUnique, upsert, update: vi.fn() },
    business: { findUnique: vi.fn(), upsert: vi.fn() },
    wallet,
    walletNonce,
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: unknown) => unknown)({ wallet, walletNonce })
        : Promise.all(arg as Promise<unknown>[]),
    ),
  },
  disconnect: vi.fn(async () => {}),
}));

const USER_ID = "019fce62-0000-7000-8000-000000000000";
const OTHER_ID = "019fce62-0000-7000-8000-00000000ffff";
const WALLET_ID = "019fce62-1111-7000-8000-000000000000";

const TEST_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const signer = privateKeyToAccount(TEST_KEY);
const ADDRESS = signer.address.toLowerCase();

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

const STORED_WALLET = {
  id: WALLET_ID,
  label: "Treasury",
  description: null,
  address: ADDRESS,
  network: "BASE_SEPOLIA",
  role: "BOTH",
  status: "ACTIVE",
  isDefault: false,
  verifiedAt: new Date(),
  verificationMethod: "EOA_SIGNATURE",
  verifiedChainId: 84532,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const challenge = (over: Record<string, unknown> = {}) => ({
  id: "019fce62-2222-7000-8000-000000000000",
  userId: USER_ID,
  address: ADDRESS,
  network: "BASE_SEPOLIA",
  nonce: "test-nonce",
  chainId: 84532,
  domain: "app.test",
  uri: "http://app.test",
  issuedAt: new Date("2026-09-15T12:00:00.000Z"),
  expiresAt: new Date(Date.now() + 60_000),
  attempts: 0,
  consumedAt: null,
  ...over,
});

const signChallenge = async (row: ReturnType<typeof challenge>) =>
  signer.signMessage({
    message: buildWalletLinkMessage({
      domain: row.domain,
      uri: row.uri,
      address: row.address,
      chainId: row.chainId,
      nonce: row.nonce,
      issuedAt: row.issuedAt,
      expiresAt: row.expiresAt,
      userId: USER_ID,
    }),
  });

describe("wallet routes", () => {
  beforeEach(() => {
    for (const m of [authenticateRequest, getUser, findUnique, upsert]) {
      m.mockReset();
    }
    for (const group of [wallet, walletNonce]) {
      for (const fn of Object.values(group)) {
        fn.mockReset();
      }
    }
    clearUserCache();

    authenticateRequest.mockResolvedValue(signedIn());
    upsert.mockResolvedValue(AUTH_USER);

    wallet.findMany.mockResolvedValue([STORED_WALLET]);
    wallet.count.mockResolvedValue(1);
    wallet.findFirst.mockResolvedValue(STORED_WALLET);
    wallet.findUnique.mockResolvedValue(STORED_WALLET);
    wallet.create.mockResolvedValue(STORED_WALLET);
    wallet.update.mockResolvedValue(STORED_WALLET);
    wallet.updateMany.mockResolvedValue({ count: 1 });
    wallet.deleteMany.mockResolvedValue({ count: 1 });

    walletNonce.updateMany.mockResolvedValue({ count: 1 });
    walletNonce.deleteMany.mockResolvedValue({ count: 0 });
    walletNonce.create.mockResolvedValue(challenge());
  });

  it("requires authentication on every wallet route", async () => {
    authenticateRequest.mockResolvedValue(signedOut());
    const app = await initApp([{ plugin: walletRoutes }]);

    for (const [method, url] of [
      ["GET", "/me/wallets"],
      ["GET", `/me/wallets/${WALLET_ID}`],
      ["POST", "/me/wallets/siwe-nonce"],
      ["POST", "/me/wallets"],
      ["PATCH", `/me/wallets/${WALLET_ID}`],
      ["DELETE", `/me/wallets/${WALLET_ID}`],
      ["POST", "/me/wallets/batch-delete"],
    ] as const) {
      const res = await app.inject({ method, url, payload: {} });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }

    expect(wallet.create).not.toHaveBeenCalled();
    await app.close();
  });

  it("blocks a banned account from linking a wallet", async () => {
    upsert.mockResolvedValue({ ...AUTH_USER, banned: true });
    const app = await initApp([{ plugin: walletRoutes }]);

    const res = await app.inject({
      method: "POST",
      url: "/me/wallets/siwe-nonce",
      headers: AUTH,
      payload: { address: signer.address, network: "BASE_SEPOLIA" },
    });

    expect(res.statusCode).toBe(403);
    expect(walletNonce.create).not.toHaveBeenCalled();
    await app.close();
  });

  it("scopes list, read, update and delete to the owner", async () => {
    const app = await initApp([{ plugin: walletRoutes }]);

    await app.inject({ method: "GET", url: "/me/wallets", headers: AUTH });
    expect(wallet.findMany.mock.calls[0][0].where).toMatchObject({
      ownerId: USER_ID,
    });

    await app.inject({
      method: "GET",
      url: `/me/wallets/${WALLET_ID}`,
      headers: AUTH,
    });
    expect(wallet.findFirst.mock.calls[0][0].where).toEqual({
      id: WALLET_ID,
      ownerId: USER_ID,
    });

    await app.inject({
      method: "DELETE",
      url: `/me/wallets/${WALLET_ID}`,
      headers: AUTH,
    });
    expect(wallet.deleteMany.mock.calls[0][0].where).toEqual({
      id: WALLET_ID,
      ownerId: USER_ID,
    });

    await app.close();
  });

  it("404s for a wallet belonging to someone else", async () => {
    wallet.findFirst.mockResolvedValue(null);
    wallet.deleteMany.mockResolvedValue({ count: 0 });

    const app = await initApp([{ plugin: walletRoutes }]);

    for (const [method, payload] of [
      ["GET", undefined],
      ["PATCH", { label: "Theirs" }],
      ["DELETE", undefined],
    ] as const) {
      const res = await app.inject({
        method,
        url: `/me/wallets/${WALLET_ID}`,
        headers: AUTH,
        payload,
      });
      expect(res.statusCode, method).toBe(404);
    }

    await app.close();
  });

  describe("the SIWE challenge", () => {
    it("issues one for any valid address, revealing nothing about who holds it", async () => {
      const app = await initApp([{ plugin: walletRoutes }]);
      const res = await app.inject({
        method: "POST",
        url: "/me/wallets/siwe-nonce",
        headers: AUTH,
        payload: { address: signer.address, network: "BASE_SEPOLIA" },
      });

      expect(res.statusCode).toBe(201);
      expect(wallet.findFirst).not.toHaveBeenCalled();
      expect(wallet.findMany).not.toHaveBeenCalled();

      const body = res.json();
      expect(body.message).toContain("urn:4mica:purpose:wallet-link");
      expect(body.message).toContain(`urn:4mica:user:${USER_ID}`);
      expect(body.message).toContain(signer.address);
      expect(walletNonce.create.mock.calls[0][0].data.address).toBe(ADDRESS);
      await app.close();
    });

    it("replaces the caller's outstanding challenge for that address", async () => {
      const app = await initApp([{ plugin: walletRoutes }]);
      await app.inject({
        method: "POST",
        url: "/me/wallets/siwe-nonce",
        headers: AUTH,
        payload: { address: signer.address, network: "BASE_SEPOLIA" },
      });

      expect(walletNonce.deleteMany.mock.calls[0][0].where).toEqual({
        userId: USER_ID,
        address: ADDRESS,
        network: "BASE_SEPOLIA",
        consumedAt: null,
      });
      await app.close();
    });
  });

  describe("linking a wallet", () => {
    it("creates the wallet for a valid signature", async () => {
      const row = challenge();
      walletNonce.findFirst.mockResolvedValue(row);

      const app = await initApp([{ plugin: walletRoutes }]);
      const res = await app.inject({
        method: "POST",
        url: "/me/wallets",
        headers: AUTH,
        payload: {
          label: "Treasury",
          address: signer.address,
          network: "BASE_SEPOLIA",
          nonce: row.nonce,
          signature: await signChallenge(row),
        },
      });

      expect(res.statusCode).toBe(201);
      expect(wallet.create.mock.calls[0][0].data).toMatchObject({
        ownerId: USER_ID,
        address: ADDRESS,
        verificationMethod: "EOA_SIGNATURE",
        verifiedChainId: 84532,
      });
      await app.close();
    });

    it("consumes the nonce with a compare-and-swap, so a replay cannot land twice", async () => {
      const row = challenge();
      walletNonce.findFirst.mockResolvedValue(row);
      const signature = await signChallenge(row);

      const app = await initApp([{ plugin: walletRoutes }]);
      const payload = {
        label: "Treasury",
        address: signer.address,
        network: "BASE_SEPOLIA",
        nonce: row.nonce,
        signature,
      };

      const first = await app.inject({
        method: "POST",
        url: "/me/wallets",
        headers: AUTH,
        payload,
      });
      expect(first.statusCode).toBe(201);
      expect(walletNonce.updateMany.mock.calls[0][0].where).toMatchObject({
        id: row.id,
        consumedAt: null,
      });

      walletNonce.updateMany.mockResolvedValue({ count: 0 });
      wallet.create.mockClear();

      const second = await app.inject({
        method: "POST",
        url: "/me/wallets",
        headers: AUTH,
        payload,
      });
      expect(second.statusCode).toBe(400);
      expect(second.json().error).toBe("invalid_challenge");
      expect(wallet.create).not.toHaveBeenCalled();
      await app.close();
    });

    it("rejects an expired, already-consumed, or mismatched challenge", async () => {
      const app = await initApp([{ plugin: walletRoutes }]);
      const row = challenge();
      const signature = await signChallenge(row);

      for (const [name, stored] of [
        ["expired", challenge({ expiresAt: new Date(Date.now() - 1000) })],
        ["consumed", challenge({ consumedAt: new Date() })],
        ["wrong network", challenge({ network: "BASE" })],
        ["exhausted", challenge({ attempts: 5 })],
        ["missing", null],
      ] as const) {
        walletNonce.findFirst.mockResolvedValue(stored);
        wallet.create.mockClear();

        const res = await app.inject({
          method: "POST",
          url: "/me/wallets",
          headers: AUTH,
          payload: {
            label: "Treasury",
            address: signer.address,
            network: "BASE_SEPOLIA",
            nonce: row.nonce,
            signature,
          },
        });

        expect(res.statusCode, name).toBe(400);
        expect(wallet.create, name).not.toHaveBeenCalled();
      }
      await app.close();
    });

    it("scopes the nonce lookup to the caller, so one account cannot spend another's", async () => {
      walletNonce.findFirst.mockResolvedValue(null);
      const app = await initApp([{ plugin: walletRoutes }]);

      await app.inject({
        method: "POST",
        url: "/me/wallets",
        headers: AUTH,
        payload: {
          label: "Treasury",
          address: signer.address,
          network: "BASE_SEPOLIA",
          nonce: "someone-elses",
          signature: "0xdeadbeef",
        },
      });

      expect(walletNonce.findFirst.mock.calls[0][0].where).toEqual({
        nonce: "someone-elses",
        userId: USER_ID,
      });
      await app.close();
    });

    it("rejects a signature from a different key and names the contract-wallet gap", async () => {
      const row = challenge();
      walletNonce.findFirst.mockResolvedValue(row);

      const other = privateKeyToAccount(
        "0x0000000000000000000000000000000000000000000000000000000000000abc",
      );
      const app = await initApp([{ plugin: walletRoutes }]);

      const res = await app.inject({
        method: "POST",
        url: "/me/wallets",
        headers: AUTH,
        payload: {
          label: "Treasury",
          address: signer.address,
          network: "BASE_SEPOLIA",
          nonce: row.nonce,
          signature: await other.signMessage({ message: "something else" }),
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("invalid_signature");
      expect(res.json().message).toContain("Smart contract wallets");
      expect(walletNonce.update).toHaveBeenCalled();
      expect(wallet.create).not.toHaveBeenCalled();
      await app.close();
    });

    it("does not 500 on a malformed signature", async () => {
      const row = challenge();
      walletNonce.findFirst.mockResolvedValue(row);
      const app = await initApp([{ plugin: walletRoutes }]);

      const res = await app.inject({
        method: "POST",
        url: "/me/wallets",
        headers: AUTH,
        payload: {
          label: "Treasury",
          address: signer.address,
          network: "BASE_SEPOLIA",
          nonce: row.nonce,
          signature: "0xabcd",
        },
      });

      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("rejects an address whose EIP-55 checksum is wrong", async () => {
      const app = await initApp([{ plugin: walletRoutes }]);

      const broken = `0xAbC${signer.address.slice(5)}`;
      const res = await app.inject({
        method: "POST",
        url: "/me/wallets/siwe-nonce",
        headers: AUTH,
        payload: { address: broken, network: "BASE_SEPOLIA" },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().issues[0].path).toBe("address");
      expect(walletNonce.create).not.toHaveBeenCalled();
      await app.close();
    });
  });

  describe("listing", () => {
    it("escapes LIKE wildcards so `%` cannot match every row", async () => {
      const app = await initApp([{ plugin: walletRoutes }]);
      await app.inject({
        method: "GET",
        url: "/me/wallets?q=%25",
        headers: AUTH,
      });

      const where = wallet.findMany.mock.calls[0][0].where;
      expect(where.OR[0].label.contains).toBe("\\%");
      await app.close();
    });

    it("orders by a tiebroken key so a row cannot straddle two pages", async () => {
      const app = await initApp([{ plugin: walletRoutes }]);
      await app.inject({ method: "GET", url: "/me/wallets", headers: AUTH });

      expect(wallet.findMany.mock.calls[0][0].orderBy).toEqual([
        { createdAt: "desc" },
        { id: "desc" },
      ]);
      await app.close();
    });

    it("rejects an oversized limit and an unreachable page", async () => {
      const app = await initApp([{ plugin: walletRoutes }]);

      for (const url of [
        "/me/wallets?limit=1000",
        "/me/wallets?page=1000000",
      ]) {
        const res = await app.inject({ method: "GET", url, headers: AUTH });
        expect(res.statusCode, url).toBe(400);
      }

      expect(wallet.findMany).not.toHaveBeenCalled();
      await app.close();
    });

    it("returns the paging envelope", async () => {
      const app = await initApp([{ plugin: walletRoutes }]);
      const res = await app.inject({
        method: "GET",
        url: "/me/wallets?limit=5&page=1",
        headers: AUTH,
      });

      expect(res.json()).toMatchObject({ total: 1, page: 1, limit: 5 });
      expect(res.json().items).toHaveLength(1);
      await app.close();
    });
  });

  describe("updating", () => {
    it("refuses to bring a retired wallet back without fresh proof", async () => {
      wallet.findFirst.mockResolvedValue({
        ...STORED_WALLET,
        status: "RETIRED",
      });
      const app = await initApp([{ plugin: walletRoutes }]);

      const res = await app.inject({
        method: "PATCH",
        url: `/me/wallets/${WALLET_ID}`,
        headers: AUTH,
        payload: { status: "ACTIVE" },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("invalid_transition");
      await app.close();
    });

    it("allows pausing and resuming", async () => {
      const app = await initApp([{ plugin: walletRoutes }]);
      const res = await app.inject({
        method: "PATCH",
        url: `/me/wallets/${WALLET_ID}`,
        headers: AUTH,
        payload: { status: "PAUSED" },
      });

      expect(res.statusCode).toBe(200);
      await app.close();
    });

    it("clears the old default before setting the new one", async () => {
      const app = await initApp([{ plugin: walletRoutes }]);
      await app.inject({
        method: "PATCH",
        url: `/me/wallets/${WALLET_ID}`,
        headers: AUTH,
        payload: { isDefault: true },
      });

      expect(wallet.updateMany.mock.calls[0][0]).toMatchObject({
        where: { ownerId: USER_ID, network: "BASE_SEPOLIA", isDefault: true },
        data: { isDefault: false },
      });
      await app.close();
    });

    it("refuses to make a non-active wallet the default", async () => {
      wallet.findFirst.mockResolvedValue({
        ...STORED_WALLET,
        status: "PAUSED",
      });
      const app = await initApp([{ plugin: walletRoutes }]);

      const res = await app.inject({
        method: "PATCH",
        url: `/me/wallets/${WALLET_ID}`,
        headers: AUTH,
        payload: { isDefault: true },
      });

      expect(res.statusCode).toBe(409);
      await app.close();
    });

    it("cannot reach address, network or the verification fields", async () => {
      const app = await initApp([{ plugin: walletRoutes }]);
      await app.inject({
        method: "PATCH",
        url: `/me/wallets/${WALLET_ID}`,
        headers: AUTH,
        payload: {
          label: "Renamed",
          address: "0x0000000000000000000000000000000000000001",
          network: "BASE",
          ownerId: OTHER_ID,
          verifiedAt: new Date().toISOString(),
          verificationMethod: "ERC1271",
        },
      });

      expect(wallet.update.mock.calls[0][0].data).toEqual({ label: "Renamed" });
      await app.close();
    });
  });

  describe("batch delete", () => {
    it("deletes only the caller's wallets and reports the rest as notFound", async () => {
      wallet.findMany.mockResolvedValue([{ id: WALLET_ID }]);
      const app = await initApp([{ plugin: walletRoutes }]);

      const res = await app.inject({
        method: "POST",
        url: "/me/wallets/batch-delete",
        headers: AUTH,
        payload: { ids: [WALLET_ID, OTHER_ID] },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        deleted: [WALLET_ID],
        notFound: [OTHER_ID],
      });
      expect(wallet.deleteMany.mock.calls[0][0].where).toEqual({
        id: { in: [WALLET_ID] },
        ownerId: USER_ID,
      });
      await app.close();
    });

    it("rejects a non-uuid id with 400 rather than letting Prisma 500", async () => {
      const app = await initApp([{ plugin: walletRoutes }]);
      const res = await app.inject({
        method: "POST",
        url: "/me/wallets/batch-delete",
        headers: AUTH,
        payload: { ids: ["not-a-uuid"] },
      });

      expect(res.statusCode).toBe(400);
      expect(wallet.deleteMany).not.toHaveBeenCalled();
      await app.close();
    });

    it("caps the batch at 100 ids", async () => {
      const app = await initApp([{ plugin: walletRoutes }]);
      const ids = Array.from(
        { length: 101 },
        (_, i) => `019fce62-1111-7000-8000-${String(i).padStart(12, "0")}`,
      );

      const res = await app.inject({
        method: "POST",
        url: "/me/wallets/batch-delete",
        headers: AUTH,
        payload: { ids },
      });

      expect(res.statusCode).toBe(400);
      expect(wallet.deleteMany).not.toHaveBeenCalled();
      await app.close();
    });

    it("requires at least one id", async () => {
      const app = await initApp([{ plugin: walletRoutes }]);
      const res = await app.inject({
        method: "POST",
        url: "/me/wallets/batch-delete",
        headers: AUTH,
        payload: { ids: [] },
      });

      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });
});
