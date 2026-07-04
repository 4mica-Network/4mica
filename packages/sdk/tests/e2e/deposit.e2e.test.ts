import { afterAll, beforeAll, expect, it } from "vitest";
import type { Client } from "../../src";
import {
  describeE2E,
  ETH_DECIMALS,
  getSupportedStablecoins,
  makePayerClient,
  resolveDepositAmount,
} from "./setup";

describeE2E("Deposit", () => {
  let payerClient: Client;

  beforeAll(async () => {
    payerClient = await makePayerClient();
  });

  afterAll(async () => {
    await payerClient.aclose();
  });

  it("deposits native ETH", async () => {
    const amount = resolveDepositAmount(ETH_DECIMALS);
    const receipt = await payerClient.user.deposit(amount);
    expect(receipt.transactionHash).toMatch(/^0x[0-9a-f]{64}$/i);
  });

  it("deposits each supported stablecoin", async () => {
    const tokens = await getSupportedStablecoins(payerClient);
    expect(tokens.length, "core returned no supported tokens").toBeGreaterThan(
      0,
    );

    for (const token of tokens) {
      const amount = resolveDepositAmount(token.decimals);
      const approveReceipt = await payerClient.user.approveErc20(
        token.address,
        amount,
      );
      const depositReceipt = await payerClient.user.deposit(
        amount,
        token.address,
      );

      expect(
        approveReceipt.transactionHash,
        `approve tx missing for ${token.symbol}`,
      ).toMatch(/^0x[0-9a-f]{64}$/i);
      expect(
        depositReceipt.transactionHash,
        `deposit tx missing for ${token.symbol}`,
      ).toMatch(/^0x[0-9a-f]{64}$/i);
    }
  });
});
