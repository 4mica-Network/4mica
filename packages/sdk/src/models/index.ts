/**
 * Wire types mirroring the core service's `rpc-4mica` crate.
 *
 * Core serializes snake_case JSON (`SiweTemplate` in `auth/` is the one
 * camelCase exception); `fromRpc` parsers accept both spellings defensively.
 * U256 amounts arrive either as 0x-prefixed hex (`UserTransactionInfo`,
 * `AssetBalanceInfo`) or as decimal strings (clearing proofs and actions);
 * `parseU256` accepts both.
 */

import type { Hex } from "viem";
import {
  type CheckpointMismatchError,
  type CheckpointRequiredError,
  type CycleMismatchError,
  type FutureTimestampError,
  InvalidParamsError,
  type StaleTimestampError,
  type TimestampNotPastCutoffError,
} from "@/errors";
import {
  type CheckpointPayloadLike,
  checkpointSigningDigest,
  type FourMicaEip712Domain,
  type PaymentPayloadLike,
  paymentSigningDigest,
} from "@/guarantee";
import { getAny, isRecord } from "@/serde";
import {
  hexFromBytes,
  normalizeAddress,
  normalizeBytes32Hex,
  normalizeHexBytes,
  parseU256,
  serializeU256,
  ValidationError,
} from "@/utils";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Current payment payload version. Clients always sign at this version; core
 * accepts every version it advertises so older clients keep working.
 */
export const PAYMENT_PAYLOAD_VERSION = 1;

/** Payment payload versions this SDK can read, keyed by their wire tag. */
const PAYLOAD_VERSION_TAGS: Record<string, number> = {
  v1: PAYMENT_PAYLOAD_VERSION,
};

const U64_MAX = 2n ** 64n - 1n;

/**
 * An agreement, signed by the payer, that a guarantee only becomes payable
 * once an external validator approves it.
 */
export class ValidationRequirement {
  readonly validator: string;
  /** 0x-prefixed bytes32 the validator must approve. */
  readonly subject: string;
  /** Unix seconds; core tightens this to the cycle's resolution cutoff. */
  readonly deadline?: number;
  /** 0x-prefixed validator-specific policy bytes. */
  readonly params: string;

  constructor(init: {
    validator: string;
    subject: string;
    deadline?: number | null;
    params?: string | null;
  }) {
    this.validator = String(init.validator);
    this.subject = normalizeBytes32Hex(init.subject);
    this.deadline =
      init.deadline === undefined || init.deadline === null
        ? undefined
        : Number(init.deadline);
    this.params = normalizeHexBytes(init.params || "0x");
  }

  toPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      validator: this.validator,
      subject: this.subject,
    };
    if (this.deadline !== undefined) {
      payload.deadline = this.deadline;
    }
    if (this.params !== "" && this.params !== "0x") {
      payload.params = this.params;
    }
    return payload;
  }

  static fromRpc(raw: Record<string, unknown>): ValidationRequirement {
    return new ValidationRequirement({
      validator: String(getAny(raw, "validator")),
      subject: String(getAny(raw, "subject")),
      deadline: getAny<number | null>(raw, "deadline"),
      params: String(getAny(raw, "params") ?? "0x"),
    });
  }
}

type U256Like = number | bigint | string;
type Bytes32Like = string | Uint8Array;

/**
 * Validates an address a signed payload carries, keeping its spelling: the
 * payload is what the payer signed over, and a resource server may compare
 * the recipient as a string.
 */
function payloadAddress(field: string, raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!/^0[xX][0-9a-fA-F]{40}$/.test(value)) {
    throw new ValidationError(`invalid ${field} address: ${String(raw)}`);
  }
  return value;
}

function bytes32(field: string, raw: Bytes32Like): string {
  if (raw instanceof Uint8Array) {
    if (raw.length !== 32) {
      throw new ValidationError(
        `${field}: expected 32 bytes, got ${raw.length}`,
      );
    }
    return hexFromBytes(raw);
  }
  try {
    return normalizeBytes32Hex(String(raw));
  } catch {
    throw new ValidationError(`invalid ${field}: ${String(raw)}`);
  }
}

