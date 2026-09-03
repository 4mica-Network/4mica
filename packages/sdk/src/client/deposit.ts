/**
 * Depositing collateral, over whichever route is cheapest for the payer.
 *
 * `deposit.of(asset, amount)` captures the intent, a route pin (`gasless()`,
 * `eip3009()`, `permit2()`, `selfFunded()`) narrows how, and a terminal
 * (`send()`, `sign()`, `verify()`, `approve()`) does it. Gasless routes have
 * the payer sign an authorization that the facilitator redeems and pays gas
 * for — attach one signed elsewhere with `authorization(...)` — while the
 * self-funded route is the payer's own transaction. Every route credits the
 * authorization's signer, so the choice only changes who pays;
 * `DepositReceipt.route` reports which one ran. Port of
 * `sdk-rust/src/client/deposit.rs`.
 */

import type {
  Eip2612Permit,
  Permit2Authorization,
  ReceiveAuthorization,
} from "@/authorizations";
import type { ClientCtx } from "@/client/ctx";
import {
  confirmFacilitatorEcho,
  refusesTheAuthorization,
  rejectionError,
} from "@/client/facilitator";
import { Asset, type DepositReceipt, TokenRoute } from "@/client/model";
import * as sig from "@/client/sig";
import type { TxReceiptWaitOptions } from "@/contract";
import {
  AmountZeroError,
  Erc20AllowanceRequiredError,
  InvalidParamsError,
  MissingTokenDomainSeparatorError,
  OutcomeUnknownError,
  Permit2AllowanceRequiredError,
} from "@/errors";
import { parseU256 } from "@/utils";

export class DepositClient {
  constructor(private ctx: ClientCtx) {}

  /**
   * Whether a gasless route is available at all — callers that want to decide
   * for themselves rather than let the auto route fall back can branch on
   * this instead of on an error.
   */
  isGaslessAvailable(): boolean {
    return this.ctx.facilitator.isConfigured();
  }

  /** Start a deposit of `amount` in `asset` (`null`/`undefined` for native ETH). */
  of(
    asset: Asset | string | null | undefined,
    amount: number | bigint | string,
  ): DepositBuilder {
    return new DepositBuilder(this.ctx, Asset.coerce(asset), parseU256(amount));
  }
}

abstract class DepositBase {
  constructor(
    protected ctx: ClientCtx,
    protected asset: Asset,
    protected amount: bigint,
  ) {
    if (amount <= 0n) {
      throw new AmountZeroError("deposit amount must be positive");
    }
  }

  /**
   * The ERC-20 behind a gasless pin. Native ETH has no gasless route — no
   * authorization scheme covers it.
   */
  protected erc20Token(): string {
    if (this.asset.isNative) {
      throw new InvalidParamsError(
        "native ETH has no gasless route; deposit it self-funded",
      );
    }
    return this.asset.address;
  }
}

/** A deposit being built; nothing happens until a terminal runs. */
export class DepositBuilder extends DepositBase {
  /**
   * Pin "any gasless scheme": EIP-3009 first, then Permit2 with the approval
   * sponsored, with no self-funded fallback.
   */
  gasless(): GaslessDeposit {
    return new GaslessDeposit(this.ctx, this.asset, this.amount);
  }

  /** Pin the EIP-3009 route, failing rather than trying another scheme. */
  eip3009(): Eip3009Deposit {
    return new Eip3009Deposit(this.ctx, this.asset, this.amount);
  }

  /** Pin the Permit2 route, failing rather than trying another scheme. */
  permit2(): Permit2Deposit {
    return new Permit2Deposit(this.ctx, this.asset, this.amount);
  }

  /** Pin the payer's own transaction. */
  selfFunded(): SelfFundedDeposit {
    return new SelfFundedDeposit(this.ctx, this.asset, this.amount);
  }

