/**
 * Depositing collateral. `deposit.of(asset, amount)` captures the intent, a
 * route pin narrows how, and a terminal does it. Facilitator-sponsored
 * gasless routes (EIP-3009 / Permit2) arrive in a later release; until then
 * the auto route is the signer's own transaction.
 */

import type { ClientCtx } from "@/client/ctx";
import { Asset, type DepositReceipt, TokenRoute } from "@/client/model";
import type { TxReceiptWaitOptions } from "@/contract";
import { AmountZeroError, InvalidParamsError } from "@/errors";
import { parseU256 } from "@/utils";

export class DepositClient {
  constructor(private ctx: ClientCtx) {}

  /** Start a deposit of `amount` in `asset` (`null`/`undefined` for native ETH). */
  of(
    asset: Asset | string | null | undefined,
    amount: number | bigint | string,
  ): DepositBuilder {
    return new DepositBuilder(this.ctx, Asset.coerce(asset), parseU256(amount));
  }
}

export class DepositBuilder {
  constructor(
    private ctx: ClientCtx,
    private asset: Asset,
    private amount: bigint,
  ) {
    if (amount <= 0n) {
      throw new AmountZeroError("deposit amount must be positive");
    }
  }

  /** Pin the signer's own transaction. */
  selfFunded(): SelfFundedDeposit {
    return new SelfFundedDeposit(this.ctx, this.asset, this.amount);
  }

  async send(waitOptions?: TxReceiptWaitOptions): Promise<DepositReceipt> {
    return this.selfFunded().send(waitOptions);
  }
}

export class SelfFundedDeposit {
  constructor(
    private ctx: ClientCtx,
    private asset: Asset,
    private amount: bigint,
  ) {}

  /**
   * Grant the Core4Mica contract the allowance a self-funded ERC-20 deposit
   * pulls. Returns `undefined` when the standing allowance covers it.
   */
  async approve(waitOptions?: TxReceiptWaitOptions) {
    if (this.asset.isNative) {
      throw new InvalidParamsError(
        "a native deposit needs no approval; its value rides with the " +
          "transaction",
      );
    }
    const gateway = await this.ctx.gateway();
    return gateway.approveErc20(this.asset.address, this.amount, waitOptions);
  }

  async send(waitOptions?: TxReceiptWaitOptions): Promise<DepositReceipt> {
    const gateway = await this.ctx.gateway();
    const receipt = await gateway.deposit(
      this.amount,
      this.asset.erc20Token,
      waitOptions,
    );
    return {
      txHash: receipt.transactionHash,
      route: TokenRoute.SelfFunded,
      account: this.ctx.signerAddress,
      asset: this.asset.address,
      amount: this.amount,
      raw: receipt,
    };
  }
}
