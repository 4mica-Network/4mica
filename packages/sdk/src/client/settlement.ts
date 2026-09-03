/**
 * Settling a clearing cycle: the debtor pays what they owe, the creditor
 * claims what they are owed. Both sides live here because they share a
 * cycle's terms and its proof format.
 *
 * `settlement.pay(cycleId)` and `settlement.claim(cycleId)` capture the
 * intent, a route pin (`gasless()`, `eip3009()`, `permit2()`, `selfFunded()`)
 * narrows how, and a terminal (`send()`, `sign()`, `verify()`, `approve()`,
 * `action()`) does it. A debit authorization signed elsewhere attaches with
 * `authorization(...)`. The claim side addresses someone else's credit with
 * `creditor(...)` — an input, not a different method: the payout goes to the
 * address the committed leaf names either way. Terms always come from core's
 * prepared action, never from the caller. Port of
 * `sdk-rust/src/client/settlement.rs`.
 */

import type { Hex } from "viem";
import type {
  Eip2612Permit,
  Permit2Authorization,
  ReceiveAuthorization,
} from "@/authorizations";
import type { ClientCtx } from "@/client/ctx";
import {
  confirmFacilitatorEcho,
  NAMES_THE_CLAIM,
  NAMES_THE_PAYMENT,
  refusesTheAuthorization,
  rejectionError,
  sponsorshipUnavailable,
} from "@/client/facilitator";
import {
  type ClaimReceipt,
  confirmEchoed,
  type PayReceipt,
  Route,
  TokenRoute,
} from "@/client/model";
import * as sig from "@/client/sig";
import type { TxReceiptWaitOptions } from "@/contract";
import {
  Erc20AllowanceRequiredError,
  InvalidParamsError,
  MissingTokenDomainSeparatorError,
  OutcomeUnknownError,
  Permit2AllowanceRequiredError,
} from "@/errors";
import { type ClearingSettlementActionResponse, ZERO_ADDRESS } from "@/models";
import { normalizeAddress } from "@/utils";

export class SettlementClient {
  constructor(private ctx: ClientCtx) {}

  /** Whether the gasless route is available at all. */
  isGaslessAvailable(): boolean {
    return this.ctx.facilitator.isConfigured();
  }

  /**
   * Start a net-debit payment for `cycleId` (the text id or the 0x-prefixed
   * on-chain id). Nothing happens until a terminal runs.
   */
  pay(cycleId: string): PayBuilder {
    return new PayBuilder(this.ctx, String(cycleId));
  }

  /**
   * Start a net-credit claim for `cycleId`, for the signer's own credit
   * unless `creditor(...)` redirects it.
   */
  claim(cycleId: string): ClaimBuilder {
    return new ClaimBuilder(this.ctx, String(cycleId));
  }
}

// --- shared validation ----------------------------------------------------

/**
 * Core must have prepared a debit for this debtor, not some other action or
 * participant — checked before any money moves.
 */
function checkedPayCall(
  action: ClearingSettlementActionResponse,
  debtor: string,
): ClearingSettlementActionResponse {
  confirmEchoed("participant", action.participant, debtor);
  if (action.functionName !== "payNetDebit") {
    throw new InvalidParamsError(
      `core prepared ${action.functionName}, expected payNetDebit`,
    );
  }
  return action;
}

function checkedClaimCall(
  action: ClearingSettlementActionResponse,
  creditor: string,
): ClearingSettlementActionResponse {
  confirmEchoed("participant", action.participant, creditor);
  if (action.functionName !== "claimNetCreditFor") {
    throw new InvalidParamsError(
      `core prepared ${action.functionName}, expected claimNetCreditFor`,
    );
  }
  return action;
}

/**
 * Validations shared by every gasless debit route: the terms must name this
 * signer, and the cycle must settle in an ERC-20 — a native debit cannot be
 * pulled by signature.
 */
function checkedGaslessPay(
  action: ClearingSettlementActionResponse,
  debtor: string,
): ClearingSettlementActionResponse {
  checkedPayCall(action, debtor);
  if (action.assetAddress.toLowerCase() === ZERO_ADDRESS) {
    throw new InvalidParamsError(
      "native-asset debits cannot be paid gaslessly; use the self-funded route",
    );
  }
  return action;
}

const proofHex = (action: ClearingSettlementActionResponse): Hex[] =>
  action.proof.map((item) => item as Hex);

async function payAction(
  ctx: ClientCtx,
  cycleId: string,
): Promise<ClearingSettlementActionResponse> {
  return ctx.rpc.getClearingPayNetDebitAction(cycleId, ctx.signerAddress);
}

