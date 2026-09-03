/**
 * Wire types mirroring the core service's `rpc-4mica` crate.
 *
 * Core serializes snake_case JSON (`SiweTemplate` in `auth/` is the one
 * camelCase exception); `fromRpc` parsers accept both spellings defensively.
 * U256 amounts serialize as 0x-prefixed hex, matching the Rust types.
 */

import { InvalidParamsError } from "@/errors";
import { getAny } from "@/serde";
import {
  bytesFromHex,
  normalizeAddress,
  normalizeBytes32Hex,
  normalizeHexBytes,
  parseU256,
  serializeU256,
} from "@/utils";

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Current guarantee claims version. Clients always sign at this version; core
 * accepts every version it advertises so older clients keep working.
 */
export const GUARANTEE_CLAIMS_VERSION = 1;

/** Signing scheme used when producing a payment guarantee signature. */
export enum SigningScheme {
  /** EIP-712 typed-data signing (default, preferred). */
  EIP712 = "eip712",
  /** EIP-191 personal_sign (for wallets that do not support typed data). */
  EIP191 = "eip191",
}

/** ECDSA signature and the scheme used to produce it. */
export interface PaymentSignature {
  /** 65-byte ECDSA signature as a `0x`-prefixed hex string. */
  signature: string;
  scheme: SigningScheme;
}

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

/**
 * V1 payment guarantee request claims, as signed by the payer's wallet.
 *
 * `reqId` is a client-generated random 256-bit nonce — uniqueness is all core
 * asks of it. Build with the static {@link PaymentGuaranteeRequestClaims.new}
 * factory which normalises addresses and parses `uint256` values.
 */
export class PaymentGuaranteeRequestClaims {
  readonly userAddress: string;
  readonly recipientAddress: string;
  readonly reqId: bigint;
  readonly amount: bigint;
  readonly assetAddress: string;
  readonly timestamp: number;
  readonly validation?: ValidationRequirement;

  constructor(init: {
    userAddress: string;
    recipientAddress: string;
    reqId: number | bigint | string;
    amount: number | bigint | string;
    assetAddress: string;
    timestamp: number;
    validation?: ValidationRequirement;
  }) {
    this.userAddress = normalizeAddress(init.userAddress);
    this.recipientAddress = normalizeAddress(init.recipientAddress);
    this.reqId = parseU256(init.reqId);
    this.amount = parseU256(init.amount);
    this.assetAddress = normalizeAddress(init.assetAddress);
    this.timestamp = Number(init.timestamp);
    this.validation = init.validation;
  }

  static new(
    userAddress: string,
    recipientAddress: string,
    reqId: number | bigint | string,
    amount: number | bigint | string,
    timestamp: number,
    erc20Token?: string | null,
  ): PaymentGuaranteeRequestClaims {
    return new PaymentGuaranteeRequestClaims({
      userAddress,
      recipientAddress,
      reqId,
      amount,
      assetAddress: erc20Token || ZERO_ADDRESS,
      timestamp,
    });
  }

  withValidation(
    validation: ValidationRequirement,
  ): PaymentGuaranteeRequestClaims {
    return new PaymentGuaranteeRequestClaims({
      userAddress: this.userAddress,
      recipientAddress: this.recipientAddress,
      reqId: this.reqId,
      amount: this.amount,
      assetAddress: this.assetAddress,
      timestamp: this.timestamp,
      validation,
    });
  }

  get version(): number {
    return GUARANTEE_CLAIMS_VERSION;
  }

  toPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      version: "v1",
      user_address: this.userAddress.toLowerCase(),
      recipient_address: this.recipientAddress.toLowerCase(),
      req_id: serializeU256(this.reqId),
      amount: serializeU256(this.amount),
      asset_address: this.assetAddress.toLowerCase(),
      timestamp: this.timestamp,
    };
    if (this.validation !== undefined) {
      payload.validation = this.validation.toPayload();
    }
    return payload;
  }
}

/**
 * Guarantee claims as signed by core's BLS key and decoded on-chain.
 *
 * `cycleId` is assigned by core — the settlement cycle the guarantee was
 * netted into — and never supplied by a client. Validation is enforced
 * off-chain and never enters this envelope.
 */
