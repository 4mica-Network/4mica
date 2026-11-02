import { describe, expect, it } from "vitest";
import { Asset, TokenRoute } from "@/client/model";
import {
  AmountPrecisionError,
  AmountZeroError,
  Erc20AllowanceRequiredError,
  GasRequiredError,
  InsufficientBalanceError,
  TokenNotSupportedError,
} from "@/errors";
import { deposit } from "@/facade/deposit";
import {
  fakeBuilder,
  fakeClient,
  fakeGateway,
  fakeSession,
  TX_HASH,
  USDC,
} from "./helpers/facade";

describe("FourMica deposit", () => {
  it("deposits gaslessly and waits until core counts it", async () => {
    const fake = fakeClient({ totals: [0n, 5_000_000n] });
    const result = await deposit(fakeSession(fake), "5 USDC");

    expect(fake.client.deposit.of).toHaveBeenCalledWith(
      Asset.erc20(USDC),
      5_000_000n,
    );
    expect(fake.builder.send).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      status: "spendable",
      txHash: TX_HASH,
      route: TokenRoute.Eip3009,
      amount: "5",
      amountRaw: 5_000_000n,
      asset: { symbol: "USDC", address: USDC, decimals: 6 },
      network: "eip155:84532",
      explorerUrl: `https://sepolia.basescan.org/tx/${TX_HASH}`,
    });
  });

  it("accepts the structured form and a token address", async () => {
    const fake = fakeClient({ totals: [0n, 1_500_000n] });
    const result = await deposit(fakeSession(fake), {
      amount: "1.5",
      asset: USDC.toLowerCase(),
    });
    expect(result.amountRaw).toBe(1_500_000n);
  });

  it("checks the wallet before anything is signed", async () => {
    const fake = fakeClient({
      gateway: fakeGateway({ erc20Balance: async () => 1_000_000n }),
    });
    await expect(deposit(fakeSession(fake), "5 USDC")).rejects.toThrow(
      InsufficientBalanceError,
    );
    expect(fake.client.deposit.of).not.toHaveBeenCalled();
  });

  it("refuses amounts it would have to round, zero, and unknown assets", async () => {
    const session = fakeSession();
    await expect(deposit(session, "0.0000001 USDC")).rejects.toThrow(
      AmountPrecisionError,
    );
    await expect(deposit(session, "0 USDC")).rejects.toThrow(AmountZeroError);
    await expect(deposit(session, "5 DAI")).rejects.toThrow(
      TokenNotSupportedError,
    );
  });

  it("falls back to approve-and-deposit when no gasless route exists", async () => {
    const builder = fakeBuilder();
    builder.send.mockRejectedValueOnce(
      new Erc20AllowanceRequiredError({
        token: USDC,
        spender: USDC,
        allowance: 0n,
        needed: 5_000_000n,
      }),
    );
    const fake = fakeClient({ builder, totals: [0n, 5_000_000n] });
    const result = await deposit(fakeSession(fake), "5 USDC");

    expect(builder.selfFundedBuilder.approve).toHaveBeenCalledOnce();
    expect(builder.selfFundedBuilder.send).toHaveBeenCalledOnce();
    expect(result.route).toBe(TokenRoute.SelfFunded);
  });

  it("gas: self approves and sends the wallet's own transaction", async () => {
    const fake = fakeClient({ totals: [0n, 5_000_000n] });
    await deposit(fakeSession(fake), "5 USDC", { gas: "self" });
    expect(fake.builder.send).not.toHaveBeenCalled();
    expect(fake.builder.selfFundedBuilder.approve).toHaveBeenCalledOnce();
    expect(fake.builder.selfFundedBuilder.send).toHaveBeenCalledOnce();
  });

  it("gas: self needs gas money", async () => {
    const fake = fakeClient({
      gateway: fakeGateway({ nativeBalance: async () => 0n }),
    });
    await expect(
      deposit(fakeSession(fake), "5 USDC", { gas: "self", wait: "mined" }),
    ).rejects.toThrow(GasRequiredError);
    expect(fake.builder.selfFundedBuilder.send).not.toHaveBeenCalled();
  });

  it("deposits native ETH as the wallet's own transaction", async () => {
    const fake = fakeClient();
    const result = await deposit(fakeSession(fake), "0.01 ETH", {
      wait: "mined",
    });
    expect(fake.client.deposit.of).toHaveBeenCalledWith(
      Asset.native(),
      10n ** 16n,
    );
    expect(fake.builder.send).not.toHaveBeenCalled();
    expect(fake.builder.selfFundedBuilder.send).toHaveBeenCalledOnce();
    expect(result.asset.symbol).toBe("ETH");
    expect(fake.client.tokens.supported).not.toHaveBeenCalled();
  });

  it("refuses a native deposit that leaves nothing for gas", async () => {
    const fake = fakeClient({
      gateway: fakeGateway({ nativeBalance: async () => 10n ** 16n }),
    });
    await expect(
      deposit(fakeSession(fake), "0.01 ETH", { wait: "mined" }),
    ).rejects.toThrow(GasRequiredError);
  });

  it("wait: mined does not ask core", async () => {
    const fake = fakeClient();
    const result = await deposit(fakeSession(fake), "5 USDC", {
      wait: "mined",
    });
    expect(result.status).toBe("mined");
    expect(fake.client.rpc.getUserAssetBalance).not.toHaveBeenCalled();
  });

  it("returns pending instead of throwing when core is slow, and spendable() waits again", async () => {
    const fake = fakeClient({ totals: [2_000_000n] });
    const result = await deposit(fakeSession(fake), "5 USDC", {
      timeoutMs: 20,
    });
    expect(result.status).toBe("pending");

    // Counted relative to the balance before the deposit, not from zero.
    fake.client.rpc.getUserAssetBalance.mockResolvedValue({
      total: 7_000_000n,
      locked: 0n,
    } as never);
    expect((await result.spendable({ timeoutMs: 20 })).status).toBe(
      "spendable",
    );
  });

  it("keeps polling through core errors once the money has moved", async () => {
    const fake = fakeClient({ totals: [0n] });
    fake.client.rpc.getUserAssetBalance
      .mockResolvedValueOnce({ total: 0n, locked: 0n } as never)
      .mockRejectedValueOnce(new Error("core down"))
      .mockResolvedValue({ total: 5_000_000n, locked: 0n } as never);
    const result = await deposit(fakeSession(fake), "5 USDC", {
      timeoutMs: 2_000,
    });
    expect(result.status).toBe("spendable");
  });
});