// --- pay ------------------------------------------------------------------

/** A net-debit payment being built. */
export class PayBuilder {
  constructor(
    private ctx: ClientCtx,
    private cycleId: string,
  ) {}

  /**
   * The terms of the caller's net debit: where to pay, how much, and the
   * proof the contract will check.
   */
  async action(): Promise<ClearingSettlementActionResponse> {
    return payAction(this.ctx, this.cycleId);
  }

  /**
   * Pin "any gasless scheme": EIP-3009 first, then Permit2 with the approval
   * sponsored, with no self-funded fallback.
   */
  gasless(): GaslessPay {
    return new GaslessPay(this.ctx, this.cycleId);
  }

  /** Pin the EIP-3009 route, failing rather than trying another scheme. */
  eip3009(): Eip3009Pay {
    return new Eip3009Pay(this.ctx, this.cycleId);
  }

  /** Pin the Permit2 route, failing rather than trying another scheme. */
  permit2(): Permit2Pay {
    return new Permit2Pay(this.ctx, this.cycleId);
  }

  /** Pin the caller's own transaction. */
  selfFunded(): SelfFundedPay {
    return new SelfFundedPay(this.ctx, this.cycleId);
  }

  /**
   * Pay the caller's committed net debit, gaslessly where possible.
   *
   * For an ERC-20 cycle with a facilitator configured, the caller signs an
   * authorization for the exact amount and the facilitator submits and pays
   * gas. Otherwise — a native-asset cycle, no facilitator, or no gasless
   * scheme left — the caller's own transaction runs; a missing allowance is
   * refused as Erc20AllowanceRequiredError rather than left to revert. A
   * rejection that names the payment itself is returned rather than retried,
   * and so is an unknown outcome: the facilitator may already have submitted,
   * and a second payment would revert as AlreadyPaid after paying gas.
   */
  async send(waitOptions?: TxReceiptWaitOptions): Promise<PayReceipt> {
    const action = await payAction(this.ctx, this.cycleId);
    if (
      !this.ctx.facilitator.isConfigured() ||
      action.assetAddress.toLowerCase() === ZERO_ADDRESS
    ) {
      return paySelfFunded(this.ctx, action, waitOptions);
    }
    try {
      return await payGaslessWith(this.ctx, this.cycleId, action);
    } catch (err) {
      if (err instanceof Permit2AllowanceRequiredError) {
        // The approval cannot be sponsored, so gaslessness is off the table
        // either way; paying the debit directly is one transaction rather
        // than an approval plus a payment.
        return paySelfFunded(this.ctx, action, waitOptions);
      }
      if (sponsorshipUnavailable(err, NAMES_THE_PAYMENT)) {
        return paySelfFunded(this.ctx, action, waitOptions);
      }
      throw err;
    }
  }
}

export class GaslessPay {
  constructor(
    private ctx: ClientCtx,
    private cycleId: string,
  ) {}

  /**
   * Pay gaslessly, over whichever signature scheme the cycle's token
   * supports. ERC-20 cycles only: a native-asset debit cannot be pulled by
   * signature. Fails rather than falling back to the caller's own
   * transaction.
   */
  async send(): Promise<PayReceipt> {
    const action = await payAction(this.ctx, this.cycleId);
    return payGaslessWith(this.ctx, this.cycleId, action);
  }
}

export class Eip3009Pay {
  constructor(
    private ctx: ClientCtx,
    private cycleId: string,
  ) {}

  /**
   * Sign the debit authorization without submitting it. The signature binds
   * the ClearingHouse, the exact amount, and — as its nonce — the cycle.
   * Redeem with
   * `settlement.pay(cycleId).eip3009().authorization(auth).send()`.
   */
  async sign(): Promise<ReceiveAuthorization> {
    const action = checkedGaslessPay(
      await payAction(this.ctx, this.cycleId),
      this.ctx.signerAddress,
    );
    return sig.debitAuthorization(
      this.ctx,
      action.assetAddress,
      action.contractAddress,
      action.amount,
      action.cycleId,
    );
  }

  /** Attach a debit authorization signed elsewhere. */
  authorization(authorization: ReceiveAuthorization): AuthorizedPay {
    return new AuthorizedPay(
      this.ctx,
      this.cycleId,
      {
        assetTransferMethod: "eip3009",
        authorization: authorization.toPayload(),
      },
      TokenRoute.Eip3009,
      authorization.fromAddress,
    );
  }

