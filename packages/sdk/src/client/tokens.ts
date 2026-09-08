/** Token utilities shared by the deposit and settlement flows. */

import type { ClientCtx } from "@/client/ctx";
import type { TxReceiptWaitOptions } from "@/contract";
import type { SupportedTokensResponse } from "@/models";

export class TokensClient {
  constructor(private ctx: ClientCtx) {}

  /** The assets that can be deposited, with the metadata needed to sign for them. */
  async supported(): Promise<SupportedTokensResponse> {
    return this.ctx.rpc.getSupportedTokens();
  }

  /**
   * Allow the 4Mica contract to spend `amount` of `token` on the signer's
   * behalf. Only self-funded deposits need this. For the contract that
   * settles a clearing cycle, use
   * `settlement.pay(...).selfFunded().approve()` instead.
   */
  async approve(
    token: string,
    amount: number | bigint | string,
    waitOptions?: TxReceiptWaitOptions,
  ) {
    const gateway = await this.ctx.gateway();
    return gateway.approveErc20(token, amount, waitOptions);
  }
}
