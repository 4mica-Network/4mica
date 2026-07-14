import { toBytes } from "viem";
import { getAny } from "@/serde";
import {
  ensureHexPrefix,
  normalizeAddress,
  parseU256,
  ValidationError,
} from "@/utils";

export {
  ADMIN_API_KEY_HEADER,
  ADMIN_API_KEY_PREFIX,
  ADMIN_SCOPE_MANAGE_KEYS,
  ADMIN_SCOPE_SUSPEND_USERS,
} from "@/constants";

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
 * V1 payment guarantee request claims. Signed by the payer and submitted to the
 * core RPC to obtain a BLS guarantee certificate.
 *
 * Build with the static {@link PaymentGuaranteeRequestClaims.new} factory which
 * normalises addresses and parses `uint256` values.
 */
export class PaymentGuaranteeRequestClaims {
  userAddress: string;
  recipientAddress: string;
  reqId: bigint;
  amount: bigint;
  timestamp: number;
  assetAddress: string;

  constructor(init: {
    userAddress: string;
    recipientAddress: string;
    reqId?: bigint;
    amount: bigint;
    timestamp: number;
    assetAddress: string;
  }) {
    this.userAddress = init.userAddress;
    this.recipientAddress = init.recipientAddress;
    this.reqId = init.reqId ?? 0n;
    this.amount = init.amount;
    this.timestamp = init.timestamp;
    this.assetAddress = init.assetAddress;
  }

  static new(
    userAddress: string,
    recipientAddress: string,
    amount: number | bigint | string,
    timestamp: number,
    erc20Token?: string | null,
    reqId?: number | bigint | string,
  ): PaymentGuaranteeRequestClaims {
    const asset = erc20Token ?? "0x0000000000000000000000000000000000000000";
    return new PaymentGuaranteeRequestClaims({
      userAddress: normalizeAddress(userAddress),
      recipientAddress: normalizeAddress(recipientAddress),
      reqId: reqId !== undefined ? parseU256(reqId) : 0n,
      amount: parseU256(amount),
      timestamp: Number(timestamp),
      assetAddress: normalizeAddress(asset),
    });
  }
}

/** On-chain validation policy fields carried in a V2 payment guarantee certificate. */
export interface PaymentGuaranteeValidationPolicyV2 {
  validationRegistryAddress: string;
  validationRequestHash: string;
  validationChainId: number;
  validatorAddress: string;
  validatorAgentId: bigint;
  minValidationScore: number;
  validationSubjectHash: string;
  jobHash: string;
  requiredValidationTag: string;
}

/**
 * V2 payment guarantee request claims — extends V1 with a full on-chain validation policy.
 *
 * Compute `validationSubjectHash` via `computeValidationSubjectHash(baseClaims)` and
 * `validationRequestHash` via `computeValidationRequestHash(partialV2)` before constructing.
 * The `jobHash` must be provided and included in the validation request hash.
 *
 * @throws {@link ValidationError} if `minValidationScore` is outside [1, 100].
 */
export class PaymentGuaranteeRequestClaimsV2 extends PaymentGuaranteeRequestClaims {
  validationRegistryAddress: string;
  validationRequestHash: string;
  validationChainId: number;
  validatorAddress: string;
  validatorAgentId: bigint;
  minValidationScore: number;
  validationSubjectHash: string;
  jobHash: string;
  requiredValidationTag: string;

  constructor(init: {
    userAddress: string;
    recipientAddress: string;
    reqId?: bigint;
    amount: bigint;
    timestamp: number;
    assetAddress: string;
    validationRegistryAddress: string;
    validationRequestHash: string;
    validationChainId: number;
    validatorAddress: string;
    validatorAgentId: bigint;
    minValidationScore: number;
    validationSubjectHash: string;
    jobHash: string;
    requiredValidationTag: string;
  }) {
    super(init);
    if (init.minValidationScore < 1 || init.minValidationScore > 100) {
      throw new ValidationError(
        `minValidationScore must be in [1, 100], got ${init.minValidationScore}`,
      );
    }
    this.validationRegistryAddress = normalizeAddress(
      init.validationRegistryAddress,
    );
    this.validationRequestHash = ensureHexPrefix(
      init.validationRequestHash,
    ).toLowerCase();
    this.validationChainId = init.validationChainId;
    this.validatorAddress = normalizeAddress(init.validatorAddress);
    this.validatorAgentId = init.validatorAgentId;
    this.minValidationScore = init.minValidationScore;
    this.validationSubjectHash = ensureHexPrefix(
      init.validationSubjectHash,
    ).toLowerCase();
    this.jobHash = ensureHexPrefix(init.jobHash).toLowerCase();
    this.requiredValidationTag = init.requiredValidationTag;
  }
}

