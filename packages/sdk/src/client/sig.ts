/**
 * EIP-712 authorizations a payer signs instead of transacting. Port of
 * `sdk-rust/src/client/sig.rs`. Signing only touches the network to fetch a
 * token's published domain separator.
 */

import type { Hex } from "viem";
import {
  Eip2612Permit,
  Permit2Authorization,
  ReceiveAuthorization,
  splitSignature,
  WithdrawalCancelAuthorization,
  WithdrawalRequestAuthorization,
} from "@/authorizations";
import type { ClientCtx } from "@/client/ctx";
import {
  digestForCancelWithdrawal,
  digestForPermit,
  digestForPermit2Transfer,
  digestForReceiveAuthorization,
  digestForRequestWithdrawal,
  PERMIT2_ADDRESS,
} from "@/digest";
import { hexFromBytes, parseU256, randomU256 } from "@/utils";

/** How long a signed authorization stays redeemable. */
export const AUTHORIZATION_TTL_SECS = 3600;

// An unlimited EIP-2612 allowance, deliberately: it only lets Permit2 act,
// and Permit2 still requires a signed PermitTransferFrom per transfer. A
// tight allowance would just force another permit on the next deposit, at
// the submitter's expense.
const UNLIMITED = 2n ** 256n - 1n;

const now = (): number => Math.max(Math.floor(Date.now() / 1000), 0);

const validBefore = (): number => now() + AUTHORIZATION_TTL_SECS;

const randomNonce = (): string =>
  `0x${randomU256().toString(16).padStart(64, "0")}`;

/**
 * Sign an EIP-3009 `receiveWithAuthorization` crediting `amount` of `token`
 * to the signer via the Core4Mica contract. Only tokens implementing EIP-3009
 * (USDC and similar) can redeem this.
 */
export async function eip3009Authorization(
  ctx: ClientCtx,
  token: string,
  amount: bigint,
): Promise<ReceiveAuthorization> {
  return receiveAuthorization(
    ctx,
    token,
    ctx.contractAddress,
    amount,
    randomNonce(),
  );
}

/**
 * Sign an EIP-3009 authorization paying the signer's net debit to `receiver`
 * (the ClearingHouse), with the nonce pinned to the cycle id as
 * `payNetDebitWithAuthorization` requires.
 */
export async function debitAuthorization(
  ctx: ClientCtx,
  token: string,
  receiver: string,
  amount: bigint,
  cycleId: string,
): Promise<ReceiveAuthorization> {
  return receiveAuthorization(ctx, token, receiver, amount, cycleId);
}

async function receiveAuthorization(
  ctx: ClientCtx,
  token: string,
  to: string,
  amount: bigint,
  nonce: string,
): Promise<ReceiveAuthorization> {
  const domainSeparator = await ctx.tokenDomainSeparator(token);
  const deadline = validBefore();
  const digest = digestForReceiveAuthorization(
    domainSeparator,
    ctx.signerAddress,
    to,
    amount,
    0,
    deadline,
    nonce,
  );
  const { v, r, s } = splitSignature(await ctx.signHash(digest));
  return new ReceiveAuthorization({
    fromAddress: ctx.signerAddress,
    validAfter: 0,
    validBefore: deadline,
    nonce,
    v,
    r,
    s,
  });
}

/**
 * Sign a Permit2 `PermitTransferFrom` for a deposit, with a random nonce.
 * Works for any ERC-20, but only if the signer has already approved Permit2
 * to move that token.
 */
export async function permit2Authorization(
  ctx: ClientCtx,
  token: string,
  amount: bigint,
): Promise<Permit2Authorization> {
  return permit2AuthorizationFor(
    ctx,
    token,
    ctx.contractAddress,
    amount,
    randomU256(),
  );
}

/**
 * Sign a Permit2 `PermitTransferFrom` paying the signer's net debit, with the
 * nonce pinned to `uint256(cycleId)` as `payNetDebitWithPermit2` requires.
 */
export async function debitPermit2Authorization(
  ctx: ClientCtx,
  token: string,
  receiver: string,
  amount: bigint,
  cycleId: string,
): Promise<Permit2Authorization> {
  return permit2AuthorizationFor(
    ctx,
    token,
    receiver,
    amount,
    parseU256(cycleId),
  );
}

async function permit2AuthorizationFor(
  ctx: ClientCtx,
  token: string,
  spender: string,
  amount: bigint,
  nonce: bigint,
): Promise<Permit2Authorization> {
  const deadline = validBefore();
  const digest = digestForPermit2Transfer(
    ctx.permit2DomainSeparator,
    token,
    amount,
    spender,
    nonce,
    deadline,
  );
  const signature = await ctx.signHash(digest);
  return new Permit2Authorization({
    fromAddress: ctx.signerAddress,
    nonce,
    deadline,
    signature: hexFromBytes(signature),
  });
}

/**
 * Sign an EIP-2612 permit granting Permit2 an unlimited allowance for
 * `token`. `nonce` must be the owner's current one, which arrives with the
 * facilitator's `PERMIT2_ALLOWANCE_REQUIRED` rejection.
 */
export async function eip2612Permit(
  ctx: ClientCtx,
  token: string,
  nonce: bigint,
): Promise<Eip2612Permit> {
  const deadline = validBefore();
  const domainSeparator = await ctx.tokenDomainSeparator(token);
  const digest = digestForPermit(
    domainSeparator,
    ctx.signerAddress,
    PERMIT2_ADDRESS,
    UNLIMITED,
    nonce,
    deadline,
  );
  const { v, r, s } = splitSignature(await ctx.signHash(digest));
  return new Eip2612Permit({ value: UNLIMITED, deadline, v, r, s });
}

/**
 * Sign a `RequestWithdrawal` authorization for `amount` of `asset` (the zero
 * address for ETH) under Core4Mica's own domain.
 */
export async function requestWithdrawalAuthorization(
  ctx: ClientCtx,
  asset: string,
  amount: bigint,
): Promise<WithdrawalRequestAuthorization> {
  const deadline = validBefore();
  const nonce = randomNonce();
  const digest = digestForRequestWithdrawal(
    ctx.coreDomainSeparator,
    ctx.signerAddress,
    asset,
    amount,
    0,
    deadline,
    nonce,
  );
  const signature = await ctx.signHash(digest as Hex);
  return new WithdrawalRequestAuthorization({
    user: ctx.signerAddress,
    asset,
    amount,
    validAfter: 0,
    validBefore: deadline,
    nonce,
    signature: hexFromBytes(signature),
  });
}

/** Sign a `CancelWithdrawal` authorization for the pending request on `asset`. */
export async function cancelWithdrawalAuthorization(
  ctx: ClientCtx,
  asset: string,
): Promise<WithdrawalCancelAuthorization> {
  const deadline = validBefore();
  const nonce = randomNonce();
  const digest = digestForCancelWithdrawal(
    ctx.coreDomainSeparator,
    ctx.signerAddress,
    asset,
    0,
    deadline,
    nonce,
  );
  const signature = await ctx.signHash(digest as Hex);
  return new WithdrawalCancelAuthorization({
    user: ctx.signerAddress,
    asset,
    validAfter: 0,
    validBefore: deadline,
    nonce,
    signature: hexFromBytes(signature),
  });
}
