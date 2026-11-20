import { describe, expect, it } from "vitest";
import {
  previewDeposit,
  previewPendingWithdrawal,
  previewWithdrawalRequest,
} from "./preview.js";
import { resolveSettings } from "./settings.js";

const settings = resolveSettings({ flags: {}, env: {}, config: {} });
const USDC = { symbol: "USDC", address: "0xToken", decimals: 6 };

type Client = Parameters<typeof previewDeposit>[1];

function client(wallet: { usdc: bigint; eth: bigint; gasless: boolean }) {
  return {
    address: "0xWallet",
    lowLevel: async () => ({
      tokens: { supported: async () => ({ tokens: [USDC] }) },
      deposit: { isGaslessAvailable: () => wallet.gasless },
      ctx: {
        gateway: async () => ({
          nativeBalance: async () => wallet.eth,
          erc20Balance: async () => wallet.usdc,
        }),
      },
    }),
  } as unknown as Client;
}

const five = { amount: "5", asset: "usdc" };

describe("previewDeposit", () => {
  it("is ready when the wallet holds enough and gas is sponsored", async () => {
    const preview = await previewDeposit(
      settings,
      client({ usdc: 5_000_000n, eth: 0n, gasless: true }),
      five,
      "auto",
    );
    expect(preview).toMatchObject({
      dryRun: true,
      action: "deposit 5 USDC",
      ready: true,
      problems: [],
      details: { token: "0xToken", "base units": "5000000" },
    });
  });

  it("names the shortfall", async () => {
    const preview = await previewDeposit(
      settings,
      client({ usdc: 1_500_000n, eth: 1n, gasless: true }),
      five,
      "auto",
    );
    expect(preview.ready).toBe(false);
    expect(preview.problems).toEqual([
      "the wallet holds 1.5 USDC; this needs 5",
    ]);
  });

  it("wants gas in the wallet when the wallet pays for the transaction", async () => {
    const funded = { usdc: 5_000_000n, eth: 0n };
    for (const [gasless, gas] of [
      [false, "auto"],
      [true, "self"],
    ] as const) {
      const preview = await previewDeposit(
        settings,
        client({ ...funded, gasless }),
        five,
        gas,
      );
      expect(preview.problems).toEqual([
        "the wallet pays for this transaction and holds no ETH",
      ]);
    }
  });

  it("refuses more decimals than the token has, as the real deposit does", async () => {
    await expect(
      previewDeposit(
        settings,
        client({ usdc: 9n, eth: 0n, gasless: true }),
        { amount: "0.0000001", asset: "USDC" },
        "auto",
      ),
    ).rejects.toThrow();
  });
});

describe("withdrawal previews", () => {
  const balance = {
    asset: USDC,
    available: "2",
    locked: "3",
    raw: { available: 2_000_000n },
  };
  const pending = {
    asset: USDC,
    amount: "2",
    requestedAt: new Date("2026-01-01T00:00:00Z"),
    readyAt: new Date("2026-01-23T00:00:00Z"),
    ready: false,
  };
  const withState = (withdrawals: unknown[]) =>
    ({
      address: "0xWallet",
      balance: async () => balance,
      withdrawals: async () => withdrawals,
    }) as unknown as Client;

  it("checks a request against available collateral, not the total", async () => {
    const preview = await previewWithdrawalRequest(
      settings,
      withState([]),
      five,
    );
    expect(preview.problems).toEqual([
      "only 2 USDC is available; this needs 5",
    ]);
  });

  it("says when a withdrawal can be finalized", async () => {
    const early = await previewPendingWithdrawal(
      settings,
      withState([pending]),
      "usdc",
      "finalize",
    );
    expect(early.problems).toEqual([
      "it can be finalized from 2026-01-23T00:00:00.000Z",
    ]);
    const cancel = await previewPendingWithdrawal(
      settings,
      withState([pending]),
      "USDC",
      "cancel",
    );
    expect(cancel.ready).toBe(true);
  });

  it("has nothing to finalize when nothing is pending", async () => {
    const preview = await previewPendingWithdrawal(
      settings,
      withState([]),
      "USDC",
      "finalize",
    );
    expect(preview.problems).toEqual(["no withdrawal of USDC is pending"]);
  });
});