/**
 * Decoded payment guarantee claims, as returned by `decodeGuaranteeClaims`.
 * `version` is `1` for V1 certificates and `2` for V2 certificates.
 * V2 certificates additionally carry a `validationPolicy`.
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
  validationPolicy?: PaymentGuaranteeValidationPolicyV2;
}

/**
 * BLS guarantee certificate returned by `issuePaymentGuarantee`.
 * Both fields are `0x`-prefixed hex strings.
 */
export interface BLSCert {
  /** ABI-encoded `(uint64 version, bytes innerClaims)` envelope as a hex string. */
  claims: string;
  /** BLS12-381 G2 signature as a hex string. */
  signature: string;
}

/** On-chain collateral position for a single asset, returned by `getUser`. */
export interface UserInfo {
  /** Asset address (`0x000...` for ETH). */
  asset: string;
  /** Total deposited collateral available for payments (in token base units). */
  collateral: bigint;
  /** Amount of a pending withdrawal request (0 if none). */
  withdrawalRequestAmount: bigint;
  /** Unix timestamp when the withdrawal request was made (0 if none). */
  withdrawalRequestTimestamp: number;
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

export class AdminApiKeyInfo {
  constructor(
    public id: string,
    public name: string,
    public scopes: string[],
    public createdAt: number,
    public revokedAt?: number | null,
  ) {}

  static fromRpc(raw: Record<string, unknown>): AdminApiKeyInfo {
    const revoked = getAny(raw, "revoked_at", "revokedAt");
    return new AdminApiKeyInfo(
      (getAny(raw, "id") ?? "") as string,
      (getAny(raw, "name") ?? "") as string,
      ((getAny(raw, "scopes") ?? []) as string[]).map(String),
      Number(getAny(raw, "created_at", "createdAt") ?? 0),
      revoked === undefined || revoked === null ? null : Number(revoked),
    );
  }
}

export class AdminApiKeySecret {
  constructor(
    public id: string,
    public name: string,
    public scopes: string[],
    public createdAt: number,
    public apiKey: string,
  ) {}

  static fromRpc(raw: Record<string, unknown>): AdminApiKeySecret {
    return new AdminApiKeySecret(
      (getAny(raw, "id") ?? "") as string,
      (getAny(raw, "name") ?? "") as string,
      ((getAny(raw, "scopes") ?? []) as string[]).map(String),
      Number(getAny(raw, "created_at", "createdAt") ?? 0),
      (getAny(raw, "api_key", "apiKey") ?? "") as string,
    );
  }
}

/**
 * Off-chain clearing settlement action a participant performs against the
 * ClearingHouse contract for a given cycle.
 */
export type ClearingSettlementActionKind =
  | "pay_net_debit"
  | "claim_net_credit"
  | "mark_defaulted";

/** Role a participant holds in a settlement cycle. */
export type ClearingParticipantRole =
  | "NET_CREDITOR"
  | "NET_DEBTOR"
  | "BALANCED"
  | string;

/**
 * A participant's committed position in a settlement cycle, with the Merkle
 * proof needed to settle on-chain. Returned by `getClearingParticipantProof`.
 */
export class ClearingParticipantProof {
  constructor(
    /** On-chain `bytes32` cycle identifier. */
    public cycleId: string,
    /** Core database cycle identifier. */
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
    const proofRaw = getAny(raw, "proof") ?? [];
    return new ClearingParticipantProof(
      (getAny(raw, "cycle_id", "cycleId") ?? "") as string,
      (getAny(raw, "cycle_id_text", "cycleIdText") ?? "") as string,
      (getAny(raw, "asset_address", "assetAddress") ?? "") as string,
      (getAny(raw, "participant") ?? "") as string,
      (getAny(raw, "role") ?? "") as ClearingParticipantRole,
      parseU256((getAny(raw, "amount") ?? 0) as number | bigint | string),
      parseU256(
        (getAny(raw, "net_debit", "netDebit") ?? 0) as number | bigint | string,
      ),
      parseU256(
        (getAny(raw, "net_credit", "netCredit") ?? 0) as
          | number
          | bigint
          | string,
      ),
      (getAny(raw, "leaf") ?? "") as string,
      (getAny(raw, "merkle_root", "merkleRoot") ?? "") as string,
      (Array.isArray(proofRaw) ? proofRaw : []).map(String),
    );
  }
}

/**
 * A prepared ClearingHouse contract call for a participant, including the amount
 * and Merkle proof. Returned by `getClearingSettlementAction` and its helpers.
 */
export class ClearingSettlementActionResponse {
  constructor(
    /** ClearingHouse contract address. */
    public contractAddress: string,
    /** Contract function to call (`payNetDebit`, `claimNetCredit`, `markDefaulted`). */
    public functionName: string,
    public action: ClearingSettlementActionKind,
    /** On-chain `bytes32` cycle identifier. */
    public cycleId: string,
    /** Core database cycle identifier. */
    public cycleIdText: string,
    public assetAddress: string,
    /** Participant whose committed Merkle leaf is proven. */
    public participant: string,
    /** Alias for `participant` when `action = mark_defaulted`. */
    public debtor: string | null,
    /** Amount argument for the selected ClearingHouse function. */
    public amount: bigint,
    /** Native value to attach — non-zero only for native-asset debtor payments. */
    public payableValue: bigint,
    public proof: string[],
  ) {}

