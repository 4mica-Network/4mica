import { describe, expect, it, vi } from "vitest";
import type { Client } from "@/client";
import { Route, TokenRoute } from "@/client/model";
import {
  ClaimExceedsFundedLiquidityError,
  Erc20AllowanceRequiredError,
  GasRequiredError,
  PaymentWindowElapsedError,
  TransactionOutcomeUnknownError,
} from "@/errors";
import { openPositions, settleAll } from "@/facade/settle";
import { ClearingPosition } from "@/models";
import {
  fakeClient,
  fakeGateway,
  fakeSession,
  TX_HASH,
  USDC,
  USDT,
} from "./helpers/facade";

const DELISTED = "0x00000000000000000000000000000000000000dE";

/** A position as core lists it. */
function position(
  role: "NET_DEBTOR" | "NET_CREDITOR",
  overrides: Partial<{
    cycle: string;
    asset: string;
    amount: bigint;
    confirmed: boolean;
  }> = {},
): ClearingPosition {
  const asset = overrides.asset ?? USDC;
  return new ClearingPosition(
    `0x${"ab".repeat(32)}`,
    overrides.cycle ?? `${asset.toLowerCase()}:100`,
    asset,
    role,
    overrides.amount ?? 2_500_000n,
    4_000_000n,
    1_500_000n,
    1_767_312_000,
    1_767_398_400,
    overrides.confirmed ?? true,
  );
}

/** A session whose settlement client lists `positions` and settles them. */
function settling(positions: ClearingPosition[], gateway = fakeGateway()) {
  const fake = fakeClient({ gateway });
  const pay = vi.fn(async (_cycle: string) => ({
    txHash: TX_HASH,
    route: TokenRoute.Eip3009,
    account: "0xWallet",
  }));
  // The wallet's own transaction, pinned: what a payment falls back to.
  const approve = vi.fn(async (_cycle: string) => undefined);
  const payOwn = vi.fn(async (_cycle: string) => ({
    txHash: TX_HASH,
    route: TokenRoute.SelfFunded,
    account: "0xWallet",
  }));
  const claim = vi.fn(async (_cycle: string) => ({
    txHash: TX_HASH,
    route: Route.Gasless,
    account: "0xWallet",
  }));
  const settlement = {
    positions: vi.fn(async () => positions),
    pay: vi.fn((cycle: string) => ({
      send: () => pay(cycle),
      selfFunded: () => ({
        approve: () => approve(cycle),
        send: () => payOwn(cycle),
      }),
    })),
    claim: vi.fn((cycle: string) => ({ send: () => claim(cycle) })),
  };
  const client = { ...fake.client, settlement } as unknown as Client;
  return {
    session: fakeSession({ ...fake, asClient: client }),
    settlement,
    pay,
    approve,
    payOwn,
    claim,
  };
}

const allowanceRequired = () =>
  new Erc20AllowanceRequiredError({
    token: USDC,
    spender: "0xClearingHouse",
    allowance: 0n,
    needed: 2_500_000n,
  });

describe("FourMica positions", () => {
  it("reports each position in the asset's own units, with its deadlines", async () => {
    const { session } = settling([position("NET_DEBTOR")]);
    expect(await openPositions(session)).toEqual([
      {
        cycle: `${USDC.toLowerCase()}:100`,
        cycleId: `0x${"ab".repeat(32)}`,
        asset: { symbol: "USDC", address: USDC, decimals: 6 },
        role: "debtor",
        amount: "2.5",
        grossOutgoing: "4",
        grossIncoming: "1.5",
        raw: {
          amount: 2_500_000n,
          grossOutgoing: 4_000_000n,
          grossIncoming: 1_500_000n,
        },
        payBy: new Date(1_767_312_000_000),
        finalAt: new Date(1_767_398_400_000),
        commitConfirmed: true,
        network: "eip155:84532",
      },
    ]);
  });

  it("still reports a position in a token core no longer lists, in base units", async () => {
    const { session } = settling([
      position("NET_CREDITOR", { asset: DELISTED, amount: 7n }),
    ]);
    const [credit] = await openPositions(session);
    expect(credit).toMatchObject({
      role: "creditor",
      amount: "7",
      asset: { address: DELISTED, decimals: 0 },
    });
  });
});

