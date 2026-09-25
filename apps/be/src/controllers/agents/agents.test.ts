import { clearUserCache } from "@auth/user-store";
import { agentRoutes } from "@routes/agents";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";

const { authenticateRequest, getUser, findUnique, upsert, agent, wallet } =
  vi.hoisted(() => ({
    authenticateRequest: vi.fn(),
    getUser: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
    agent: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    wallet: { findFirst: vi.fn() },
  }));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({ authenticateRequest, users: { getUser } })),
}));

vi.mock("@4mica/db", () => ({
  prisma: {
    agent,
    user: { findUnique, upsert, update: vi.fn() },
    business: { findUnique: vi.fn(), upsert: vi.fn() },
    wallet,
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: unknown) => unknown)({ agent, wallet })
        : Promise.all(arg as Promise<unknown>[]),
    ),
  },
  disconnect: vi.fn(async () => {}),
}));

const USER_ID = "019fce62-0000-7000-8000-000000000000";
const AGENT_ID = "019fce62-4444-7000-8000-000000000000";
const PAYER_WALLET_ID = "019fce62-1111-7000-8000-000000000000";
const SELLER_WALLET_ID = "019fce62-1111-7000-8000-000000000001";

const PAYER_ADDRESS = "0x7a9f3c4b2e8d5a1f6c0b4e9d2a8c3f5b7e1d6a04";
const SELLER_ADDRESS = "0x3d8e1f5a7c9b2d4e6a8c0f2b4d6e8a1c3f5b7d09";

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

const payerWallet = (over: Record<string, unknown> = {}) => ({
  id: PAYER_WALLET_ID,
  address: PAYER_ADDRESS,
  network: "BASE_SEPOLIA",
  role: "PAYER",
  status: "ACTIVE",
  ...over,
});

const sellerWallet = (over: Record<string, unknown> = {}) => ({
  id: SELLER_WALLET_ID,
  address: SELLER_ADDRESS,
  network: "BASE_SEPOLIA",
  role: "RECIPIENT",
  status: "ACTIVE",
  ...over,
});

const walletsById = (
  rows: Record<string, ReturnType<typeof payerWallet> | null>,
) => {
  wallet.findFirst.mockImplementation(
    async ({ where }: { where: { id: string } }) => rows[where.id] ?? null,
  );
};

