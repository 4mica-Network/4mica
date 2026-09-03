/** Client-facing models: assets, routes, receipts, positions. */

import type { TransactionReceipt } from "viem";
import { InvalidParamsError } from "@/errors";
import { ZERO_ADDRESS } from "@/models";
import { normalizeAddress } from "@/utils";

/**
 * Which asset an operation moves. The contract names the asset by its token
 * address, with the zero address standing for native ETH.
 */
export class Asset {
  readonly address: string;

  private constructor(address: string) {
    this.address = address;
  }

  static native(): Asset {
    return new Asset(ZERO_ADDRESS);
  }

  static erc20(token: string): Asset {
    return new Asset(normalizeAddress(token));
  }

  /** Accepts an {@link Asset}, a token address string, or `null`/`undefined` for native ETH. */
  static coerce(value: Asset | string | null | undefined): Asset {
    if (value === null || value === undefined) {
      return Asset.native();
    }
    if (value instanceof Asset) {
      return value;
    }
    return new Asset(normalizeAddress(value));
  }

  get isNative(): boolean {
    return this.address.toLowerCase() === ZERO_ADDRESS;
  }

  /**
   * The token address, or `undefined` for native ETH — the shape the contract
   * gateway's optional-token parameters take.
   */
  get erc20Token(): string | undefined {
    return this.isNative ? undefined : this.address;
  }
}

/** How a contract-verified operation reached the chain. */
export enum Route {
  Gasless = "gasless",
  SelfFunded = "self_funded",
}

/**
 * How a token-moving operation reached the chain. Unlike {@link Route}, the
 * authorization scheme matters here — it decides which tokens qualify.
 */
export enum TokenRoute {
  Eip3009 = "eip3009",
  Permit2 = "permit2",
  SponsoredPermit2 = "sponsored_permit2",
  SelfFunded = "self_funded",
}

/** The signer's standing in one asset, as the contract records it. */
export interface AssetPosition {
  asset: string;
  collateral: bigint;
  withdrawalRequestAmount: bigint;
  withdrawalRequestTimestamp: number;
}

/** The signer's full position in a yield-bearing stablecoin. */
export interface StablecoinPosition {
  asset: string;
  principal: bigint;
  guaranteeCapacity: bigint;
  grossYield: bigint;
  protocolYieldShare: bigint;
  userNetYield: bigint;
  withdrawableBalance: bigint;
  totalUserScaledBalance: bigint;
  protocolScaledBalance: bigint;
  surplusScaledBalance: bigint;
  contractScaledATokenBalance: bigint;
  stablecoinAToken: string;
}

/** Outcome of a deposit, whichever route delivered it. */
export interface DepositReceipt {
  txHash: string;
  route: TokenRoute;
  /** The account credited — always whoever signed, never a facilitator. */
  account: string;
  asset: string;
  amount: bigint;
  network?: string;
  raw?: TransactionReceipt;
}

/** Outcome of a withdrawal request, cancellation or finalization. */
export interface WithdrawReceipt {
  txHash: string;
  route: Route;
  account: string;
  asset: string;
  network?: string;
  raw?: TransactionReceipt;
}

/**
 * Outcome of a net-debit payment. The debit always comes out of the debtor's
 * wallet, whichever route ran.
 */
export interface PayReceipt {
  txHash: string;
  route: TokenRoute;
  account: string;
  network?: string;
  raw?: TransactionReceipt;
}

/**
 * Outcome of a net-credit claim. The payout goes to the address the committed
 * Merkle leaf names, never the submitter.
 */
export interface ClaimReceipt {
  txHash: string;
  route: Route;
  account: string;
  network?: string;
  raw?: TransactionReceipt;
}

/**
 * Check a value a server echoed back against what was asked for, taking the
 * request's own value when the echo is omitted. An echo that disagrees — or
 * cannot be read — means the response describes something nobody asked for,
 * and is refused.
 */
export function confirmEchoed(
  fieldName: string,
  raw: string | null | undefined,
  expected: string,
): string {
  if (raw === null || raw === undefined) {
    return expected;
  }
  if (String(raw).toLowerCase() === expected.toLowerCase()) {
    return expected;
  }
  throw new InvalidParamsError(
    `server echoed ${fieldName} ${raw}, expected ${expected}`,
  );
}