  /** Pay gaslessly with an EIP-3009 authorization, failing rather than trying another scheme. */
  async send(): Promise<PayReceipt> {
    const action = await payAction(this.ctx, this.cycleId);
    return payEip3009With(this.ctx, this.cycleId, action);
  }
}

export class Permit2Pay {
  constructor(
    private ctx: ClientCtx,
    private cycleId: string,
  ) {}

  /**
   * Upgrade the pin to sign the missing Permit2 approval (EIP-2612) rather
   * than fail on it.
   */
  sponsorApproval(): SponsoredPermit2Pay {
    return new SponsoredPermit2Pay(this.ctx, this.cycleId);
  }

  /** Sign the Permit2 debit authorization without submitting it. */
  async sign(): Promise<Permit2Authorization> {
    const action = checkedGaslessPay(
      await payAction(this.ctx, this.cycleId),
      this.ctx.signerAddress,
    );
    return sig.debitPermit2Authorization(
      this.ctx,
      action.assetAddress,
      action.contractAddress,
      action.amount,
      action.cycleId,
    );
  }

  /** Attach a Permit2 debit authorization signed elsewhere. */
  authorization(authorization: Permit2Authorization): AuthorizedPay {
    return new AuthorizedPay(
      this.ctx,
      this.cycleId,
      {
        assetTransferMethod: "permit2",
        permit2Authorization: authorization.toPayload(),
      },
      TokenRoute.Permit2,
      authorization.fromAddress,
    );
  }

  /**
   * Pay gaslessly through Permit2, failing rather than trying another
   * scheme. Not gasless on its own: without the debtor's one-time
   * `approve(PERMIT2, ...)` this fails with Permit2AllowanceRequiredError.
   */
  async send(): Promise<PayReceipt> {
    const action = await payAction(this.ctx, this.cycleId);
    return submitPermit2Pay(this.ctx, this.cycleId, action, undefined);
  }
}

export class SponsoredPermit2Pay {
  constructor(
    private ctx: ClientCtx,
    private cycleId: string,
  ) {}

  /**
   * Pay through Permit2, signing the missing approval rather than transacting
   * for it. Still costs the debtor nothing.
   */
  async send(): Promise<PayReceipt> {
    const action = await payAction(this.ctx, this.cycleId);
    return paySponsoredPermit2With(this.ctx, this.cycleId, action);
  }
}

export class AuthorizedPay {
  constructor(
    private ctx: ClientCtx,
    private cycleId: string,
    private methodPayload: Record<string, unknown>,
    private route: TokenRoute,
    private debtor: string,
  ) {}

  private request(): Record<string, unknown> {
    return { cycleId: this.cycleId, ...this.methodPayload };
  }

  /** Preflight: runs every check a real submission would run, without spending anyone's gas. */
  async verify(): Promise<void> {
    const response = await this.ctx.facilitator.post(
      "clearing/pay/verify",
      this.request(),
    );
    if (response.isValid) {
      return;
    }
    throw rejectionError(response, response.invalidReason);
  }

  /**
   * Pay the committed net debit with the attached authorization. The
   * submitter needs no signer of their own: the facilitator resolves the
   * debit's terms from core, and the signature fixes whose funds move.
   */
  async send(): Promise<PayReceipt> {
    return submitPay(this.ctx, this.request(), this.route, this.debtor);
  }
}

export class SelfFundedPay {
  constructor(
    private ctx: ClientCtx,
    private cycleId: string,
  ) {}

  /**
   * Approve the settling ClearingHouse to pull exactly the committed debit,
   * which a self-funded ERC-20 pay needs before `send()`. Token, spender and
   * amount all come from the cycle's prepared action.
   */
  async approve(waitOptions?: TxReceiptWaitOptions) {
    const action = checkedPayCall(
      await payAction(this.ctx, this.cycleId),
      this.ctx.signerAddress,
    );
    if (action.assetAddress.toLowerCase() === ZERO_ADDRESS) {
      throw new InvalidParamsError(
        "a native-asset debit needs no approval; its value rides with the " +
          "transaction",
      );
    }
    const gateway = await this.ctx.gateway();
    return gateway.approveErc20(
      action.assetAddress,
      action.amount,
      waitOptions,
      action.contractAddress,
    );
  }

  /**
   * Pay the caller's committed net debit with their own transaction. For
   * ERC-20 cycles, grant the allowance with {@link approve} first — a missing
   * one is refused here rather than left to revert inside the token.
   */
  async send(waitOptions?: TxReceiptWaitOptions): Promise<PayReceipt> {
    const action = await payAction(this.ctx, this.cycleId);
    return paySelfFunded(this.ctx, action, waitOptions);
  }
}