const storedAgent = (over: Record<string, unknown> = {}) => ({
  id: AGENT_ID,
  slug: "atlas-research",
  name: "Atlas Research Agent",
  headline: null,
  description: null,
  avatarUrl: null,
  docsUrl: null,
  status: "PENDING",
  visibility: "PRIVATE",
  network: "BASE_SEPOLIA",
  walletAddress: PAYER_ADDRESS,
  payerWalletId: PAYER_WALLET_ID,
  creditLimit: { toString: () => "0" },
  walletId: SELLER_WALLET_ID,
  payToAddress: SELLER_ADDRESS,
  assetAddress: null,
  priceAmount: null,
  priceCurrency: null,
  priceLabel: null,
  endpointUrl: null,
  x402Endpoint: null,
  publishedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

const app = () => initApp([{ plugin: agentRoutes }]);

describe("agent routes", () => {
  beforeEach(() => {
    for (const m of [authenticateRequest, getUser, findUnique, upsert]) {
      m.mockReset();
    }
    for (const group of [agent, wallet]) {
      for (const fn of Object.values(group)) {
        fn.mockReset();
      }
    }
    clearUserCache();

    authenticateRequest.mockResolvedValue(signedIn());
    upsert.mockResolvedValue(AUTH_USER);

    walletsById({
      [PAYER_WALLET_ID]: payerWallet(),
      [SELLER_WALLET_ID]: sellerWallet(),
    });

    agent.findMany.mockResolvedValue([storedAgent()]);
    agent.count.mockResolvedValue(1);
    agent.findFirst.mockResolvedValue(storedAgent());
    agent.create.mockResolvedValue(storedAgent());
    agent.update.mockResolvedValue(storedAgent());
    agent.updateMany.mockResolvedValue({ count: 1 });
  });

  it("requires authentication on every agent route", async () => {
    authenticateRequest.mockResolvedValue(signedOut());
    const instance = await app();

    for (const [method, url] of [
      ["GET", "/me/agents"],
      ["GET", `/me/agents/${AGENT_ID}`],
      ["POST", "/me/agents"],
      ["PATCH", `/me/agents/${AGENT_ID}`],
      ["POST", `/me/agents/${AGENT_ID}/publish`],
      ["POST", `/me/agents/${AGENT_ID}/unpublish`],
      ["DELETE", `/me/agents/${AGENT_ID}`],
      ["POST", "/me/agents/batch-delete"],
    ] as const) {
      const res = await instance.inject({ method, url, payload: {} });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }

    await instance.close();
  });

  describe("the two wallet halves", () => {
    it("derives both addresses from their wallet ids", async () => {
      agent.findMany.mockResolvedValue([]);
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/agents",
        headers: AUTH,
        payload: {
          name: "Atlas",
          network: "BASE_SEPOLIA",
          payerWalletId: PAYER_WALLET_ID,
          walletId: SELLER_WALLET_ID,
        },
      });

      expect(res.statusCode).toBe(201);
      const written = agent.create.mock.calls[0][0].data;
      expect(written.walletAddress).toBe(PAYER_ADDRESS);
      expect(written.payToAddress).toBe(SELLER_ADDRESS);

      await instance.close();
    });

    it("ignores walletAddress and payToAddress sent in the body", async () => {
      agent.findMany.mockResolvedValue([]);
      const instance = await app();

      await instance.inject({
        method: "POST",
        url: "/me/agents",
        headers: AUTH,
        payload: {
          name: "Atlas",
          network: "BASE_SEPOLIA",
          payerWalletId: PAYER_WALLET_ID,
          walletAddress: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
          payToAddress: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        },
      });

      const written = agent.create.mock.calls[0][0].data;
      expect(written.walletAddress).toBe(PAYER_ADDRESS);
      expect(written.payToAddress).toBeNull();

      await instance.close();
    });

    it("defaults to ETHEREUM_SEPOLIA, and holds wallets to it", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/agents",
        headers: AUTH,
        payload: { name: "Atlas", payerWalletId: PAYER_WALLET_ID },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("network_mismatch");
      expect(res.json().message).toContain("ETHEREUM_SEPOLIA");

      await instance.close();
    });

    it("rejects a payer wallet that can only receive", async () => {
      walletsById({ [PAYER_WALLET_ID]: payerWallet({ role: "RECIPIENT" }) });
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/agents",
        headers: AUTH,
        payload: {
          name: "Atlas",
          network: "BASE_SEPOLIA",
          payerWalletId: PAYER_WALLET_ID,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("wallet_not_recipient");
      expect(res.json().issues[0].path).toBe("payerWalletId");

      await instance.close();
    });

    it("rejects a recipient wallet on a different chain from the agent", async () => {
      walletsById({
        [SELLER_WALLET_ID]: sellerWallet({ network: "BASE" }),
      });
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/agents",
        headers: AUTH,
        payload: {
          name: "Atlas",
          network: "BASE_SEPOLIA",
          walletId: SELLER_WALLET_ID,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("network_mismatch");

      await instance.close();
    });

    it("clears the derived address when a wallet is unlinked", async () => {
      const instance = await app();

      await instance.inject({
        method: "PATCH",
        url: `/me/agents/${AGENT_ID}`,
        headers: AUTH,
        payload: { walletId: null, payerWalletId: null },
      });

      const written = agent.updateMany.mock.calls[0][0].data;
      expect(written.walletId).toBeNull();
      expect(written.payToAddress).toBeNull();
      expect(written.payerWalletId).toBeNull();
      expect(written.walletAddress).toBeNull();

      await instance.close();
    });
  });

  describe("network is locked once a wallet is attached", () => {
    it("refuses to move a wired-up agent to another chain", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "PATCH",
        url: `/me/agents/${AGENT_ID}`,
        headers: AUTH,
        payload: { network: "BASE" },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("network_locked");
      expect(res.json().issues[0].path).toBe("network");

      await instance.close();
    });

    it("allows the move while no wallet is linked", async () => {
      agent.findFirst.mockResolvedValue(
        storedAgent({
          walletId: null,
          payToAddress: null,
          payerWalletId: null,
          walletAddress: null,
        }),
      );
      const instance = await app();

      const res = await instance.inject({
        method: "PATCH",
        url: `/me/agents/${AGENT_ID}`,
        headers: AUTH,
        payload: { network: "BASE" },
      });

      expect(res.statusCode).toBe(200);
      expect(agent.updateMany.mock.calls[0][0].data.network).toBe("BASE");

      await instance.close();
    });

    it("allows the move when the same request unlinks both wallets", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "PATCH",
        url: `/me/agents/${AGENT_ID}`,
        headers: AUTH,
        payload: { network: "BASE", walletId: null, payerWalletId: null },
      });

      expect(res.statusCode).toBe(200);

      await instance.close();
    });
  });

  describe("status", () => {
    it("never accepts SUSPENDED from a client", async () => {
      const instance = await app();

      const create = await instance.inject({
        method: "POST",
        url: "/me/agents",
        headers: AUTH,
        payload: { name: "Atlas", status: "SUSPENDED" },
      });
      expect(create.statusCode).toBe(400);

      const update = await instance.inject({
        method: "PATCH",
        url: `/me/agents/${AGENT_ID}`,
        headers: AUTH,
        payload: { status: "SUSPENDED" },
      });
      expect(update.statusCode).toBe(400);

      await instance.close();
    });

    it("accepts PENDING and ACTIVE", async () => {
      agent.findMany.mockResolvedValue([]);
      const instance = await app();

      for (const status of ["PENDING", "ACTIVE"]) {
        const res = await instance.inject({
          method: "PATCH",
          url: `/me/agents/${AGENT_ID}`,
          headers: AUTH,
          payload: { status },
        });
        expect(res.statusCode, status).toBe(200);
      }

      await instance.close();
    });
  });

  describe("publish", () => {
    it("refuses to publish an agent with no receiving wallet", async () => {
      agent.findFirst.mockResolvedValue(
        storedAgent({ walletId: null, payToAddress: null }),
      );
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: `/me/agents/${AGENT_ID}/publish`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("agent_not_payable");

      await instance.close();
    });

    it("keeps the original publishedAt when re-publishing", async () => {
      const first = new Date("2026-01-01T00:00:00.000Z");
      agent.findFirst.mockResolvedValue(storedAgent({ publishedAt: first }));
      const instance = await app();

      await instance.inject({
        method: "POST",
        url: `/me/agents/${AGENT_ID}/publish`,
        headers: AUTH,
      });

      expect(agent.updateMany.mock.calls[0][0].data.publishedAt).toBe(first);

      await instance.close();
    });
  });

  describe("payer address uniqueness", () => {
    it("reports a collision against the payer wallet, not the slug", async () => {
      agent.findMany.mockResolvedValue([]);
      agent.create.mockRejectedValue(
        Object.assign(new Error("unique"), {
          code: "P2002",
          meta: { target: ["wallet_address", "network"] },
        }),
      );
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/agents",
        headers: AUTH,
        payload: {
          name: "Atlas",
          network: "BASE_SEPOLIA",
          payerWalletId: PAYER_WALLET_ID,
        },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("agent_wallet_in_use");
      expect(res.json().issues[0].path).toBe("payerWalletId");

      await instance.close();
    });

    it("reports a slug collision as slug_taken", async () => {
      agent.findMany.mockResolvedValue([]);
      agent.create.mockRejectedValue(
        Object.assign(new Error("unique"), {
          code: "P2002",
          meta: { target: ["owner_id", "slug"] },
        }),
      );
      const instance = await app();

      const res = await instance.inject({
        method: "POST",
        url: "/me/agents",
        headers: AUTH,
        payload: { name: "Atlas" },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe("slug_taken");

      await instance.close();
    });
  });

  describe("soft delete", () => {
    it("releases both the slug and the payer address", async () => {
      const instance = await app();

      const res = await instance.inject({
        method: "DELETE",
        url: `/me/agents/${AGENT_ID}`,
        headers: AUTH,
      });

      expect(res.statusCode).toBe(204);
      const written = agent.update.mock.calls[0][0].data;
      expect(written.deletedAt).toBeInstanceOf(Date);
      expect(written.slug).toContain("deleted");
      expect(written.walletAddress).toBeNull();

      await instance.close();
    });
  });

  it("never returns a Decimal for creditLimit", async () => {
    const instance = await app();

    const res = await instance.inject({
      method: "GET",
      url: "/me/agents",
      headers: AUTH,
    });

    expect(res.json().items[0].creditLimit).toBe("0");

    await instance.close();
  });

  it("scopes list, read and update to the owner", async () => {
    const instance = await app();

    await instance.inject({ method: "GET", url: "/me/agents", headers: AUTH });
    expect(agent.findMany.mock.calls[0][0].where).toMatchObject({
      ownerId: USER_ID,
      deletedAt: null,
    });

    await instance.inject({
      method: "GET",
      url: `/me/agents/${AGENT_ID}`,
      headers: AUTH,
    });
    expect(agent.findFirst.mock.calls[0][0].where).toMatchObject({
      id: AGENT_ID,
      ownerId: USER_ID,
      deletedAt: null,
    });

    await instance.close();
  });

  it("404s for an agent that is not the caller's", async () => {
    agent.findFirst.mockResolvedValue(null);
    const instance = await app();

    const res = await instance.inject({
      method: "GET",
      url: `/me/agents/${AGENT_ID}`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(404);

    await instance.close();
  });
});
