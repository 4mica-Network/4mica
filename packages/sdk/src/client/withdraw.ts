/**
 * Withdrawing collateral. A request opens a waiting period, after which it
 * can be finalized — or cancelled at any point before that.
 *
 * Each step is an intent builder: `request`, `cancel` and `finalize` capture
 * what to do, a route pin (`gasless()`, `selfFunded()`) narrows how, and a
 * terminal (`send()`, `sign()`, `verify()`) does it. Unpinned, `send()`
 * prefers the gasless route and falls back to the user's own transaction.
 * Unlike a deposit, gasless withdrawal works for ETH too: Core4Mica verifies
 * the signature itself rather than leaning on what the asset implements.
 *
 * Finalization is the exception: it offers no `sign()`, because it needs no
 * signature at all — the payout goes to the user and the amount was fixed
 * when they requested it. Port of `sdk-rust/src/client/withdraw.rs`.
 */

import type {
  WithdrawalCancelAuthorization,
  WithdrawalRequestAuthorization,
} from "@/authorizations";
import type { ClientCtx } from "@/client/ctx";
import {
  confirmFacilitatorEcho,
  NAMES_THE_REQUEST,
  rejectionError,
  sponsorshipUnavailable,
} from "@/client/facilitator";
import { Asset, Route, type WithdrawReceipt } from "@/client/model";
import * as sig from "@/client/sig";
import type { TxReceiptWaitOptions } from "@/contract";
import {
  AmountZeroError,
  InvalidParamsError,
  OutcomeUnknownError,
} from "@/errors";
import { parseU256 } from "@/utils";

export class WithdrawClient {
  constructor(private ctx: ClientCtx) {}

  isGaslessAvailable(): boolean {
    return this.ctx.facilitator.isConfigured();
  }

  /**
   * Start a withdrawal request for `amount` of `asset`. The grace period runs
   * from the request; finalize once it elapses.
   */
  request(
    asset: Asset | string | null | undefined,
    amount: number | bigint | string,
  ): RequestBuilder {
    const parsed = parseU256(amount);
    if (parsed <= 0n) {
      throw new AmountZeroError("withdrawal amount must be positive");
    }
    return new RequestBuilder(this.ctx, Asset.coerce(asset), parsed);
  }

  /** Start a cancellation of the pending withdrawal request for `asset`. */
  cancel(asset: Asset | string | null | undefined): CancelBuilder {
    return new CancelBuilder(this.ctx, Asset.coerce(asset));
  }

  /** Start a finalization of the elapsed withdrawal request for `asset`. */
  finalize(asset: Asset | string | null | undefined): FinalizeBuilder {
    return new FinalizeBuilder(this.ctx, Asset.coerce(asset));
  }
}

// --- request --------------------------------------------------------------

export class RequestBuilder {
  constructor(
    private ctx: ClientCtx,
    private asset: Asset,
    private amount: bigint,
  ) {}

  /** Pin the gasless route: the facilitator submits and pays, with no self-funded fallback. */
  gasless(): GaslessRequest {
    return new GaslessRequest(this.ctx, this.asset, this.amount);
  }

  /** Pin the user's own transaction. */
  selfFunded(): SelfFundedRequest {
    return new SelfFundedRequest(this.ctx, this.asset, this.amount);
  }

  /**
   * Request the withdrawal, gaslessly where possible. A rejection that names
   * the request itself is returned rather than retried, and so is an unknown
   * outcome: the facilitator may already have submitted, and requesting again
   * would overwrite it and restart the grace period.
   */
  async send(waitOptions?: TxReceiptWaitOptions): Promise<WithdrawReceipt> {
    if (!this.ctx.facilitator.isConfigured()) {
      return this.selfFunded().send(waitOptions);
    }
    try {
      return await this.gasless().send();
    } catch (err) {
      if (sponsorshipUnavailable(err, NAMES_THE_REQUEST)) {
        return this.selfFunded().send(waitOptions);
      }
      throw err;
    }
  }
}

export class GaslessRequest {
  constructor(
    private ctx: ClientCtx,
    private asset: Asset,
    private amount: bigint,
  ) {}

  /**
   * Sign the request without submitting it. Redeem by attaching it to a fresh
   * builder:
   * `withdraw.request(asset, amount).gasless().authorization(auth).send()`.
   */
  async sign(): Promise<WithdrawalRequestAuthorization> {
    return sig.requestWithdrawalAuthorization(
      this.ctx,
      this.asset.address,
      this.amount,
    );
  }

  /** Attach a request authorization signed elsewhere. */
  authorization(
    authorization: WithdrawalRequestAuthorization,
  ): AuthorizedRequest {
    return new AuthorizedRequest(
      this.ctx,
      this.asset,
      this.amount,
      authorization,
    );
  }