async function payGaslessWith(
  ctx: ClientCtx,
  cycleId: string,
  action: ClearingSettlementActionResponse,
): Promise<PayReceipt> {
  // EIP-3009 is the cheaper route, but nothing says up front whether the
  // token implements it — so try it and read the answer off the rejection,
  // which costs no gas.
  try {
    return await payEip3009With(ctx, cycleId, action);
  } catch (rejection) {
    if (!refusesTheAuthorization(rejection)) {
      throw rejection;
    }
  }
  return paySponsoredPermit2With(ctx, cycleId, action);
}

async function payEip3009With(
  ctx: ClientCtx,
  cycleId: string,
  action: ClearingSettlementActionResponse,
): Promise<PayReceipt> {
  const checked = checkedGaslessPay(action, ctx.signerAddress);
  const authorization = await sig.debitAuthorization(
    ctx,
    checked.assetAddress,
    checked.contractAddress,
    checked.amount,
    checked.cycleId,
  );
  return submitPay(
    ctx,
    {
      cycleId,
      assetTransferMethod: "eip3009",
      authorization: authorization.toPayload(),
    },
    TokenRoute.Eip3009,
    authorization.fromAddress,
  );
}

async function paySponsoredPermit2With(
  ctx: ClientCtx,
  cycleId: string,
  action: ClearingSettlementActionResponse,
): Promise<PayReceipt> {
  // Try the plain route first: the debtor may already have approved, in
  // which case a permit is pointless and only costs the submitter a no-op.
  try {
    return await submitPermit2Pay(ctx, cycleId, action, undefined);
  } catch (rejection) {
    if (
      !(rejection instanceof Permit2AllowanceRequiredError) ||
      rejection.eip2612Nonce === undefined
    ) {
      throw rejection;
    }
    let permit: Eip2612Permit;
    try {
      permit = await sig.eip2612Permit(
        ctx,
        action.assetAddress,
        rejection.eip2612Nonce,
      );
    } catch (err) {
      if (err instanceof MissingTokenDomainSeparatorError) {
        // Without a token domain separator the approval cannot be sponsored
        // from here — the same dead end as a token with no EIP-2612 surface,
        // and reported the same way.
        throw new Permit2AllowanceRequiredError(rejection.message, undefined);
      }
      throw err;
    }
    return submitPermit2Pay(ctx, cycleId, action, permit);
  }
}

async function submitPermit2Pay(
  ctx: ClientCtx,
  cycleId: string,
  action: ClearingSettlementActionResponse,
  permit: Eip2612Permit | undefined,
): Promise<PayReceipt> {
  const checked = checkedGaslessPay(action, ctx.signerAddress);
  const authorization = await sig.debitPermit2Authorization(
    ctx,
    checked.assetAddress,
    checked.contractAddress,
    checked.amount,
    checked.cycleId,
  );
  const request: Record<string, unknown> = {
    cycleId,
    assetTransferMethod: "permit2",
    permit2Authorization: authorization.toPayload(),
  };
  let route = TokenRoute.Permit2;
  if (permit !== undefined) {
    request.eip2612Permit = permit.toPayload();
    route = TokenRoute.SponsoredPermit2;
  }
  return submitPay(ctx, request, route, authorization.fromAddress);
}

async function submitPay(
  ctx: ClientCtx,
  request: Record<string, unknown>,
  route: TokenRoute,
  debtor: string,
): Promise<PayReceipt> {
  const response = await ctx.facilitator.post("clearing/pay", request);
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
    route,
    account: confirmFacilitatorEcho("debtor", response.debtor, debtor),
    network:
      typeof response.network === "string" ? response.network : undefined,
    raw: response,
  };
}

async function paySelfFunded(
  ctx: ClientCtx,
  action: ClearingSettlementActionResponse,
  waitOptions?: TxReceiptWaitOptions,
): Promise<PayReceipt> {
  const checked = checkedPayCall(action, ctx.signerAddress);
  const gateway = await ctx.gateway();

  // Pre-check the ERC-20 allowance the token pull needs, so a debtor who has
  // not approved the ClearingHouse is told exactly that instead of getting an
  // opaque revert from inside the token.
  if (checked.assetAddress.toLowerCase() !== ZERO_ADDRESS) {
    const allowance = await gateway.erc20Allowance(
      checked.assetAddress,
      checked.contractAddress,
    );
    if (allowance < checked.amount) {
      throw new Erc20AllowanceRequiredError({
        token: checked.assetAddress,
        spender: checked.contractAddress,
        allowance,
        needed: checked.amount,
      });
    }
  }

  const receipt = await gateway.payNetDebit(
    checked.contractAddress,
    checked.cycleId as Hex,
    checked.amount,
    proofHex(checked),
    checked.payableValue,
    waitOptions,
  );
  return {
    txHash: receipt.transactionHash,
    route: TokenRoute.SelfFunded,
    account: ctx.signerAddress,
    raw: receipt,
  };
}

