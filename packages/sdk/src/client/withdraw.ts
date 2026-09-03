/**
 * Requesting, cancelling and finalizing withdrawals. Each step is its own
 * builder so gasless route pins can attach in a later release; today every
 * terminal is the signer's own transaction.
 */

import type { ClientCtx } from "@/client/ctx";
import { Asset, Route, type WithdrawReceipt } from "@/client/model";
import type { TxReceiptWaitOptions } from "@/contract";
import { AmountZeroError } from "@/errors";
import { parseU256 } from "@/utils";

type WithdrawStep = "request" | "cancel" | "finalize";

export class WithdrawClient {
  constructor(private ctx: ClientCtx) {}

  /**
   * Start a withdrawal request for `amount` of `asset`. The grace period runs
   * from the request; finalize once it elapses.
   */
  request(
    asset: Asset | string | null | undefined,
    amount: number | bigint | string,
  ): WithdrawStepBuilder {
    const parsed = parseU256(amount);
    if (parsed <= 0n) {
      throw new AmountZeroError("withdrawal amount must be positive");
    }
    return new WithdrawStepBuilder(
      this.ctx,
      Asset.coerce(asset),
      "request",
      parsed,
    );
  }

  /** Cancel whatever withdrawal request is outstanding for `asset`. */
  cancel(asset: Asset | string | null | undefined): WithdrawStepBuilder {
    return new WithdrawStepBuilder(this.ctx, Asset.coerce(asset), "cancel");
  }

  /** Finalize the pending withdrawal for `asset` after its grace period. */
  finalize(asset: Asset | string | null | undefined): WithdrawStepBuilder {
    return new WithdrawStepBuilder(this.ctx, Asset.coerce(asset), "finalize");
  }
}

export class WithdrawStepBuilder {
  constructor(
    private ctx: ClientCtx,
    private asset: Asset,
    private step: WithdrawStep,
    private amount?: bigint,
  ) {}

  /** Pin the signer's own transaction (already the only route). */
  selfFunded(): WithdrawStepBuilder {
    return this;
  }

  async send(waitOptions?: TxReceiptWaitOptions): Promise<WithdrawReceipt> {
    const gateway = await this.ctx.gateway();
    const token = this.asset.erc20Token;
    const receipt =
      this.step === "request"
        ? await gateway.requestWithdrawal(this.amount ?? 0n, token, waitOptions)
        : this.step === "cancel"
          ? await gateway.cancelWithdrawal(token, waitOptions)
          : await gateway.finalizeWithdrawal(token, waitOptions);
    return {
      txHash: receipt.transactionHash,
      route: Route.SelfFunded,
      account: this.ctx.signerAddress,
      asset: this.asset.address,
      raw: receipt,
    };
  }
}
