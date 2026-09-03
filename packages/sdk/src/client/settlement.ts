/**
 * Settling a clearing cycle: the debtor pays what they owe, the creditor
 * claims what they are owed. Both sides live here because they share a
 * cycle's terms and its proof format.
 *
 * `settlement.pay(cycleId)` and `settlement.claim(cycleId)` capture the
 * intent; a route pin (`selfFunded()` — gasless routes arrive with facilitator
 * sponsorship) narrows how; a terminal (`send()`, `approve()`, `action()`)
 * does it. Terms always come from core's prepared action, never from the
 * caller: this code can only name *which* cycle to settle, not what it pays.
 */

import type { Hex } from "viem";
import type { ClientCtx } from "@/client/ctx";
import {
  type ClaimReceipt,
  confirmEchoed,
  type PayReceipt,
  Route,
  TokenRoute,
} from "@/client/model";
import type { TxReceiptWaitOptions } from "@/contract";
import { Erc20AllowanceRequiredError, InvalidParamsError } from "@/errors";
import { type ClearingSettlementActionResponse, ZERO_ADDRESS } from "@/models";
import { normalizeAddress } from "@/utils";

export class SettlementClient {
  constructor(private ctx: ClientCtx) {}

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

const proofHex = (action: ClearingSettlementActionResponse): Hex[] =>
  action.proof.map((item) => item as Hex);

/** A net-debit payment being built. */
export class PayBuilder {
  constructor(
    protected ctx: ClientCtx,
    protected cycleId: string,
  ) {}

  /**
   * The terms of the caller's net debit: where to pay, how much, and the
   * proof the contract will check.
   */
  async action(): Promise<ClearingSettlementActionResponse> {
    return this.ctx.rpc.getClearingPayNetDebitAction(
      this.cycleId,
      this.ctx.signerAddress,
    );
  }

  /** Pin the caller's own transaction. */
  selfFunded(): SelfFundedPay {
    return new SelfFundedPay(this.ctx, this.cycleId);
  }

  /**
   * Pay the caller's committed net debit with their own transaction.
   * (Facilitator-sponsored gasless routes arrive in a later release; until
   * then the auto route is self-funded.)
   */
  async send(waitOptions?: TxReceiptWaitOptions): Promise<PayReceipt> {
    return this.selfFunded().send(waitOptions);
  }
}

export class SelfFundedPay {
  constructor(
    private ctx: ClientCtx,
    private cycleId: string,
  ) {}

  private async checkedAction(): Promise<ClearingSettlementActionResponse> {
    const action = await this.ctx.rpc.getClearingPayNetDebitAction(
      this.cycleId,
      this.ctx.signerAddress,
    );
    return checkedPayCall(action, this.ctx.signerAddress);
  }

  /**
   * Approve the settling ClearingHouse to pull exactly the committed debit,
   * which a self-funded ERC-20 pay needs before `send()`. Token, spender and
   * amount all come from the cycle's prepared action.
   */
  async approve(waitOptions?: TxReceiptWaitOptions) {
    const action = await this.checkedAction();
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
    const action = await this.checkedAction();
    const gateway = await this.ctx.gateway();

    if (action.assetAddress.toLowerCase() !== ZERO_ADDRESS) {
      const allowance = await gateway.erc20Allowance(
        action.assetAddress,
        action.contractAddress,
      );
      if (allowance < action.amount) {
        throw new Erc20AllowanceRequiredError({
          token: action.assetAddress,
          spender: action.contractAddress,
          allowance,
          needed: action.amount,
        });
      }
    }

    const receipt = await gateway.payNetDebit(
      action.contractAddress,
      action.cycleId as Hex,
      action.amount,
      proofHex(action),
      action.payableValue,
      waitOptions,
    );
    return {
      txHash: receipt.transactionHash,
      route: TokenRoute.SelfFunded,
      account: this.ctx.signerAddress,
      raw: receipt,
    };
  }
}

/**
 * A net-credit claim being built. Takes no signature: the on-chain payout
 * goes to the address the committed leaf names, for the amount that leaf
 * fixes, so a submitter can neither redirect the payout nor inflate it.
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

  /** Pin the caller's own transaction. */
  selfFunded(): SelfFundedClaim {
    return new SelfFundedClaim(this.ctx, this.cycleId, this.resolvedCreditor());
  }

  /**
   * Claim the committed net credit with the caller's own transaction.
   * (Facilitator-sponsored gasless routes arrive in a later release.)
   */
  async send(waitOptions?: TxReceiptWaitOptions): Promise<ClaimReceipt> {
    return this.selfFunded().send(waitOptions);
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