// --- claim ----------------------------------------------------------------

/**
 * A net-credit claim being built. Takes no signature on any route: the
 * on-chain payout goes to the address the committed leaf names, for the
 * amount that leaf fixes, so a submitter can neither redirect the payout nor
 * inflate it. The only question is who pays the gas.
 */
export class ClaimBuilder {
  private creditorAddress?: string;

  constructor(
    private ctx: ClientCtx,
    private cycleId: string,
  ) {}

  /**
   * Claim `creditor`'s committed net credit rather than the signer's own,
   * paying them rather than anyone else.
   */
  creditor(creditor: string): ClaimBuilder {
    this.creditorAddress = normalizeAddress(creditor);
    return this;
  }

  private resolvedCreditor(): string {
    return this.creditorAddress ?? this.ctx.signerAddress;
  }

  /** The terms of the creditor's net credit for this cycle. */
  async action(): Promise<ClearingSettlementActionResponse> {
    return this.ctx.rpc.getClearingClaimNetCreditAction(
      this.cycleId,
      this.resolvedCreditor(),
    );
  }

  /** Pin the gasless route: the facilitator submits and pays, with no self-funded fallback. */
  gasless(): GaslessClaim {
    return new GaslessClaim(this.ctx, this.cycleId, this.resolvedCreditor());
  }

  /** Pin the caller's own transaction. */
  selfFunded(): SelfFundedClaim {
    return new SelfFundedClaim(this.ctx, this.cycleId, this.resolvedCreditor());
  }

  /**
   * Claim the committed net credit, gaslessly where possible. A rejection
   * that names the claim itself — an unfunded cycle, say — is returned rather
   * than retried, since the caller's own transaction would revert for the
   * same reason after paying for the privilege.
   */
  async send(waitOptions?: TxReceiptWaitOptions): Promise<ClaimReceipt> {
    if (!this.ctx.facilitator.isConfigured()) {
      return this.selfFunded().send(waitOptions);
    }
    try {
      return await this.gasless().send();
    } catch (err) {
      if (sponsorshipUnavailable(err, NAMES_THE_CLAIM)) {
        return this.selfFunded().send(waitOptions);
      }
      throw err;
    }
  }
}

export class GaslessClaim {
  constructor(
    private ctx: ClientCtx,
    private cycleId: string,
    private creditorAddress: string,
  ) {}

  private request(): Record<string, unknown> {
    return { cycleId: this.cycleId, creditor: this.creditorAddress };
  }

  /** Preflight: runs every check a real submission would run, without spending anyone's gas. */
  async verify(): Promise<void> {
    const response = await this.ctx.facilitator.post(
      "clearing/claim/verify",
      this.request(),
    );
    if (response.isValid) {
      return;
    }
    throw rejectionError(response, response.invalidReason);
  }

  /**
   * Claim the committed net credit gaslessly. Nothing is signed and nothing
   * local is trusted: the facilitator asks core for the committed leaf's
   * terms, so this call can only name *which* claim to submit, not what it
   * pays.
   */
  async send(): Promise<ClaimReceipt> {
    const response = await this.ctx.facilitator.post(
      "clearing/claim",
      this.request(),
    );
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
      account: confirmFacilitatorEcho(
        "creditor",
        response.creditor,
        this.creditorAddress,
      ),
      network:
        typeof response.network === "string" ? response.network : undefined,
      raw: response,
    };
  }
}

export class SelfFundedClaim {
  constructor(
    private ctx: ClientCtx,
    private cycleId: string,
    private creditorAddress: string,
  ) {}

  async send(waitOptions?: TxReceiptWaitOptions): Promise<ClaimReceipt> {
    const action = await this.ctx.rpc.getClearingClaimNetCreditAction(
      this.cycleId,
      this.creditorAddress,
    );
    checkedClaimCall(action, this.creditorAddress);
    const gateway = await this.ctx.gateway();
    const receipt = await gateway.claimNetCreditFor(
      action.contractAddress,
      this.creditorAddress,
      action.cycleId as Hex,
      action.amount,
      proofHex(action),
      waitOptions,
    );
    return {
      txHash: receipt.transactionHash,
      route: Route.SelfFunded,
      account: this.creditorAddress,
      raw: receipt,
    };
  }
}