  /**
   * Deposit over the cheapest route available: EIP-3009, then Permit2 with
   * the approval sponsored where the token allows it, then the payer's own
   * transaction when no gasless route applies — native ETH, no facilitator
   * configured, or a token whose Permit2 approval cannot be sponsored.
   */
  async send(waitOptions?: TxReceiptWaitOptions): Promise<DepositReceipt> {
    if (this.asset.isNative || !this.ctx.facilitator.isConfigured()) {
      return this.selfFunded().send(waitOptions);
    }
    const token = this.asset.address;

    // EIP-3009 is the cheapest route, but nothing says up front whether a
    // token implements it — a domain separator only proves EIP-712, which
    // EIP-2612 has too. So try it and read the answer off the rejection,
    // which costs no gas.
    try {
      return await sendEip3009(this.ctx, token, this.amount);
    } catch (rejection) {
      if (!refusesTheAuthorization(rejection)) {
        throw rejection;
      }
    }

    try {
      return await sendSponsoredPermit2(this.ctx, token, this.amount);
    } catch (rejection) {
      if (rejection instanceof Permit2AllowanceRequiredError) {
        // The approval cannot be sponsored, so gaslessness is off the table
        // either way; paying for the deposit directly is one transaction
        // rather than an approval plus a deposit.
        return fallbackToSelfFunded(this.ctx, token, this.amount, waitOptions);
      }
      throw rejection;
    }
  }
}

export class GaslessDeposit extends DepositBase {
  /**
   * Deposit gaslessly, over whichever scheme the token supports. Fails rather
   * than falling back to the payer's own transaction.
   */
  async send(): Promise<DepositReceipt> {
    const token = this.erc20Token();
    try {
      return await sendEip3009(this.ctx, token, this.amount);
    } catch (rejection) {
      if (!refusesTheAuthorization(rejection)) {
        throw rejection;
      }
    }
    return sendSponsoredPermit2(this.ctx, token, this.amount);
  }
}

export class Eip3009Deposit extends DepositBase {
  /**
   * Sign the EIP-3009 authorization without submitting it. Redeem by
   * attaching it to a fresh builder:
   * `deposit.of(asset, amount).eip3009().authorization(auth).send()`.
   */
  async sign(): Promise<ReceiveAuthorization> {
    return sig.eip3009Authorization(this.ctx, this.erc20Token(), this.amount);
  }

  /**
   * Attach an EIP-3009 authorization signed elsewhere — a hardware wallet,
   * another process, or an earlier session.
   */
  authorization(authorization: ReceiveAuthorization): AuthorizedEip3009Deposit {
    return new AuthorizedEip3009Deposit(
      this.ctx,
      this.asset,
      this.amount,
      authorization,
    );
  }

  /**
   * Deposit gaslessly with an EIP-3009 authorization. Requires a token
   * implementing EIP-3009 (USDC and similar); for anything else pin
   * `permit2()`.
   */
  async send(): Promise<DepositReceipt> {
    return sendEip3009(this.ctx, this.erc20Token(), this.amount);
  }
}

export class Permit2Deposit extends DepositBase {
  /**
   * Upgrade the pin to sign the missing Permit2 approval (EIP-2612) rather
   * than fail on it.
   */
  sponsorApproval(): SponsoredPermit2Deposit {
    return new SponsoredPermit2Deposit(this.ctx, this.asset, this.amount);
  }

  /** Sign the Permit2 authorization without submitting it. */
  async sign(): Promise<Permit2Authorization> {
    return sig.permit2Authorization(this.ctx, this.erc20Token(), this.amount);
  }

  /** Attach a Permit2 authorization signed elsewhere. */
  authorization(authorization: Permit2Authorization): AuthorizedPermit2Deposit {
    return new AuthorizedPermit2Deposit(
      this.ctx,
      this.asset,
      this.amount,
      authorization,
    );
  }

  /**
   * Deposit gaslessly through Permit2. Works for any ERC-20, but is not
   * gasless on its own: without the payer's one-time on-chain
   * `approve(PERMIT2, ...)` this fails with Permit2AllowanceRequiredError;
   * `sponsorApproval()` covers that approval too, where the token allows it.
   */
  async send(): Promise<DepositReceipt> {
    const token = this.erc20Token();
    const authorization = await sig.permit2Authorization(
      this.ctx,
      token,
      this.amount,
    );
    return submit(
      this.ctx,
      permit2Request(token, this.amount, authorization, undefined),
      TokenRoute.Permit2,
      authorization.fromAddress,
      token,
      this.amount,
    );
  }
}