  /**
   * Request the withdrawal gaslessly. The user needs no native balance and
   * makes no transaction.
   */
  async send(): Promise<WithdrawReceipt> {
    const authorization = await sig.requestWithdrawalAuthorization(
      this.ctx,
      this.asset.address,
      this.amount,
    );
    return submit(
      this.ctx,
      { action: "request", authorization: authorization.toPayload() },
      authorization.user,
      authorization.asset,
    );
  }
}

export class AuthorizedRequest {
  constructor(
    private ctx: ClientCtx,
    private asset: Asset,
    private amount: bigint,
    private auth: WithdrawalRequestAuthorization,
  ) {}

  /**
   * The authorization names its asset and amount, so a builder that disagrees
   * with it would submit terms the caller never stated.
   */
  private checked(): void {
    if (
      this.auth.asset.toLowerCase() !== this.asset.address.toLowerCase() ||
      this.auth.amount !== this.amount
    ) {
      throw new InvalidParamsError(
        `authorization signs ${this.auth.amount} of ${this.auth.asset}, ` +
          `but the builder asks ${this.amount} of ${this.asset.address}`,
      );
    }
  }

  /** Preflight: runs every check a real submission would run, without spending anyone's gas. */
  async verify(): Promise<void> {
    this.checked();
    await verifyRequest(this.ctx, {
      action: "request",
      authorization: this.auth.toPayload(),
    });
  }

  /**
   * Request the withdrawal with the attached authorization. The submitter
   * needs no signer of their own.
   */
  async send(): Promise<WithdrawReceipt> {
    this.checked();
    return submit(
      this.ctx,
      { action: "request", authorization: this.auth.toPayload() },
      this.auth.user,
      this.auth.asset,
    );
  }
}

export class SelfFundedRequest {
  constructor(
    private ctx: ClientCtx,
    private asset: Asset,
    private amount: bigint,
  ) {}

  async send(waitOptions?: TxReceiptWaitOptions): Promise<WithdrawReceipt> {
    const gateway = await this.ctx.gateway();
    const receipt = await gateway.requestWithdrawal(
      this.amount,
      this.asset.erc20Token,
      waitOptions,
    );
    return selfFundedReceipt(this.ctx, receipt, this.asset);
  }
}

// --- cancel ---------------------------------------------------------------

export class CancelBuilder {
  constructor(
    private ctx: ClientCtx,
    private asset: Asset,
  ) {}

  gasless(): GaslessCancel {
    return new GaslessCancel(this.ctx, this.asset);
  }

  selfFunded(): SelfFundedCancel {
    return new SelfFundedCancel(this.ctx, this.asset);
  }

  /** Cancel the pending withdrawal request, gaslessly where possible. */
  async send(waitOptions?: TxReceiptWaitOptions): Promise<WithdrawReceipt> {
    if (!this.ctx.facilitator.isConfigured()) {
      return this.selfFunded().send(waitOptions);
    }
    try {
      return await this.gasless().send();
    } catch (err) {
      if (sponsorshipUnavailable(err, NAMES_THE_REQUEST)) {
        return this.selfFunded().send(waitOptions);
      }
      throw err;
    }
  }
}

export class GaslessCancel {
  constructor(
    private ctx: ClientCtx,
    private asset: Asset,
  ) {}

  /** Sign the cancellation without submitting it. */
  async sign(): Promise<WithdrawalCancelAuthorization> {
    return sig.cancelWithdrawalAuthorization(this.ctx, this.asset.address);
  }

  /** Attach a cancellation authorization signed elsewhere. */
  authorization(
    authorization: WithdrawalCancelAuthorization,
  ): AuthorizedCancel {
    return new AuthorizedCancel(this.ctx, this.asset, authorization);
  }

  /** Cancel the pending withdrawal request gaslessly. */
  async send(): Promise<WithdrawReceipt> {
    const authorization = await sig.cancelWithdrawalAuthorization(
      this.ctx,
      this.asset.address,
    );
    return submit(
      this.ctx,
      { action: "cancel", authorization: authorization.toPayload() },
      authorization.user,
      authorization.asset,
    );
  }
}

export class AuthorizedCancel {
  constructor(
    private ctx: ClientCtx,
    private asset: Asset,
    private auth: WithdrawalCancelAuthorization,
  ) {}

  private checked(): void {
    if (this.auth.asset.toLowerCase() !== this.asset.address.toLowerCase()) {
      throw new InvalidParamsError(
        `authorization cancels for ${this.auth.asset}, but the builder ` +
          `asks ${this.asset.address}`,
      );
    }
  }

