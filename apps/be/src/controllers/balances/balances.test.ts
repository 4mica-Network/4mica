import { clearUserCache } from "@auth/user-store";
import { balanceRoutes } from "@routes/balances";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "@/server";

const {
  authenticateRequest,
  getUser,
  upsert,
  wallet,
  getCoreClient,
  getSupportedTokens,
  getUserAssetBalance,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  getUser: vi.fn(),
  upsert: vi.fn(),
  wallet: { findMany: vi.fn() },
  getCoreClient: vi.fn(),
  getSupportedTokens: vi.fn(),
  getUserAssetBalance: vi.fn(),
}));

vi.mock("@services/core", () => ({
  getCoreClient,
  closeCoreClient: vi.fn(async () => {}),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: vi.fn(() => ({ authenticateRequest, users: { getUser } })),
}));

vi.mock("@4mica/db", () => ({
  prisma: {
    wallet,
    user: { findUnique: vi.fn(), upsert, update: vi.fn() },
    business: { findUnique: vi.fn(), upsert: vi.fn() },
  },
  disconnect: vi.fn(async () => {}),
}));

const USER_ID = "019fce62-0000-7000-8000-000000000000";
const WALLET_ADDRESS = "0x6c5cc69e4c4863dbc3439ab2673806ea7715ebd5";
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const NATIVE = "0x0000000000000000000000000000000000000000";

const AUTH = { authorization: "Bearer good" };

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

const coreOn = (chainId: number) => ({
  publicParams: { chainId },
  rpc: { getSupportedTokens, getUserAssetBalance },
});

const app = () => initApp([{ plugin: balanceRoutes }]);

const read = async () => {
  const instance = await app();
  const res = await instance.inject({
    method: "GET",
    url: "/me/balances",
    headers: AUTH,
  });
  await instance.close();
  return res;
};

describe("balance routes", () => {
  beforeEach(() => {
    for (const fn of [
      authenticateRequest,
      upsert,
      wallet.findMany,
      getCoreClient,
      getSupportedTokens,
      getUserAssetBalance,
    ]) {
      fn.mockReset();
    }
    clearUserCache();

    authenticateRequest.mockResolvedValue(signedIn());
    upsert.mockResolvedValue({
      id: USER_ID,
      clerkUserId: "user_123",
      banned: false,
      locked: false,
      deletedAt: null,
    });

    getCoreClient.mockResolvedValue(coreOn(84532));
    getSupportedTokens.mockResolvedValue({
      chainId: 84532,
      tokens: [{ symbol: "USDC", address: USDC, decimals: 6 }],
    });
    wallet.findMany.mockResolvedValue([
      {
        id: "wallet_1",
        label: "Treasury",
        address: WALLET_ADDRESS,
        role: "BOTH",
      },
    ]);
    getUserAssetBalance.mockImplementation(async (_user, asset: string) =>
      asset === NATIVE
        ? { total: 5_000n, locked: 1_200n, updatedAt: 1_760_000_000 }
        : null,
    );
  });

  it("reads every wallet on core's chain for every asset core accepts", async () => {
    const res = await read();

    expect(res.statusCode).toBe(200);
    expect(wallet.findMany.mock.calls[0][0].where).toEqual({
      ownerId: USER_ID,
      network: "BASE_SEPOLIA",
      status: "ACTIVE",
    });
    expect(getUserAssetBalance.mock.calls).toEqual([
      [WALLET_ADDRESS, NATIVE],
      [WALLET_ADDRESS, USDC.toLowerCase()],
    ]);

    expect(res.json()).toEqual({
      network: "BASE_SEPOLIA",
      wallets: [
        {
          id: "wallet_1",
          label: "Treasury",
          address: WALLET_ADDRESS,
          role: "BOTH",
          assets: [
            {
              assetAddress: NATIVE,
              symbol: "ETH",
              decimals: 18,
              total: "5000",
              locked: "1200",
              available: "3800",
              updatedAt: "2025-10-09T08:53:20.000Z",
            },
            {
              assetAddress: USDC.toLowerCase(),
              symbol: "USDC",
              decimals: 6,
              total: "0",
              locked: "0",
              available: "0",
              updatedAt: null,
            },
          ],
        },
      ],
    });
  });

  it("returns no wallets when core runs on a chain 4mica does not list", async () => {
    getCoreClient.mockResolvedValue(coreOn(31337));

    const res = await read();

    expect(res.json()).toEqual({ network: null, wallets: [] });
    expect(wallet.findMany).not.toHaveBeenCalled();
  });

  it("answers 503 when core is not configured", async () => {
    getCoreClient.mockResolvedValue(null);

    const res = await read();

    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe("core_unavailable");
  });

  it("answers 503 when core fails mid-read", async () => {
    getUserAssetBalance.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await read();

    expect(res.statusCode).toBe(503);
  });

  it("requires authentication", async () => {
    authenticateRequest.mockResolvedValue({
      isAuthenticated: false,
      status: "signed-out",
      reason: "session-token-missing",
      toAuth: () => ({ tokenType: null, userId: null }),
    });

    const res = await read();

    expect(res.statusCode).toBe(401);
    expect(getCoreClient).not.toHaveBeenCalled();
  });
});