export class SponsoredPermit2Deposit extends DepositBase {
  /**
   * Deposit through Permit2, signing the missing approval rather than
   * transacting for it. Fails with Permit2AllowanceRequiredError for tokens
   * with no EIP-2612 surface. No `sign()` on this pin: the permit needs the
   * payer's current EIP-2612 nonce, which only arrives with the facilitator's
   * rejection.
   */
  async send(): Promise<DepositReceipt> {
    return sendSponsoredPermit2(this.ctx, this.erc20Token(), this.amount);
  }
}

export class AuthorizedEip3009Deposit extends DepositBase {
  constructor(
    ctx: ClientCtx,
    asset: Asset,
    amount: bigint,
    private auth: ReceiveAuthorization,
  ) {
    super(ctx, asset, amount);
  }

  /**
   * Preflight: runs every check a real submission would run, without spending
   * anyone's gas — worth doing before handing an authorization to a
   * user-facing flow, since it tells a permanently unusable authorization
   * apart from a transient failure.
   */
  async verify(): Promise<void> {
    await verifyRequest(
      this.ctx,
      eip3009Request(this.erc20Token(), this.amount, this.auth),
    );
  }

  /** Deposit with the attached authorization. The submitter needs no signer of their own. */
  async send(): Promise<DepositReceipt> {
    const token = this.erc20Token();
    return submit(
      this.ctx,
      eip3009Request(token, this.amount, this.auth),
      TokenRoute.Eip3009,
      this.auth.fromAddress,
      token,
      this.amount,
    );
  }
}

export class AuthorizedPermit2Deposit extends DepositBase {
  constructor(
    ctx: ClientCtx,
    asset: Asset,
    amount: bigint,
    private auth: Permit2Authorization,
  ) {
    super(ctx, asset, amount);
  }

  /** Preflight: runs every check a real submission would run, without spending anyone's gas. */
  async verify(): Promise<void> {
    await verifyRequest(
      this.ctx,
      permit2Request(this.erc20Token(), this.amount, this.auth, undefined),
    );
  }

  /** Deposit with the attached authorization. The submitter needs no signer of their own. */
  async send(): Promise<DepositReceipt> {
    const token = this.erc20Token();
    return submit(
      this.ctx,
      permit2Request(token, this.amount, this.auth, undefined),
      TokenRoute.Permit2,
      this.auth.fromAddress,
      token,
      this.amount,
    );
  }
}

export class SelfFundedDeposit extends DepositBase {
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