  async verify(): Promise<void> {
    this.checked();
    await verifyRequest(this.ctx, {
      action: "cancel",
      authorization: this.auth.toPayload(),
    });
  }

  async send(): Promise<WithdrawReceipt> {
    this.checked();
    return submit(
      this.ctx,
      { action: "cancel", authorization: this.auth.toPayload() },
      this.auth.user,
      this.auth.asset,
    );
  }
}

export class SelfFundedCancel {
  constructor(
    private ctx: ClientCtx,
    private asset: Asset,
  ) {}

  async send(waitOptions?: TxReceiptWaitOptions): Promise<WithdrawReceipt> {
    const gateway = await this.ctx.gateway();
    const receipt = await gateway.cancelWithdrawal(
      this.asset.erc20Token,
      waitOptions,
    );
    return selfFundedReceipt(this.ctx, receipt, this.asset);
  }
}

// --- finalize -------------------------------------------------------------

/**
 * No `sign()` on any route: `finalizeWithdrawalFor` is permissionless because
 * it pays the user, so there is nothing to sign.
 */
export class FinalizeBuilder {
  constructor(
    private ctx: ClientCtx,
    private asset: Asset,
  ) {}

  gasless(): GaslessFinalize {
    return new GaslessFinalize(this.ctx, this.asset);
  }

  selfFunded(): SelfFundedFinalize {
    return new SelfFundedFinalize(this.ctx, this.asset);
  }

  /** Pay out the elapsed withdrawal request, gaslessly where possible. */
  async send(waitOptions?: TxReceiptWaitOptions): Promise<WithdrawReceipt> {
    if (!this.ctx.facilitator.isConfigured()) {
      return this.selfFunded().send(waitOptions);
    }
    try {
      return await this.gasless().send();
    } catch (err) {
      if (sponsorshipUnavailable(err, NAMES_THE_REQUEST)) {
        return this.selfFunded().send(waitOptions);
      }
      throw err;
    }
  }
}

export class GaslessFinalize {
  constructor(
    private ctx: ClientCtx,
    private asset: Asset,
  ) {}

  /**
   * Preflight — worth more here than elsewhere, since finalization is the one
   * step that can be refused purely by the clock.
   */
  async verify(): Promise<void> {
    await verifyRequest(this.ctx, this.finalizeRequest());
  }

  /**
   * Finalize gaslessly. Takes no signature: `finalizeWithdrawalFor` pays the
   * user whoever submits it.
   */
  async send(): Promise<WithdrawReceipt> {
    return submit(
      this.ctx,
      this.finalizeRequest(),
      this.ctx.signerAddress,
      this.asset.address,
    );
  }

  private finalizeRequest(): Record<string, unknown> {
    return {
      action: "finalize",
      user: this.ctx.signerAddress,
      asset: this.asset.address,
    };
  }
}

export class SelfFundedFinalize {
  constructor(
    private ctx: ClientCtx,
    private asset: Asset,
  ) {}

  async send(waitOptions?: TxReceiptWaitOptions): Promise<WithdrawReceipt> {
    const gateway = await this.ctx.gateway();
    const receipt = await gateway.finalizeWithdrawal(
      this.asset.erc20Token,
      waitOptions,
    );
    return selfFundedReceipt(this.ctx, receipt, this.asset);
  }
}

// --- shared ---------------------------------------------------------------

function selfFundedReceipt(
  ctx: ClientCtx,
  receipt: Extract<WithdrawReceipt["raw"], { transactionHash: unknown }>,
  asset: Asset,
): WithdrawReceipt {
  return {
    txHash: receipt.transactionHash,
    route: Route.SelfFunded,
    account: ctx.signerAddress,
    asset: asset.address,
    raw: receipt,
  };
}

async function submit(
  ctx: ClientCtx,
  request: Record<string, unknown>,
  user: string,
  asset: string,
): Promise<WithdrawReceipt> {
  const response = await ctx.facilitator.post("withdraw", request);
  if (!response.success) {
    throw rejectionError(response, response.error);
  }

  const txHash = response.txHash;
  if (typeof txHash !== "string" || !txHash.startsWith("0x")) {
    throw new OutcomeUnknownError(
      "facilitator reported success without a txHash",
    );
  }

  return {
    txHash,
    route: Route.Gasless,
    account: confirmFacilitatorEcho("user", response.user, user),
    asset: confirmFacilitatorEcho("asset", response.asset, asset),
    network:
      typeof response.network === "string" ? response.network : undefined,
    raw: response,
  };
}

async function verifyRequest(
  ctx: ClientCtx,
  request: Record<string, unknown>,
): Promise<void> {
  const response = await ctx.facilitator.post("withdraw/verify", request);
  if (response.isValid) {
    return;
  }
  throw rejectionError(response, response.invalidReason);
}
