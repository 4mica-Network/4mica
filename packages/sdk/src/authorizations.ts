/**
 * Gasless authorizations: signed here, redeemed on-chain by a facilitator at
 * its own expense. Each binds the signer, the amount, and a deadline into the
 * digest, so a submitter can alter nothing — the worst they can do is not
 * submit.
 *
 * Wire form is camelCase with uint256/bytes32 values as 0x-prefixed hex,
 * exactly as the Rust SDK serializes them (`sdk-rust/src/contract/mod.rs`).
 * Note an EIP-3009 authorization carries no `to`/`value`: the facilitator
 * derives them from the request it travels in.
 */

import {
  bytesFromHex,
  normalizeAddress,
  normalizeBytes32Hex,
  normalizeHexBytes,
  parseU256,
} from "@/utils";

const hexQuantity = (value: bigint): string => `0x${value.toString(16)}`;

/** EIP-3009 `receiveWithAuthorization`, as signed by the token holder. */
export class ReceiveAuthorization {
  readonly fromAddress: string;
  readonly validAfter: number;
  readonly validBefore: number;
  readonly nonce: string;
  readonly v: number;
  readonly r: string;
  readonly s: string;

  constructor(init: {
    fromAddress: string;
    validAfter: number;
    validBefore: number;
    nonce: string;
    v: number;
    r: string;
    s: string;
  }) {
    this.fromAddress = normalizeAddress(init.fromAddress);
    this.validAfter = Number(init.validAfter);
    this.validBefore = Number(init.validBefore);
    this.nonce = normalizeBytes32Hex(init.nonce);
    this.v = Number(init.v);
    this.r = normalizeBytes32Hex(init.r);
    this.s = normalizeBytes32Hex(init.s);
  }

  toPayload(): Record<string, unknown> {
    return {
      from: this.fromAddress,
      validAfter: hexQuantity(BigInt(this.validAfter)),
      validBefore: hexQuantity(BigInt(this.validBefore)),
      nonce: this.nonce,
      v: this.v,
      r: this.r,
      s: this.s,
    };
  }
}

/** Permit2 `PermitTransferFrom` authorization. */
export class Permit2Authorization {
  readonly fromAddress: string;
  readonly nonce: bigint;
  readonly deadline: number;
  readonly signature: string;

  constructor(init: {
    fromAddress: string;
    nonce: number | bigint | string;
    deadline: number;
    signature: string;
  }) {
    this.fromAddress = normalizeAddress(init.fromAddress);
    this.nonce = parseU256(init.nonce);
    this.deadline = Number(init.deadline);
    this.signature = normalizeHexBytes(init.signature);
  }

  toPayload(): Record<string, unknown> {
    return {
      from: this.fromAddress,
      nonce: hexQuantity(this.nonce),
      deadline: hexQuantity(BigInt(this.deadline)),
      signature: this.signature,
    };
  }
}

/**
 * An EIP-2612 permit granting Permit2 its allowance. `owner` and `spender`
 * are implied — the signer and the canonical Permit2 — so only the signed
 * values travel, as decimal strings.
 */
export class Eip2612Permit {
  readonly value: bigint;
  readonly deadline: number;
  readonly v: number;
  readonly r: string;
  readonly s: string;

  constructor(init: {
    value: number | bigint | string;
    deadline: number;
    v: number;
    r: string;
    s: string;
  }) {
    this.value = parseU256(init.value);
    this.deadline = Number(init.deadline);
    this.v = Number(init.v);
    this.r = normalizeBytes32Hex(init.r);
    this.s = normalizeBytes32Hex(init.s);
  }

  toPayload(): Record<string, unknown> {
    return {
      value: this.value.toString(),
      deadline: String(this.deadline),
      v: this.v,
      r: this.r,
      s: this.s,
    };
  }
}

/**
 * Core4Mica's signed struct for opening a withdrawal request without
 * transacting. The asset, the amount and the window are all bound.
 */
export class WithdrawalRequestAuthorization {
  readonly user: string;
  readonly asset: string;
  readonly amount: bigint;
  readonly validAfter: number;
  readonly validBefore: number;
  readonly nonce: string;
  readonly signature: string;

  constructor(init: {
    user: string;
    asset: string;
    amount: number | bigint | string;
    validAfter: number;
    validBefore: number;
    nonce: string;
    signature: string;
  }) {
    this.user = normalizeAddress(init.user);
    this.asset = normalizeAddress(init.asset);
    this.amount = parseU256(init.amount);
    this.validAfter = Number(init.validAfter);
    this.validBefore = Number(init.validBefore);
    this.nonce = normalizeBytes32Hex(init.nonce);
    this.signature = normalizeHexBytes(init.signature);
  }

  toPayload(): Record<string, unknown> {
    return {
      user: this.user,
      asset: this.asset,
      amount: hexQuantity(this.amount),
      validAfter: hexQuantity(BigInt(this.validAfter)),
      validBefore: hexQuantity(BigInt(this.validBefore)),
      nonce: this.nonce,
      signature: this.signature,
    };
  }
}

/**
 * Core4Mica's signed struct for cancelling a pending withdrawal request.
 * No amount: a cancellation clears whatever request is outstanding.
 */
export class WithdrawalCancelAuthorization {
  readonly user: string;
  readonly asset: string;
  readonly validAfter: number;
  readonly validBefore: number;
  readonly nonce: string;
  readonly signature: string;

  constructor(init: {
    user: string;
    asset: string;
    validAfter: number;
    validBefore: number;
    nonce: string;
    signature: string;
  }) {
    this.user = normalizeAddress(init.user);
    this.asset = normalizeAddress(init.asset);
    this.validAfter = Number(init.validAfter);
    this.validBefore = Number(init.validBefore);
    this.nonce = normalizeBytes32Hex(init.nonce);
    this.signature = normalizeHexBytes(init.signature);
  }

  toPayload(): Record<string, unknown> {
    return {
      user: this.user,
      asset: this.asset,
      validAfter: hexQuantity(BigInt(this.validAfter)),
      validBefore: hexQuantity(BigInt(this.validBefore)),
      nonce: this.nonce,
      signature: this.signature,
    };
  }
}

/**
 * Split a 65-byte signature into `(v, r, s)`, with `v` left in Electrum
 * notation (27/28) as `ecrecover` expects.
 */
export function splitSignature(signature: string | Uint8Array): {
  v: number;
  r: string;
  s: string;
} {
  const raw =
    typeof signature === "string" ? bytesFromHex(signature) : signature;
  if (raw.length !== 65) {
    throw new Error(`expected a 65-byte signature, got ${raw.length}`);
  }
  let v = raw[64];
  if (v === 0 || v === 1) {
    v += 27;
  }
  const hex = (bytes: Uint8Array): string =>
    `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  return { v, r: hex(raw.slice(0, 32)), s: hex(raw.slice(32, 64)) };
}
