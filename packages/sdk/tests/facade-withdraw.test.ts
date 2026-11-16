import { describe, expect, it } from "vitest";
import { Asset } from "@/client/model";
import {
  GracePeriodNotElapsedError,
  NoWithdrawalRequestedError,
} from "@/errors";
import {
  cancelWithdrawal,
  finalizeWithdrawal,
  pendingWithdrawals,
  requestWithdrawal,
} from "@/facade/withdraw";
import {
  fakeClient,
  fakeGateway,
  fakeSession,
  TX_HASH,
  USDC,
} from "./helpers/facade";

const nowSecs = () => BigInt(Math.floor(Date.now() / 1000));

const position = (asset: string, amount: bigint, requestedSecsAgo: bigint) => ({
  asset,
  collateral: amount,
  withdrawalRequestAmount: amount,
  withdrawalRequestTimestamp: nowSecs() - requestedSecsAgo,
});

describe("FourMica withdrawals", () => {
  it("requests in base units of the named asset", async () => {
    const fake = fakeClient();
    const result = await requestWithdrawal(fakeSession(fake), "2 USDC");
    expect(fake.client.withdraw.request).toHaveBeenCalledWith(
      Asset.erc20(USDC),
      2_000_000n,
    );
    expect(result).toMatchObject({
      txHash: TX_HASH,
      asset: { symbol: "USDC" },
      network: "eip155:84532",
    });
  });

  it("withdraws native ETH by symbol", async () => {
    const fake = fakeClient();
    await requestWithdrawal(fakeSession(fake), "0.5 ETH");
    expect(fake.client.withdraw.request).toHaveBeenCalledWith(
      Asset.native(),
      5n * 10n ** 17n,
    );
  });

  it("cancels by asset", async () => {
    const fake = fakeClient();
    await cancelWithdrawal(fakeSession(fake), "usdc");
    expect(fake.client.withdraw.cancel).toHaveBeenCalledWith(Asset.erc20(USDC));
  });

  it("lists pending requests with when they become ready", async () => {
    const unlisted = "0x3333333333333333333333333333333333333333";
    const fake = fakeClient({
      gateway: fakeGateway({
        getUserAssets: async () => [
          position(USDC, 2_000_000n, 7200n),
          position(unlisted, 42n, 60n),
          { ...position(USDC, 0n, 0n), withdrawalRequestAmount: 0n },
        ],
      }),
    });
    const [usdc, other, ...rest] = await pendingWithdrawals(fakeSession(fake));
    expect(rest).toEqual([]);
    expect(usdc).toMatchObject({
      asset: { symbol: "USDC" },
      amount: "2",
      amountRaw: 2_000_000n,
      ready: true,
    });
    expect(usdc.readyAt.getTime() - usdc.requestedAt.getTime()).toBe(3_600_000);
    expect(other).toMatchObject({
      asset: { symbol: unlisted, decimals: 0 },
      amount: "42",
      ready: false,
    });
  });

  it("says when an early finalize will be possible instead of reverting", async () => {
    const fake = fakeClient({
      gateway: fakeGateway({
        getUserAssets: async () => [position(USDC, 2_000_000n, 60n)],
      }),
    });
    await expect(finalizeWithdrawal(fakeSession(fake), "USDC")).rejects.toThrow(
      GracePeriodNotElapsedError,
    );
    await expect(finalizeWithdrawal(fakeSession(fake), "USDC")).rejects.toThrow(
      /can be finalized from \d{4}-/,
    );
    expect(fake.client.withdraw.finalize).not.toHaveBeenCalled();
  });

  it("refuses to finalize when nothing was requested", async () => {
    await expect(finalizeWithdrawal(fakeSession(), "USDC")).rejects.toThrow(
      NoWithdrawalRequestedError,
    );
  });

  it("finalizes once the grace period has ended", async () => {
    const fake = fakeClient({
      gateway: fakeGateway({
        getUserAssets: async () => [position(USDC, 2_000_000n, 7200n)],
      }),
    });
    await finalizeWithdrawal(fakeSession(fake), "USDC");
    expect(fake.client.withdraw.finalize).toHaveBeenCalledWith(
      Asset.erc20(USDC),
    );
  });
});