function u64(field: string, raw: unknown): number {
  const value = parseU256(raw as U256Like);
  if (value > U64_MAX) {
    throw new ValidationError(`${field} out of u64 range: ${String(raw)}`);
  }
  return Number(value);
}

function required(raw: Record<string, unknown>, what: string, key: string) {
  const value = raw[key];
  if (value === undefined || value === null) {
    throw new InvalidParamsError(`${what} is missing ${key}`);
  }
  return value;
}

/** Re-throws a validation failure as the parse error of `what`. */
function parsing<T>(what: string, build: () => T): T {
  try {
    return build();
  } catch (err) {
    if (err instanceof InvalidParamsError) throw err;
    throw new InvalidParamsError(
      `invalid ${what}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * V1 payment request payload.
 *
 * What the payer's wallet signs is the `PaymentAuthorization` derived from
 * these: the collateral-relevant fields plus a commitment to the recipient.
 * The recipient, the `salt` that blinds it and any validation requirement
 * travel alongside as the commitment's opening, so core can check them while
 * the on-chain default path never sees them. Build one with
 * `client.payment.newPayment`, which scopes it to the live cycle.
 */
export class PaymentRequestPayload implements PaymentPayloadLike {
  readonly userAddress: string;
  readonly recipientAddress: string;
  /** On-chain bytes32 settlement cycle id the authorization is scoped to. */
  readonly cycleId: string;
  readonly reqId: bigint;
  readonly amount: bigint;
  readonly assetAddress: string;
  readonly timestamp: number;
  /**
   * Random bytes32 blinding the recipient commitment. Must be unpredictable,
   * or the recipient can be recovered by trying candidates.
   */
  readonly salt: string;
  /** Present ⇒ the guarantee is validation-gated. Absent ⇒ payable at issuance. */
  readonly validation?: ValidationRequirement;

  constructor(init: {
    userAddress: string;
    recipientAddress: string;
    cycleId: Bytes32Like;
    reqId: U256Like;
    amount: U256Like;
    assetAddress: string;
    timestamp: number | bigint | string;
    salt: Bytes32Like;
    validation?: ValidationRequirement;
  }) {
    this.userAddress = payloadAddress("user", init.userAddress);
    this.recipientAddress = payloadAddress("recipient", init.recipientAddress);
    this.cycleId = bytes32("cycle id", init.cycleId);
    this.reqId = parseU256(init.reqId);
    this.amount = parseU256(init.amount);
    this.assetAddress = payloadAddress("asset", init.assetAddress);
    this.timestamp = u64("timestamp", init.timestamp);
    this.salt = bytes32("salt", init.salt);
    this.validation = init.validation;
  }

  /**
   * A payload at the current version. `salt` defaults to fresh random bytes,
   * which is what it must be outside of test vectors.
   */
  static new(init: {
    userAddress: string;
    recipientAddress: string;
    cycleId: Bytes32Like;
    reqId: U256Like;
    amount: U256Like;
    timestamp: number;
    erc20Token?: string | null;
    salt?: Bytes32Like;
  }): PaymentRequestPayload {
    const salt =
      init.salt ?? globalThis.crypto.getRandomValues(new Uint8Array(32));
    return new PaymentRequestPayload({
      userAddress: init.userAddress,
      recipientAddress: init.recipientAddress,
      cycleId: init.cycleId,
      reqId: init.reqId,
      amount: init.amount,
      assetAddress: init.erc20Token || ZERO_ADDRESS,
      timestamp: init.timestamp,
      salt,
    });
  }

  get version(): number {
    return PAYMENT_PAYLOAD_VERSION;
  }

  /** A copy with `overrides` applied. */
  with(
    overrides: Partial<ConstructorParameters<typeof PaymentRequestPayload>[0]>,
  ): PaymentRequestPayload {
    return new PaymentRequestPayload({ ...this, ...overrides });
  }

  withValidation(validation: ValidationRequirement): PaymentRequestPayload {
    return this.with({ validation });
  }

  /** The digest the payer's wallet signs, under the ClearingHouse domain. */
  signingDigest(domain: FourMicaEip712Domain): Hex {
    return paymentSigningDigest(domain, this);
  }

  toPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      version: "v1",
      user_address: this.userAddress,
      recipient_address: this.recipientAddress,
      cycle_id: this.cycleId,
      req_id: serializeU256(this.reqId),
      amount: serializeU256(this.amount),
      asset_address: this.assetAddress,
      timestamp: this.timestamp,
      salt: this.salt,
    };
    if (this.validation !== undefined) {
      payload.validation = this.validation.toPayload();
    }
    return payload;
  }

  /**
   * Parse a tagged payload. The version tag is what selects a layout, so a
   * payload without one, or with one this SDK does not know, is refused
   * rather than defaulted.
   */
  static fromRpc(raw: unknown): PaymentRequestPayload {
    if (!isRecord(raw)) {
      throw new InvalidParamsError("payment payload must be an object");
    }
    const tag = raw.version;
    if (tag === undefined || tag === null) {
      throw new InvalidParamsError(
        "payment payload is missing its version tag",
      );
    }
    if (typeof tag !== "string" || !(tag in PAYLOAD_VERSION_TAGS)) {
      throw new InvalidParamsError(
        `unsupported payment payload version: ${String(tag)}`,
      );
    }
    const what = "payment payload";
    return parsing(what, () => {
      const validation = raw.validation;
      return new PaymentRequestPayload({
        userAddress: String(required(raw, what, "user_address")),
        recipientAddress: String(required(raw, what, "recipient_address")),
        cycleId: String(required(raw, what, "cycle_id")),
        reqId: required(raw, what, "req_id") as U256Like,
        amount: required(raw, what, "amount") as U256Like,
        assetAddress: String(required(raw, what, "asset_address")),
        timestamp: required(raw, what, "timestamp") as number,
        salt: String(required(raw, what, "salt")),
        validation: isRecord(validation)
          ? ValidationRequirement.fromRpc(validation)
          : undefined,
      });
    });
  }
}

/**
 * A payer-signed payment request: EIP-712 over the payload's
 * `PaymentAuthorization`, under the ClearingHouse domain.
 */
export class PaymentRequest {
  constructor(
    readonly payload: PaymentRequestPayload,
    /** 65-byte signature as 0x-prefixed hex. */
    readonly signature: string,
  ) {}

  toPayload(): { payload: Record<string, unknown>; signature: string } {
    return { payload: this.payload.toPayload(), signature: this.signature };
  }

  static fromRpc(raw: unknown): PaymentRequest {
    if (!isRecord(raw)) {
      throw new InvalidParamsError("payment request must be an object");
    }
    return new PaymentRequest(
      PaymentRequestPayload.fromRpc(
        required(raw, "payment request", "payload"),
      ),
      String(required(raw, "payment request", "signature")),
    );
  }
}

/**
 * A payer's cumulative authorization for one cycle and asset, as signed by
 * the payer. Covers every one of the payer's authorizations in the cycle
 * stamped at or below `timestampCutoff`.
 */
export class CheckpointPayload implements CheckpointPayloadLike {
  readonly payer: string;
  /** On-chain bytes32 settlement cycle id. */
  readonly cycleId: string;
  readonly assetAddress: string;
  readonly cumulativeGross: bigint;
  readonly timestampCutoff: number;

  constructor(init: {
    payer: string;
    cycleId: Bytes32Like;
    assetAddress: string;
    cumulativeGross: U256Like;
    timestampCutoff: number | bigint | string;
  }) {
    this.payer = payloadAddress("payer", init.payer);
    this.cycleId = bytes32("cycle id", init.cycleId);
    this.assetAddress = payloadAddress("asset", init.assetAddress);
    this.cumulativeGross = parseU256(init.cumulativeGross);
    this.timestampCutoff = u64("timestamp cutoff", init.timestampCutoff);
  }

  /** The digest the payer's wallet signs, under the ClearingHouse domain. */
  signingDigest(domain: FourMicaEip712Domain): Hex {
    return checkpointSigningDigest(domain, this);
  }

  toPayload(): Record<string, unknown> {
    return {
      payer: this.payer,
      cycle_id: this.cycleId,
      asset_address: this.assetAddress,
      cumulative_gross: serializeU256(this.cumulativeGross),
      timestamp_cutoff: this.timestampCutoff,
    };
  }

  static fromRpc(raw: unknown): CheckpointPayload {
    const what = "checkpoint";
    if (!isRecord(raw))
      throw new InvalidParamsError(`${what} must be an object`);
    return parsing(
      what,
      () =>
        new CheckpointPayload({
          payer: String(required(raw, what, "payer")),
          cycleId: String(required(raw, what, "cycle_id")),
          assetAddress: String(required(raw, what, "asset_address")),
          cumulativeGross: required(raw, what, "cumulative_gross") as U256Like,
          timestampCutoff: required(raw, what, "timestamp_cutoff") as number,
        }),
    );
  }
}

/** A checkpoint with the payer's EIP-712 signature, under the ClearingHouse domain. */
export class SignedCheckpoint {
  constructor(
    readonly payload: CheckpointPayload,
    /** 65-byte signature as 0x-prefixed hex. */
    readonly signature: string,
  ) {}

  toPayload(): { payload: Record<string, unknown>; signature: string } {
    return { payload: this.payload.toPayload(), signature: this.signature };
  }

  static fromRpc(raw: unknown): SignedCheckpoint {
    if (!isRecord(raw)) {
      throw new InvalidParamsError("signed checkpoint must be an object");
    }
    return new SignedCheckpoint(
      CheckpointPayload.fromRpc(required(raw, "signed checkpoint", "payload")),
      String(required(raw, "signed checkpoint", "signature")),
    );
  }
}

/** `GET /core/cycles/active?asset=`: the cycle a payment must be signed for now. */
export class ActiveCycleResponse {
  constructor(
    /** On-chain bytes32 cycle id, the value a payment request is signed with. */
    readonly cycleId: string,
    readonly cycleIdText: string,
    readonly assetAddress: string,
    /** Unix seconds; a payment stamped earlier is refused as stale. */
    readonly periodStart: number,
    /** Unix seconds; core opens the next cycle from this moment on. */
    readonly periodEnd: number,
    /** Core's clock, unix seconds. Zero from a core that predates it. */
    readonly serverTime: number = 0,
    /**
     * How many guarantees a payer may hold past its latest checkpoint before
     * core refuses the next with `CHECKPOINT_REQUIRED`. Zero from a core that
     * predates it.
     */
    readonly maxUncheckpointed: number = 0,
  ) {}

  static fromRpc(raw: unknown): ActiveCycleResponse {
    const what = "active cycle";
    if (!isRecord(raw))
      throw new InvalidParamsError(`${what} must be an object`);
    return parsing(
      what,
      () =>
        new ActiveCycleResponse(
          bytes32("cycle id", String(required(raw, what, "cycle_id"))),
          String(raw.cycle_id_text ?? ""),
          String(required(raw, what, "asset_address")),
          u64("period_start", required(raw, what, "period_start")),
          u64("period_end", required(raw, what, "period_end")),
          u64("server_time", raw.server_time ?? 0),
          Number(raw.max_uncheckpointed ?? 0),
        ),
    );
  }
}

/**
 * `GET /core/payers/{payer}/checkpoint-batch`: what a payer needs to sign its
 * next checkpoint. Untrusted until checked — see
 * `PaymentClient.checkpointCycle`.
 */
export class CheckpointBatchResponse {
  constructor(
    readonly cycleId: string,
    readonly cycleIdText: string,
    readonly assetAddress: string,
    readonly payer: string,
    /** The latest accepted checkpoint, which the next one extends. */
    readonly previous: SignedCheckpoint | undefined,
    /** Every accepted authorization newer than `previous`. */
    readonly authorizations: PaymentRequest[],
    readonly maxUncheckpointed: number = 0,
  ) {}

  static fromRpc(raw: unknown): CheckpointBatchResponse {
    const what = "checkpoint batch";
    if (!isRecord(raw))
      throw new InvalidParamsError(`${what} must be an object`);
    return parsing(what, () => {
      const authorizations = raw.authorizations;
      return new CheckpointBatchResponse(
        bytes32("cycle id", String(required(raw, what, "cycle_id"))),
        String(raw.cycle_id_text ?? ""),
        String(required(raw, what, "asset_address")),
        String(required(raw, what, "payer")),
        isRecord(raw.previous)
          ? SignedCheckpoint.fromRpc(raw.previous)
          : undefined,
        (Array.isArray(authorizations) ? authorizations : []).map((item) =>
          PaymentRequest.fromRpc(item),
        ),
        Number(raw.max_uncheckpointed ?? 0),
      );
    });
  }
}

/** `POST /core/checkpoints`: the checkpoint core now holds. */
export class CheckpointAcceptedResponse {
  constructor(
    readonly cycleId: string,
    readonly cycleIdText: string,
    readonly assetAddress: string,
    readonly payer: string,
    readonly cumulativeGross: bigint,
    readonly timestampCutoff: number,
    /**
     * Authorizations this checkpoint newly covers. Zero when it repeats the
     * latest accepted one, which core accepts rather than refuses.
     */
    readonly covered: number,
  ) {}

  static fromRpc(raw: unknown): CheckpointAcceptedResponse {
    const what = "accepted checkpoint";
    if (!isRecord(raw))
      throw new InvalidParamsError(`${what} must be an object`);
    return parsing(
      what,
      () =>
        new CheckpointAcceptedResponse(
          bytes32("cycle id", String(required(raw, what, "cycle_id"))),
          String(raw.cycle_id_text ?? ""),
          String(required(raw, what, "asset_address")),
          String(required(raw, what, "payer")),
          parseU256(required(raw, what, "cumulative_gross") as U256Like),
          u64("timestamp_cutoff", required(raw, what, "timestamp_cutoff")),
          Number(raw.covered ?? 0),
        ),
    );
  }
}

// --- details core attaches to its coded refusals -------------------------
//
// Shapes from `crates/rpc/src/core.rs`, camelCased. Ids stay as core spelled
// them. Each parser returns `undefined` for absent or malformed details, so a
// refusal whose details cannot be read stays a plain RPC error.

type FieldKind = "string" | "number" | "bigint";

function refusalDetails<T>(
  raw: unknown,
  fields: Record<string, [wire: string, kind: FieldKind, fallback?: unknown]>,
): T | undefined {
  if (!isRecord(raw)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [name, [wire, kind, fallback]] of Object.entries(fields)) {
    const value = raw[wire];
    if (value === undefined || value === null) {
      if (fallback === undefined) return undefined;
      out[name] = fallback;
      continue;
    }
    try {
      out[name] =
        kind === "string"
          ? String(value)
          : kind === "bigint"
            ? parseU256(value as U256Like)
            : Number(parseU256(value as U256Like));
    } catch {
      return undefined;
    }
  }
  return out as T;
}

export const parseCheckpointRequiredDetails = (raw: unknown) =>
  refusalDetails<CheckpointRequiredError["details"]>(raw, {
    cycleId: ["cycle_id", "string"],
    cycleIdText: ["cycle_id_text", "string"],
    assetAddress: ["asset_address", "string"],
    payer: ["payer", "string"],
    uncheckpointed: ["uncheckpointed", "number"],
    maxUncheckpointed: ["max_uncheckpointed", "number"],
  });

export const parseTimestampNotPastCutoffDetails = (raw: unknown) =>
  refusalDetails<TimestampNotPastCutoffError["details"]>(raw, {
    cycleId: ["cycle_id", "string"],
    cycleIdText: ["cycle_id_text", "string"],
    assetAddress: ["asset_address", "string"],
    payer: ["payer", "string"],
    timestamp: ["timestamp", "number"],
    timestampCutoff: ["timestamp_cutoff", "number"],
    cumulativeGross: ["cumulative_gross", "bigint"],
    serverTime: ["server_time", "number"],
  });

export const parseCycleMismatchDetails = (raw: unknown) =>
  refusalDetails<CycleMismatchError["details"]>(raw, {
    signedCycleId: ["signed_cycle_id", "string"],
    activeCycleId: ["active_cycle_id", "string"],
    activeCycleIdText: ["active_cycle_id_text", "string"],
    activePeriodEnd: ["active_period_end", "number"],
    serverTime: ["server_time", "number", 0],
  });

export const parseFutureTimestampDetails = (raw: unknown) =>
  refusalDetails<FutureTimestampError["details"]>(raw, {
    timestamp: ["timestamp", "number"],
    serverTime: ["server_time", "number"],
  });

export const parseStaleTimestampDetails = (raw: unknown) =>
  refusalDetails<StaleTimestampError["details"]>(raw, {
    cycleId: ["cycle_id", "string"],
    cycleIdText: ["cycle_id_text", "string"],
    timestamp: ["timestamp", "number"],
    periodStart: ["period_start", "number"],
    periodEnd: ["period_end", "number"],
    serverTime: ["server_time", "number"],
  });

export const parseCheckpointMismatchDetails = (raw: unknown) =>
  refusalDetails<CheckpointMismatchError["details"]>(raw, {
    cycleId: ["cycle_id", "string"],
    cycleIdText: ["cycle_id_text", "string"],
    assetAddress: ["asset_address", "string"],
    payer: ["payer", "string"],
  });

/** Static parameters exposed by the core service (`GET /core/public-params`). */
export class CorePublicParameters {
  constructor(
    /** The on-chain Treasury (collateral vault) contract. */
    public contractAddress: string,
    /** EIP-712 domain name for payer-signed payloads; always `4micaClearingHouse`. */
    public eip712Name: string,
    public eip712Version: string,
    public chainId: number,
    /**
     * The address whose signature attests the operator's guarantee receipts,
     * as registered on-chain for the layout core signs.
     */
    public guaranteeSigner: string = "",
    /** Verifying contract of the domain guarantee receipts are signed under. */
    public guaranteeRegistryAddress: string = "",
    /**
     * Verifying contract of the domain every payer-signed payload (payment
     * request, checkpoint) is signed under.
     */
    public clearingHouseAddress: string = "",
    public ethereumHttpRpcUrl: string = "",
    public supportedPaymentPayloadVersions: number[] = [
      PAYMENT_PAYLOAD_VERSION,
    ],
    /** The Treasury's own EIP-712 `DOMAIN_SEPARATOR()`, read on-chain by core. */
    public coreDomainSeparator: string = "",
    /** Validators this operator whitelisted. */
    public validators: string[] = [],
  ) {}

  static fromRpc(payload: Record<string, unknown>): CorePublicParameters {
    const require = (...keys: string[]): unknown => {
      const value = getAny(payload, ...keys);
      if (value === undefined || value === null) {
        throw new InvalidParamsError(
          `missing core public parameter: ${keys[0]}`,
        );
      }
      return value;
    };
    const optional = (...keys: string[]): string =>
      String(getAny(payload, ...keys) ?? "");

    // Absent means a core that predates the field, which accepts what this
    // SDK signs; present-but-empty means a core that accepts nothing.
    const versionsRaw = getAny(
      payload,
      "supported_payment_payload_versions",
      "supportedPaymentPayloadVersions",
    );
    const versions = Array.isArray(versionsRaw)
      ? versionsRaw.map((version) => Number(version))
      : [PAYMENT_PAYLOAD_VERSION];

    const coreDomainSeparatorRaw = optional(
      "core_domain_separator",
      "coreDomainSeparator",
    );

    return new CorePublicParameters(
      String(require("contract_address", "contractAddress")),
      String(require("eip712_name", "eip712Name")),
      String(require("eip712_version", "eip712Version")),
      Number(require("chain_id", "chainId")),
      optional("guarantee_signer", "guaranteeSigner"),
      optional("guarantee_registry_address", "guaranteeRegistryAddress"),
      optional("clearing_house_address", "clearingHouseAddress"),
      optional("ethereum_http_rpc_url", "ethereumHttpRpcUrl"),
      versions,
      coreDomainSeparatorRaw ? normalizeBytes32Hex(coreDomainSeparatorRaw) : "",
      ((getAny(payload, "validators") ?? []) as unknown[]).map(String),
    );
  }
}

export interface SupportedTokenInfo {
  symbol: string;
  address: string;
  decimals?: number;
  /**
   * The token's own EIP-712 `DOMAIN_SEPARATOR()`, relayed by core so clients
   * can build gasless-deposit signatures without an Ethereum RPC. `undefined`
   * for tokens that do not expose one.
   */
  domainSeparator?: string;
}

export class SupportedTokensResponse {
  constructor(
    public chainId: number,
    public tokens: SupportedTokenInfo[],
  ) {}

  static fromRpc(raw: Record<string, unknown>): SupportedTokensResponse {
    const tokensRaw = getAny(raw, "tokens");
    const tokens: SupportedTokenInfo[] = [];
    if (Array.isArray(tokensRaw)) {
      for (const token of tokensRaw as Record<string, unknown>[]) {
        const address = getAny(token, "address");
        if (typeof address !== "string" || address.length === 0) continue;
        const decimals = getAny(token, "decimals");
        const domainSeparator = getAny(
          token,
          "domain_separator",
          "domainSeparator",
        );
        tokens.push({
          symbol: String(getAny(token, "symbol") ?? ""),
          address,
          decimals:
            decimals === undefined || decimals === null
              ? undefined
              : Number(decimals),
          domainSeparator:
            domainSeparator === undefined || domainSeparator === null
              ? undefined
              : String(domainSeparator),
        });
      }
    }
    return new SupportedTokensResponse(
      Number(getAny(raw, "chain_id", "chainId") ?? 0),
      tokens,
    );
  }
}

/** Role a participant holds in a settlement cycle. Flat participants have neither. */
export type ClearingParticipantRole = "NET_DEBTOR" | "NET_CREDITOR";

/** Off-chain clearing settlement action prepared by core. */
export type ClearingSettlementAction = "pay_net_debit" | "claim_net_credit";

/** A participant's committed Merkle leaf and proof for one clearing cycle. */
export class ClearingParticipantProof {
  constructor(
    /** On-chain `bytes32` cycle identifier. */
    public cycleId: string,
    /** Core database cycle identifier (`{asset}:{period_start}`). */
    public cycleIdText: string,
    public assetAddress: string,
    public participant: string,
    public role: ClearingParticipantRole,
    /** Amount used with the participant's role-specific ClearingHouse call. */
    public amount: bigint,
    public netDebit: bigint,
    public netCredit: bigint,
    public leaf: string,
    public merkleRoot: string,
    public proof: string[],
  ) {}

  static fromRpc(raw: Record<string, unknown>): ClearingParticipantProof {
    try {
      const proofRaw = getAny(raw, "proof") ?? [];
      return new ClearingParticipantProof(
        normalizeBytes32Hex(String(getAny(raw, "cycle_id", "cycleId"))),
        String(getAny(raw, "cycle_id_text", "cycleIdText")),
        normalizeAddress(String(getAny(raw, "asset_address", "assetAddress"))),
        normalizeAddress(String(getAny(raw, "participant"))),
        String(getAny(raw, "role")) as ClearingParticipantRole,
        parseU256((getAny(raw, "amount") ?? 0) as number | bigint | string),
        parseU256(
          (getAny(raw, "net_debit", "netDebit") ?? 0) as
            | number
            | bigint
            | string,
        ),
        parseU256(
          (getAny(raw, "net_credit", "netCredit") ?? 0) as
            | number
            | bigint
            | string,
        ),
        normalizeBytes32Hex(String(getAny(raw, "leaf"))),
        normalizeBytes32Hex(String(getAny(raw, "merkle_root", "merkleRoot"))),
        (Array.isArray(proofRaw) ? proofRaw : []).map((item) =>
          normalizeBytes32Hex(String(item)),
        ),
      );
    } catch (err) {
      if (err instanceof InvalidParamsError) throw err;
      throw new InvalidParamsError(`invalid clearing proof: ${String(err)}`);
    }
  }
}

/** A ClearingHouse call prepared by core from a participant's committed leaf. */
export class ClearingSettlementActionResponse {
  constructor(
    /** ClearingHouse contract address. */
    public contractAddress: string,
    /** Contract function name to call (`payNetDebit` / `claimNetCreditFor`). */
    public functionName: string,
    public action: ClearingSettlementAction,
    /** On-chain `bytes32` cycle identifier. */
    public cycleId: string,
    public cycleIdText: string,
    public assetAddress: string,
    /** Participant whose committed Merkle leaf is proven. */
    public participant: string,
    public amount: bigint,
    /** Native value to attach; non-zero only for native-asset debtor payments. */
    public payableValue: bigint,
    public proof: string[],
  ) {}

  static fromRpc(
    raw: Record<string, unknown>,
  ): ClearingSettlementActionResponse {
    try {
      const proofRaw = getAny(raw, "proof") ?? [];
      return new ClearingSettlementActionResponse(
        normalizeAddress(
          String(getAny(raw, "contract_address", "contractAddress")),
        ),
        String(getAny(raw, "function_name", "functionName")),
        String(getAny(raw, "action")) as ClearingSettlementAction,
        normalizeBytes32Hex(String(getAny(raw, "cycle_id", "cycleId"))),
        String(getAny(raw, "cycle_id_text", "cycleIdText")),
        normalizeAddress(String(getAny(raw, "asset_address", "assetAddress"))),
        normalizeAddress(String(getAny(raw, "participant"))),
        parseU256((getAny(raw, "amount") ?? 0) as number | bigint | string),
        parseU256(
          (getAny(raw, "payable_value", "payableValue") ?? 0) as
            | number
            | bigint
            | string,
        ),
        (Array.isArray(proofRaw) ? proofRaw : []).map((item) =>
          normalizeBytes32Hex(String(item)),
        ),
      );
    } catch (err) {
      if (err instanceof InvalidParamsError) throw err;
      throw new InvalidParamsError(`invalid clearing action: ${String(err)}`);
    }
  }
}

export class AssetBalanceInfo {
  constructor(
    public userAddress: string,
    public assetAddress: string,
    public total: bigint,
    public locked: bigint,
    public version: number,
    public updatedAt: number,
  ) {}

  static fromRpc(raw: Record<string, unknown>): AssetBalanceInfo {
    return new AssetBalanceInfo(
      (getAny(raw, "user_address", "userAddress") ?? "") as string,
      (getAny(raw, "asset_address", "assetAddress") ?? "") as string,
      parseU256((getAny(raw, "total") ?? 0) as number | bigint | string),
      parseU256((getAny(raw, "locked") ?? 0) as number | bigint | string),
      Number(getAny(raw, "version") ?? 0),
      Number(getAny(raw, "updated_at", "updatedAt") ?? 0),
    );
  }
}

export class RecipientPaymentInfo {
  constructor(
    public userAddress: string,
    public recipientAddress: string,
    public txHash: string,
    public amount: bigint,
    public verified: boolean,
    public finalized: boolean,
    public failed: boolean,
    public createdAt: number,
  ) {}

  static fromRpc(raw: Record<string, unknown>): RecipientPaymentInfo {
    return new RecipientPaymentInfo(
      (getAny(raw, "user_address", "userAddress") ?? "") as string,
      (getAny(raw, "recipient_address", "recipientAddress") ?? "") as string,
      (getAny(raw, "tx_hash", "txHash") ?? "") as string,
      parseU256((getAny(raw, "amount") ?? 0) as number | bigint | string),
      Boolean(getAny(raw, "verified")),
      Boolean(getAny(raw, "finalized")),
      Boolean(getAny(raw, "failed")),
      Number(getAny(raw, "created_at", "createdAt") ?? 0),
    );
  }
}

export class UserSuspensionStatus {
  constructor(
    public userAddress: string,
    public suspended: boolean,
    public updatedAt: number,
  ) {}

  static fromRpc(raw: Record<string, unknown>): UserSuspensionStatus {
    return new UserSuspensionStatus(
      (getAny(raw, "user_address", "userAddress") ?? "") as string,
      Boolean(getAny(raw, "suspended")),
      Number(getAny(raw, "updated_at", "updatedAt") ?? 0),
    );
  }
}