describe("FourMica settle", () => {
  it("pays what is owed and claims what is owed to the wallet", async () => {
    const { session, settlement } = settling([
      position("NET_DEBTOR", { cycle: "usdc:100" }),
      position("NET_CREDITOR", { cycle: "usdt:100", asset: USDT }),
    ]);
    const results = await settleAll(session, {});

    expect(settlement.pay).toHaveBeenCalledWith("usdc:100");
    expect(settlement.claim).toHaveBeenCalledWith("usdt:100");
    expect(results).toMatchObject([
      {
        action: "pay",
        status: "settled",
        txHash: TX_HASH,
        route: TokenRoute.Eip3009,
        explorerUrl: `https://sepolia.basescan.org/tx/${TX_HASH}`,
        position: { cycle: "usdc:100", role: "debtor" },
      },
      {
        action: "claim",
        status: "settled",
        txHash: TX_HASH,
        route: Route.Gasless,
        position: { cycle: "usdt:100", role: "creditor" },
      },
    ]);
  });

  it("does nothing, and says so, when nothing is open", async () => {
    const { session, settlement } = settling([]);
    expect(await settleAll(session, {})).toEqual([]);
    expect(settlement.pay).not.toHaveBeenCalled();
    expect(settlement.claim).not.toHaveBeenCalled();
  });

  it("goes on to the next position when one fails", async () => {
    const { session, pay, claim } = settling([
      position("NET_DEBTOR", { cycle: "a" }),
      position("NET_DEBTOR", { cycle: "b" }),
      position("NET_CREDITOR", { cycle: "c" }),
    ]);
    const refused = new PaymentWindowElapsedError(1_767_312_000n);
    pay.mockRejectedValueOnce(refused);
    claim.mockRejectedValueOnce(
      new ClaimExceedsFundedLiquidityError(1n, 2_500_000n),
    );

    const results = await settleAll(session, {});
    expect(results.map((r) => [r.position.cycle, r.status])).toEqual([
      ["a", "failed"],
      ["b", "settled"],
      ["c", "failed"],
    ]);
    // The error is the typed one, to branch on.
    expect(results[0].error).toBe(refused);
    expect(results[0].txHash).toBeUndefined();
    expect(results[2].error).toBeInstanceOf(ClaimExceedsFundedLiquidityError);
  });

  it("approves the debit and pays again when the wallet's own payment lacks the allowance", async () => {
    const { session, pay, approve, payOwn } = settling([
      position("NET_DEBTOR", { cycle: "a" }),
    ]);
    const order: string[] = [];
    pay.mockRejectedValueOnce(allowanceRequired());
    approve.mockImplementation(async () => {
      order.push("approve");
      return undefined;
    });
    payOwn.mockImplementation(async () => {
      order.push("pay");
      return {
        txHash: TX_HASH,
        route: TokenRoute.SelfFunded,
        account: "0xWallet",
      };
    });

    const results = await settleAll(session, {});
    expect(order).toEqual(["approve", "pay"]);
    expect(approve).toHaveBeenCalledWith("a");
    expect(results).toMatchObject([
      { status: "settled", txHash: TX_HASH, route: TokenRoute.SelfFunded },
    ]);
  });

  it("does not approve for a payment that went through", async () => {
    const { session, approve, payOwn } = settling([
      position("NET_DEBTOR", { cycle: "a" }),
    ]);
    await settleAll(session, {});
    expect(approve).not.toHaveBeenCalled();
    expect(payOwn).not.toHaveBeenCalled();
  });

  it("says the wallet needs gas instead of sending an approval it cannot pay for", async () => {
    const { session, pay, approve } = settling(
      [position("NET_DEBTOR", { cycle: "a" })],
      fakeGateway({ nativeBalance: vi.fn(async () => 0n) }),
    );
    pay.mockRejectedValueOnce(allowanceRequired());
    const [result] = await settleAll(session, {});
    expect(result.status).toBe("failed");
    expect(result.error).toBeInstanceOf(GasRequiredError);
    expect(result.error?.message).toContain("2.5 USDC");
    expect(approve).not.toHaveBeenCalled();
  });

  it("does not pay on top of an approval whose outcome is unknown", async () => {
    const { session, pay, approve, payOwn } = settling([
      position("NET_DEBTOR", { cycle: "a" }),
    ]);
    pay.mockRejectedValueOnce(allowanceRequired());
    approve.mockRejectedValueOnce(
      new TransactionOutcomeUnknownError("approve: no answer", {
        stage: "broadcast",
      }),
    );
    const [result] = await settleAll(session, {});
    expect(result.status).toBe("unknown");
    expect(payOwn).not.toHaveBeenCalled();
  });

  it("marks a payment nobody answered as unknown, not failed", async () => {
    const { session, pay } = settling([
      position("NET_DEBTOR", { cycle: "a" }),
      position("NET_DEBTOR", { cycle: "b" }),
    ]);
    pay.mockRejectedValueOnce(
      new TransactionOutcomeUnknownError("payNetDebit: no answer", {
        stage: "broadcast",
      }),
    );
    const results = await settleAll(session, {});
    expect(results.map((r) => r.status)).toEqual(["unknown", "settled"]);
    expect(results[0].error).toBeInstanceOf(TransactionOutcomeUnknownError);
  });

  it("leaves a position alone until its cycle's commit is on-chain", async () => {
    const { session, settlement } = settling([
      position("NET_DEBTOR", { cycle: "early", confirmed: false }),
      position("NET_DEBTOR", { cycle: "ready" }),
    ]);
    const results = await settleAll(session, {});
    expect(results).toMatchObject([
      { status: "skipped", position: { cycle: "early" } },
      { status: "settled", position: { cycle: "ready" } },
    ]);
    expect(results[0].reason).toMatch(/not confirmed on-chain yet/);
    expect(settlement.pay).toHaveBeenCalledTimes(1);
    expect(settlement.pay).toHaveBeenCalledWith("ready");
  });

  it("settles one side only when asked", async () => {
    const both = [
      position("NET_DEBTOR", { cycle: "owed" }),
      position("NET_CREDITOR", { cycle: "due" }),
    ];
    const paying = settling(both);
    const paid = await settleAll(paying.session, { only: "pay" });
    expect(paid.map((r) => r.position.cycle)).toEqual(["owed"]);
    expect(paying.settlement.claim).not.toHaveBeenCalled();

    const claiming = settling(both);
    const claimed = await settleAll(claiming.session, { only: "claim" });
    expect(claimed.map((r) => r.position.cycle)).toEqual(["due"]);
    expect(claiming.settlement.pay).not.toHaveBeenCalled();
  });

  it("settles in the order core lists them: soonest deadline first", async () => {
    const order: string[] = [];
    const { session, pay, claim } = settling([
      position("NET_CREDITOR", { cycle: "first" }),
      position("NET_DEBTOR", { cycle: "second" }),
    ]);
    claim.mockImplementation(async (cycle) => {
      order.push(cycle);
      return { txHash: TX_HASH, route: Route.Gasless, account: "0xWallet" };
    });
    pay.mockImplementation(async (cycle) => {
      order.push(cycle);
      return {
        txHash: TX_HASH,
        route: TokenRoute.Eip3009,
        account: "0xWallet",
      };
    });
    await settleAll(session, {});
    expect(order).toEqual(["first", "second"]);
  });
});
