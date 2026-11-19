import { vi } from "vitest";
import type { TokenLike } from "@/amounts";
import type { Client } from "@/client";
import { type Asset, TokenRoute } from "@/client/model";
import { NetworkSession } from "@/facade/session";
import { PaymentRequest, PaymentRequestPayload } from "@/models";
import { NETWORKS } from "@/networks";
import { randomU256 } from "@/utils";

export const USER = "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A";
export const SELLER = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
export const USDC = "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f";
export const USDT = "0x0a215D8ba66387DCA84B284D18c3B4ec3de6E54a";
export const TX_HASH = `0x${"ab".repeat(32)}`;

export const TOKENS: TokenLike[] = [
  { symbol: "USDC", address: USDC, decimals: 6 },
  { symbol: "USDT", address: USDT, decimals: 6 },
];

export function fakeGateway(overrides: Record<string, unknown> = {}) {
  return {
    erc20Balance: vi.fn(async () => 100_000_000n),
    nativeBalance: vi.fn(async () => 10n ** 18n),
    getUserAssets: vi.fn(async () => [] as unknown[]),
    withdrawalGracePeriod: vi.fn(async () => 3600n),
    ...overrides,
  };
}

export function fakeBuilder(route = TokenRoute.Eip3009) {
  const receipt = { txHash: TX_HASH, route, account: USER, amount: 0n };
  const selfFunded = {
    approve: vi.fn(async () => undefined),
    send: vi.fn(async () => ({ ...receipt, route: TokenRoute.SelfFunded })),
  };
  return {
    send: vi.fn(async () => receipt),
    selfFunded: vi.fn(() => selfFunded),
    selfFundedBuilder: selfFunded,
  };
}

export function fakeClient(
  options: {
    chainId?: number;
    tokens?: TokenLike[];
    gateway?: ReturnType<typeof fakeGateway>;
    builder?: ReturnType<typeof fakeBuilder>;
    /** Successive core totals; the last one repeats. */
    totals?: bigint[];
  } = {},
) {
  const gateway = options.gateway ?? fakeGateway();
  const builder = options.builder ?? fakeBuilder();
  const totals = [...(options.totals ?? [0n])];
  const withdrawReceipt = { txHash: TX_HASH, route: 0, account: USER };
  const client = {
    signerAddress: USER,
    ctx: { chainId: options.chainId ?? 84532, gateway: async () => gateway },
    rpc: {
      getUserAssetBalance: vi.fn(async () => {
        const total = totals.length > 1 ? totals.shift() : totals[0];
        return total === undefined ? null : { total, locked: 0n };
      }),
    },
    tokens: {
      supported: vi.fn(async () => ({ tokens: options.tokens ?? TOKENS })),
    },
    deposit: { of: vi.fn(() => builder) },
    withdraw: {
      request: vi.fn(() => ({ send: vi.fn(async () => withdrawReceipt) })),
      cancel: vi.fn(() => ({ send: vi.fn(async () => withdrawReceipt) })),
      finalize: vi.fn(() => ({ send: vi.fn(async () => withdrawReceipt) })),
    },
    newPayment: vi.fn(async (recipient: string, amount: bigint, asset: Asset) =>
      PaymentRequestPayload.new({
        userAddress: USER,
        recipientAddress: recipient,
        cycleId: `0x${"11".repeat(32)}`,
        reqId: randomU256(),
        amount,
        timestamp: 1_700_000_000,
        erc20Token: asset.erc20Token,
      }),
    ),
    signPayment: vi.fn(
      async (payload: PaymentRequestPayload) =>
        new PaymentRequest(payload, `0x${"11".repeat(65)}`),
    ),
    aclose: vi.fn(async () => undefined),
  };
  return { client, gateway, builder, asClient: client as unknown as Client };
}

export function fakeSession(fake = fakeClient(), name = "base-sepolia") {
  const info = NETWORKS[name];
  return new NetworkSession(name, info.caip2, info, fake.asClient);
}