  static fromRpc(
    raw: Record<string, unknown>,
  ): ClearingSettlementActionResponse {
    const proofRaw = getAny(raw, "proof") ?? [];
    const debtor = getAny(raw, "debtor");
    return new ClearingSettlementActionResponse(
      (getAny(raw, "contract_address", "contractAddress") ?? "") as string,
      (getAny(raw, "function_name", "functionName") ?? "") as string,
      (getAny(raw, "action") ??
        "claim_net_credit") as ClearingSettlementActionKind,
      (getAny(raw, "cycle_id", "cycleId") ?? "") as string,
      (getAny(raw, "cycle_id_text", "cycleIdText") ?? "") as string,
      (getAny(raw, "asset_address", "assetAddress") ?? "") as string,
      (getAny(raw, "participant") ?? "") as string,
      typeof debtor === "string" ? debtor : null,
      parseU256((getAny(raw, "amount") ?? 0) as number | bigint | string),
      parseU256(
        (getAny(raw, "payable_value", "payableValue") ?? 0) as
          | number
          | bigint
          | string,
      ),
      (Array.isArray(proofRaw) ? proofRaw : []).map(String),
    );
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

export interface SupportedTokenInfo {
  symbol: string;
  address: string;
  decimals?: number;
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
        tokens.push({
          symbol: String(getAny(token, "symbol") ?? ""),
          address,
          decimals:
            decimals === undefined || decimals === null
              ? undefined
              : Number(decimals),
        });
      }
    }
    return new SupportedTokensResponse(
      Number(getAny(raw, "chain_id", "chainId") ?? 0),
      tokens,
    );
  }
}

export class CorePublicParameters {
  constructor(
    public publicKey: Uint8Array,
    public contractAddress: string,
    public ethereumHttpRpcUrl: string,
    public eip712Name: string,
    public eip712Version: string,
    public chainId: number,
    public maxAcceptedGuaranteeVersion: number = 1,
    public acceptedGuaranteeVersions: number[] = [],
    public activeGuaranteeDomainSeparator: string = "",
    /** Allowlist of trusted validation registry addresses configured in core (may be empty). */
    public trustedValidationRegistries: string[] = [],
    public validationHashCanonicalizationVersion: string = "4MICA_VALIDATION_REQUEST_V1",
  ) {}

  static fromRpc(payload: Record<string, unknown>): CorePublicParameters {
    const pkRaw = payload.public_key ?? payload.publicKey;
    const pk =
      typeof pkRaw === "string"
        ? toBytes(pkRaw)
        : pkRaw instanceof Uint8Array
          ? pkRaw
          : Array.isArray(pkRaw)
            ? Uint8Array.from(pkRaw as ArrayLike<number>)
            : new Uint8Array();
    const registriesRaw =
      payload.trusted_validation_registries ??
      payload.trustedValidationRegistries;
    const trustedValidationRegistries = Array.isArray(registriesRaw)
      ? (registriesRaw as unknown[]).map(String)
      : [];
    return new CorePublicParameters(
      pk,
      String(payload.contract_address ?? payload.contractAddress ?? ""),
      String(payload.ethereum_http_rpc_url ?? payload.ethereumHttpRpcUrl ?? ""),
      (payload.eip712_name ?? payload.eip712Name ?? "4Mica") as string,
      (payload.eip712_version ?? payload.eip712Version ?? "1") as string,
      Number(payload.chain_id ?? payload.chainId),
      Number(
        payload.max_accepted_guarantee_version ??
          payload.maxAcceptedGuaranteeVersion ??
          1,
      ),
      Array.isArray(
        payload.accepted_guarantee_versions ??
          payload.acceptedGuaranteeVersions,
      )
        ? (
            (payload.accepted_guarantee_versions ??
              payload.acceptedGuaranteeVersions) as unknown[]
          ).map((version) => Number(version))
        : [],
      String(
        payload.active_guarantee_domain_separator ??
          payload.activeGuaranteeDomainSeparator ??
          "",
      ),
      trustedValidationRegistries,
      String(
        payload.validation_hash_canonicalization_version ??
          payload.validationHashCanonicalizationVersion ??
          "4MICA_VALIDATION_REQUEST_V1",
      ),
    );
  }
}