  /**
   * Deposit with the payer's own transaction, reported in the same shape as a
   * gasless one. For ERC-20 deposits, grant the allowance with
   * {@link approve} first.
   */
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

async function sendEip3009(
  ctx: ClientCtx,
  token: string,
  amount: bigint,
): Promise<DepositReceipt> {
  const authorization = await sig.eip3009Authorization(ctx, token, amount);
  return submit(
    ctx,
    eip3009Request(token, amount, authorization),
    TokenRoute.Eip3009,
    authorization.fromAddress,
    token,
    amount,
  );
}

async function sendSponsoredPermit2(
  ctx: ClientCtx,
  token: string,
  amount: bigint,
): Promise<DepositReceipt> {
  // Try the plain route first: the payer may already have approved, in which
  // case a permit is pointless and only costs the submitter a no-op.
  const authorization = await sig.permit2Authorization(ctx, token, amount);
  try {
    return await submit(
      ctx,
      permit2Request(token, amount, authorization, undefined),
      TokenRoute.Permit2,
      authorization.fromAddress,
      token,
      amount,
    );
  } catch (rejection) {
    if (
      !(rejection instanceof Permit2AllowanceRequiredError) ||
      rejection.eip2612Nonce === undefined
    ) {
      throw rejection;
    }

    let permit: Eip2612Permit;
    try {
      permit = await sig.eip2612Permit(ctx, token, rejection.eip2612Nonce);
    } catch (err) {
      if (err instanceof MissingTokenDomainSeparatorError) {
        // The permit digest needs the token's domain separator; without one
        // the approval cannot be sponsored from here — the nonce advertised
        // that sponsoring *could* work, which has just been disproven, so it
        // is stripped.
        throw new Permit2AllowanceRequiredError(rejection.message, undefined);
      }
      throw err;
    }

    return submit(
      ctx,
      permit2Request(token, amount, authorization, permit),
      TokenRoute.SponsoredPermit2,
      authorization.fromAddress,
      token,
      amount,
    );
  }
}

/**
 * Taken only after every gasless route was refused. Pre-checks the ERC-20
 * allowance the fallback needs and the gasless routes never did, so a payer
 * who has not approved the contract is told exactly that instead of getting
 * an opaque revert from inside the token.
 */
async function fallbackToSelfFunded(
  ctx: ClientCtx,
  token: string,
  amount: bigint,
  waitOptions?: TxReceiptWaitOptions,
): Promise<DepositReceipt> {
  const gateway = await ctx.gateway();
  const allowance = await gateway.erc20Allowance(token, ctx.contractAddress);
  if (allowance < amount) {
    throw new Erc20AllowanceRequiredError({
      token,
      spender: ctx.contractAddress,
      allowance,
      needed: amount,
    });
  }
  const receipt = await gateway.deposit(amount, token, waitOptions);
  return {
    txHash: receipt.transactionHash,
    route: TokenRoute.SelfFunded,
    account: ctx.signerAddress,
    asset: token,
    amount,
    raw: receipt,
  };
}

function eip3009Request(
  token: string,
  amount: bigint,
  authorization: ReceiveAuthorization,
): Record<string, unknown> {
  return {
    asset: token,
    amount: amount.toString(),
    assetTransferMethod: "eip3009",
    authorization: authorization.toPayload(),
  };
}

function permit2Request(
  token: string,
  amount: bigint,
  authorization: Permit2Authorization,
  permit: Eip2612Permit | undefined,
): Record<string, unknown> {
  const request: Record<string, unknown> = {
    asset: token,
    amount: amount.toString(),
    assetTransferMethod: "permit2",
    permit2Authorization: authorization.toPayload(),
  };
  if (permit !== undefined) {
    request.eip2612Permit = permit.toPayload();
  }
  return request;
}

async function submit(
  ctx: ClientCtx,
  request: Record<string, unknown>,
  route: TokenRoute,
  payer: string,
  asset: string,
  amount: bigint,
): Promise<DepositReceipt> {
  const response = await ctx.facilitator.post("deposit", request);
  if (!response.success) {
    throw rejectionError(response, response.error);
  }

  const txHash = response.txHash;
  if (typeof txHash !== "string" || !txHash.startsWith("0x")) {
    throw new OutcomeUnknownError(
      "facilitator reported success without a txHash",
    );
  }

  // from/asset/amount are echoed for reconciliation; a facilitator that omits
  // them has not changed what the contract did, but one that echoes a
  // different deposit has, and the receipt is refused rather than made to
  // describe it.
  const echoedAmount = response.amount;
  if (echoedAmount !== null && echoedAmount !== undefined) {
    // An echo that cannot be read is no confirmation that it matched.
    let parsedAmount: bigint | undefined;
    try {
      parsedAmount = BigInt(String(echoedAmount));
    } catch {
      parsedAmount = undefined;
    }
    if (parsedAmount !== amount) {
      throw new OutcomeUnknownError(
        `facilitator echoed amount ${echoedAmount}, expected ${amount}`,
      );
    }
  }

  return {
    txHash,
    route,
    account: confirmFacilitatorEcho("from", response.from, payer),
    asset: confirmFacilitatorEcho("asset", response.asset, asset),
    amount,
    network:
      typeof response.network === "string" ? response.network : undefined,
    raw: response,
  };
}

async function verifyRequest(
  ctx: ClientCtx,
  request: Record<string, unknown>,
): Promise<void> {
  const response = await ctx.facilitator.post("deposit/verify", request);
  if (response.isValid) {
    return;
  }
  throw rejectionError(response, response.invalidReason);
}