export interface PaymentGuaranteeClaims {
  domain: Uint8Array;
  userAddress: string;
  recipientAddress: string;
  cycleId: bigint;
  reqId: bigint;
  amount: bigint;
  assetAddress: string;
  timestamp: number;
  version: number;
}

/** BLS certificate: hex-encoded claims bytes plus a compressed G2 signature. */
export class BLSCert {
  /** ABI-encoded `(uint64 version, bytes innerClaims)` envelope as a hex string. */
  readonly claims: string;
  /** BLS12-381 G2 signature as a hex string. */
  readonly signature: string;

  constructor(claims: string, signature: string) {
    this.claims = String(claims);
    this.signature = String(signature);
  }

  claimsBytes(): Uint8Array {
    return bytesFromHex(this.claims);
  }

  static fromRpc(raw: Record<string, unknown>): BLSCert {
    const claims = getAny(raw, "claims");
    const signature = getAny(raw, "signature");
    if (claims === undefined || signature === undefined) {
      throw new InvalidParamsError("certificate missing claims or signature");
    }
    return new BLSCert(String(claims), String(signature));
  }
}

/** One guarantee version's EIP-712 domain separator, 0x-prefixed hex. */
export interface GuaranteeVersionDomain {
  version: number;
  domainSeparator: string;
}

/** Static parameters exposed by the core service (`GET /core/public-params`). */
export class CorePublicParameters {
  constructor(
    /** Operator BLS public key (48-byte compressed G1). */
    public publicKey: Uint8Array,
    public contractAddress: string,
    public eip712Name: string,
    public eip712Version: string,
    public chainId: number,
    public ethereumHttpRpcUrl: string = "",
    public supportedGuaranteeVersions: number[] = [GUARANTEE_CLAIMS_VERSION],
    public guaranteeDomainSeparator: string = "",
    public guaranteeDomains: GuaranteeVersionDomain[] = [],
    public coreDomainSeparator: string = "",
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

    const pkRaw = require("public_key", "publicKey");
    const publicKey =
      typeof pkRaw === "string"
        ? bytesFromHex(pkRaw)
        : pkRaw instanceof Uint8Array
          ? pkRaw
          : Array.isArray(pkRaw)
            ? Uint8Array.from(pkRaw as ArrayLike<number>)
            : new Uint8Array();

    const versionsRaw = getAny(
      payload,
      "supported_guarantee_versions",
      "supportedGuaranteeVersions",
    );
    const versions =
      Array.isArray(versionsRaw) && versionsRaw.length > 0
        ? versionsRaw.map((version) => Number(version))
        : [GUARANTEE_CLAIMS_VERSION];

    const domainsRaw =
      getAny(payload, "guarantee_domains", "guaranteeDomains") ?? [];
    const domains: GuaranteeVersionDomain[] = (
      Array.isArray(domainsRaw) ? domainsRaw : []
    ).map((entry) => ({
      version: Number(getAny(entry as Record<string, unknown>, "version")),
      domainSeparator: normalizeBytes32Hex(
        String(
          getAny(
            entry as Record<string, unknown>,
            "domain_separator",
            "domainSeparator",
          ),
        ),
      ),
    }));

    const guaranteeDomainSeparatorRaw = String(
      getAny(
        payload,
        "guarantee_domain_separator",
        "guaranteeDomainSeparator",
      ) ?? "",
    );
    const coreDomainSeparatorRaw = String(
      getAny(payload, "core_domain_separator", "coreDomainSeparator") ?? "",
    );

    return new CorePublicParameters(
      publicKey,
      String(require("contract_address", "contractAddress")),
      String(require("eip712_name", "eip712Name")),
      String(require("eip712_version", "eip712Version")),
      Number(require("chain_id", "chainId")),
      String(
        getAny(payload, "ethereum_http_rpc_url", "ethereumHttpRpcUrl") ?? "",
      ),
      versions,
      guaranteeDomainSeparatorRaw
        ? normalizeBytes32Hex(guaranteeDomainSeparatorRaw)
        : "",
      domains,
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
