/**
 * EIP-712 / EIP-191 payloads for guarantee requests.
 *
 * Ports `sdk-rust/src/digest.rs`. The signed structs are declared in
 * `crates/rpc/src/guarantee/signing.rs` — renaming a struct or reordering a
 * field changes the EIP-712 type hash and invalidates existing signatures, so
 * the type definitions here are pinned by tests against the canonical
 * `encodeType` strings and the shared digest vectors.
 *
 * The request-signing domain includes `verifyingContract` (the Core4Mica
 * deployment) alongside name/version/chainId, all taken from core's public
 * parameters.
 */

import { concat, encodeAbiParameters, type Hex, keccak256, toHex } from "viem";
import type {
  CorePublicParameters,
  PaymentGuaranteeRequestClaims,
} from "@/models";
import {
  ensureHexPrefix,
  normalizeAddress,
  normalizeBytes32Hex,
} from "@/utils";

/** Permit2's canonical singleton, deployed at one address on every chain. */
export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

// Core4Mica's EIP-712 domain, as the contract declares it in
// `EIP712("Core4Mica", "1")`. Distinct from the operator's request-signing
// domain, which core publishes in its public parameters.
export const CORE_EIP712_NAME = "Core4Mica";
export const CORE_EIP712_VERSION = "1";

export const GUARANTEE_EIP712_DOMAIN_TYPE = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
] as const;

export const GUARANTEE_CLAIMS_V1_TYPE = [
  { name: "user", type: "address" },
  { name: "recipient", type: "address" },
  { name: "reqId", type: "uint256" },
  { name: "amount", type: "uint256" },
  { name: "asset", type: "address" },
  { name: "timestamp", type: "uint64" },
] as const;

export const GUARANTEE_VALIDATION_TYPE = [
  { name: "validator", type: "string" },
  { name: "subject", type: "bytes32" },
  { name: "deadline", type: "uint64" },
  { name: "params", type: "bytes" },
] as const;

export const VALIDATED_GUARANTEE_CLAIMS_V1_TYPE = [
  ...GUARANTEE_CLAIMS_V1_TYPE,
  { name: "validation", type: "SolValidation" },
] as const;

export interface GuaranteeEip712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Hex;
}

export interface GuaranteeClaimsMessage {
  user: Hex;
  recipient: Hex;
  reqId: bigint;
  amount: bigint;
  asset: Hex;
  timestamp: bigint;
  validation?: {
    validator: string;
    subject: Hex;
    deadline: bigint;
    params: Hex;
  };
}

export type GuaranteeTypedData =
  | {
      types: {
        SolGuaranteeRequestClaimsV1: typeof GUARANTEE_CLAIMS_V1_TYPE;
      };
      primaryType: "SolGuaranteeRequestClaimsV1";
      domain: GuaranteeEip712Domain;
      message: GuaranteeClaimsMessage;
    }
  | {
      types: {
        SolValidatedGuaranteeRequestClaimsV1: typeof VALIDATED_GUARANTEE_CLAIMS_V1_TYPE;
        SolValidation: typeof GUARANTEE_VALIDATION_TYPE;
      };
      primaryType: "SolValidatedGuaranteeRequestClaimsV1";
      domain: GuaranteeEip712Domain;
      message: GuaranteeClaimsMessage;
    };

function domain(params: CorePublicParameters): GuaranteeEip712Domain {
  return {
    name: params.eip712Name,
    version: params.eip712Version,
    chainId: params.chainId,
    verifyingContract: normalizeAddress(params.contractAddress) as Hex,
  };
}

function claimsMessage(
  claims: PaymentGuaranteeRequestClaims,
): GuaranteeClaimsMessage {
  return {
    user: claims.userAddress as Hex,
    recipient: claims.recipientAddress as Hex,
    reqId: claims.reqId,
    amount: claims.amount,
    asset: claims.assetAddress as Hex,
    timestamp: BigInt(claims.timestamp),
  };
}

/**
 * The full EIP-712 typed data for a guarantee request, in the shape viem's
 * `signTypedData` / `hashTypedData` consume.
 */
export function guaranteeTypedData(
  params: CorePublicParameters,
  claims: PaymentGuaranteeRequestClaims,
): GuaranteeTypedData {
  if (claims.validation === undefined) {
    return {
      types: { SolGuaranteeRequestClaimsV1: GUARANTEE_CLAIMS_V1_TYPE },
      primaryType: "SolGuaranteeRequestClaimsV1",
      domain: domain(params),
      message: claimsMessage(claims),
    };
  }

  const validation = claims.validation;
  return {
    types: {
      SolValidatedGuaranteeRequestClaimsV1: VALIDATED_GUARANTEE_CLAIMS_V1_TYPE,
      SolValidation: GUARANTEE_VALIDATION_TYPE,
    },
    primaryType: "SolValidatedGuaranteeRequestClaimsV1",
    domain: domain(params),
    message: {
      ...claimsMessage(claims),
      validation: {
        validator: validation.validator,
        subject: ensureHexPrefix(validation.subject),
        deadline: BigInt(validation.deadline ?? 0),
        params: ensureHexPrefix(validation.params),
      },
    },
  };
}

/**
 * The ABI payload the EIP-191 scheme prefixes and hashes: `abi.encode` of the
 * same struct EIP-712 signs.
 */
export function eip191PayloadForClaims(
  claims: PaymentGuaranteeRequestClaims,
): Hex {
  if (claims.validation === undefined) {
    return encodeAbiParameters(
      [
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "address" },
        { type: "uint64" },
      ],
      [
        claims.userAddress as Hex,
        claims.recipientAddress as Hex,
        claims.reqId,
        claims.amount,
        claims.assetAddress as Hex,
        BigInt(claims.timestamp),
      ],
    );
  }

  const validation = claims.validation;
  // A dynamic struct abi.encodes with an offset head, which encoding a
  // one-tuple sequence reproduces.
  return encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { type: "address" },
          { type: "address" },
          { type: "uint256" },
          { type: "uint256" },
          { type: "address" },
          { type: "uint64" },
          {
            type: "tuple",
            components: [
              { type: "string" },
              { type: "bytes32" },
              { type: "uint64" },
              { type: "bytes" },
            ],
          },
        ],
      },
    ],
    [
      [
        claims.userAddress as Hex,
        claims.recipientAddress as Hex,
        claims.reqId,
        claims.amount,
        claims.assetAddress as Hex,
        BigInt(claims.timestamp),
        [
          validation.validator,
          ensureHexPrefix(validation.subject),
          BigInt(validation.deadline ?? 0),
          ensureHexPrefix(validation.params),
        ],
      ],
    ],
  );
}

const ENCODE_TYPE_SOURCES: Record<
  string,
  readonly { name: string; type: string }[]
> = {
  SolGuaranteeRequestClaimsV1: GUARANTEE_CLAIMS_V1_TYPE,
  SolValidatedGuaranteeRequestClaimsV1: VALIDATED_GUARANTEE_CLAIMS_V1_TYPE,
  SolValidation: GUARANTEE_VALIDATION_TYPE,
};

/**
 * The canonical EIP-712 `encodeType` string for one of this module's structs —
 * what the type hash is keccak'd from. Exposed for tests that pin field order
 * against the contract.
 */
export function encodeTypeString(primary: string): string {
  const render = (name: string): string => {
    const fields = ENCODE_TYPE_SOURCES[name]
      .map((field) => `${field.type} ${field.name}`)
      .join(",");
    return `${name}(${fields})`;
  };
  const referenced = [
    ...new Set(
      ENCODE_TYPE_SOURCES[primary]
        .map((field) => field.type)
        .filter((type) => type in ENCODE_TYPE_SOURCES && type !== primary),
    ),
  ].sort();
  return render(primary) + referenced.map(render).join("");
}

// --- authorization digests (gasless routes) ------------------------------
//
// Canonical EIP-712 `encodeType` strings the tokens and contracts hash. If
// field order or types drift from these, the produced signature will not
// verify on-chain — so they are pinned as literals, exactly as in
// `sdk-rust/src/digest.rs`.

export const ERC3009_TYPE =
  "ReceiveWithAuthorization(address from,address to,uint256 value," +
  "uint256 validAfter,uint256 validBefore,bytes32 nonce)";
export const PERMIT2_TRANSFER_TYPE =
  "PermitTransferFrom(TokenPermissions permitted,address spender," +
  "uint256 nonce,uint256 deadline)TokenPermissions(address token,uint256 amount)";
export const TOKEN_PERMISSIONS_TYPE =
  "TokenPermissions(address token,uint256 amount)";
export const EIP2612_PERMIT_TYPE =
  "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)";
export const REQUEST_WITHDRAWAL_TYPE =
  "RequestWithdrawal(address user,address asset,uint256 amount," +
  "uint256 validAfter,uint256 validBefore,bytes32 nonce)";
export const CANCEL_WITHDRAWAL_TYPE =
  "CancelWithdrawal(address user,address asset,uint256 validAfter," +
  "uint256 validBefore,bytes32 nonce)";

type Bytes32Like = string | Uint8Array;

function bytes32(value: Bytes32Like): Hex {
  if (typeof value === "string") {
    return normalizeBytes32Hex(value);
  }
  if (value.length !== 32) {
    throw new Error(`expected 32 bytes, got ${value.length}`);
  }
  return toHex(value);
}

/**
 * `keccak256(0x19 0x01 ‖ domainSeparator ‖ hashStruct(message))` from a raw
 * domain separator — read straight off the verifying contract, so the
 * signature always matches what it verifies.
 */
export function eip712Digest(
  domainSeparator: Bytes32Like,
  structHash: Bytes32Like,
): Hex {
  return keccak256(
    concat(["0x1901", bytes32(domainSeparator), bytes32(structHash)]),
  );
}

/**
 * An EIP-712 domain separator built from its parts — the reconstruction path
 * used when the separator cannot be read from the contract. `version` is
 * optional because not every domain has one (Permit2's does not).
 */
export function eip712DomainSeparator(
  name: string,
  version: string | undefined,
  chainId: number,
  verifyingContract: string,
): Hex {
  const typeHash = keccak256(
    toHex(
      version !== undefined
        ? "EIP712Domain(string name,string version,uint256 chainId," +
            "address verifyingContract)"
        : "EIP712Domain(string name,uint256 chainId,address verifyingContract)",
    ),
  );
  const parts: Hex[] = [typeHash, keccak256(toHex(name))];
  if (version !== undefined) {
    parts.push(keccak256(toHex(version)));
  }
  parts.push(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }],
      [BigInt(chainId), normalizeAddress(verifyingContract) as Hex],
    ),
  );
  return keccak256(concat(parts));
}

/**
 * Permit2's domain separator: one canonical address on every chain, a fixed
 * name, and no version — the chain id is the only variable.
 */
export function permit2DomainSeparator(chainId: number): Hex {
  return eip712DomainSeparator("Permit2", undefined, chainId, PERMIT2_ADDRESS);
}

/** Core4Mica's own domain separator for the deployment at `contract`. */
export function coreDomainSeparator(chainId: number, contract: string): Hex {
  return eip712DomainSeparator(
    CORE_EIP712_NAME,
    CORE_EIP712_VERSION,
    chainId,
    contract,
  );
}

/**
 * Signing hash for an EIP-3009 `receiveWithAuthorization`.
 * `domainSeparator` is the token's own `DOMAIN_SEPARATOR()`.
 */
export function digestForReceiveAuthorization(
  domainSeparator: Bytes32Like,
  fromAddress: string,
  toAddress: string,
  value: bigint,
  validAfter: number,
  validBefore: number,
  nonce: Bytes32Like,
): Hex {
  const structHash = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "bytes32" },
      ],
      [
        keccak256(toHex(ERC3009_TYPE)),
        normalizeAddress(fromAddress) as Hex,
        normalizeAddress(toAddress) as Hex,
        value,
        BigInt(validAfter),
        BigInt(validBefore),
        bytes32(nonce),
      ],
    ),
  );
  return eip712Digest(domainSeparator, structHash);
}

/**
 * Signing hash for a Permit2 `PermitTransferFrom`. `spender` is bound to the
 * contract that will call `permitTransferFrom`, so only that contract can
 * consume the signature.
 */
export function digestForPermit2Transfer(
  domainSeparator: Bytes32Like,
  token: string,
  amount: bigint,
  spender: string,
  nonce: bigint,
  deadline: number,
): Hex {
  const permittedHash = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
      [
        keccak256(toHex(TOKEN_PERMISSIONS_TYPE)),
        normalizeAddress(token) as Hex,
        amount,
      ],
    ),
  );
  const structHash = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
      ],
      [
        keccak256(toHex(PERMIT2_TRANSFER_TYPE)),
        permittedHash,
        normalizeAddress(spender) as Hex,
        nonce,
        BigInt(deadline),
      ],
    ),
  );
  return eip712Digest(domainSeparator, structHash);
}

/**
 * Signing hash for an EIP-2612 `permit`. `nonce` must be the owner's current
 * one — a client without chain access gets it from the facilitator's
 * `PERMIT2_ALLOWANCE_REQUIRED` response rather than reading the token.
 */
export function digestForPermit(
  domainSeparator: Bytes32Like,
  owner: string,
  spender: string,
  value: bigint,
  nonce: bigint,
  deadline: number,
): Hex {
  const structHash = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
      ],
      [
        keccak256(toHex(EIP2612_PERMIT_TYPE)),
        normalizeAddress(owner) as Hex,
        normalizeAddress(spender) as Hex,
        value,
        nonce,
        BigInt(deadline),
      ],
    ),
  );
  return eip712Digest(domainSeparator, structHash);
}

/**
 * Signing hash for a sponsored `requestWithdrawalWithAuthorization`.
 * `domainSeparator` is Core4Mica's own `DOMAIN_SEPARATOR()`.
 */
export function digestForRequestWithdrawal(
  domainSeparator: Bytes32Like,
  user: string,
  asset: string,
  amount: bigint,
  validAfter: number,
  validBefore: number,
  nonce: Bytes32Like,
): Hex {
  const structHash = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "bytes32" },
      ],
      [
        keccak256(toHex(REQUEST_WITHDRAWAL_TYPE)),
        normalizeAddress(user) as Hex,
        normalizeAddress(asset) as Hex,
        amount,
        BigInt(validAfter),
        BigInt(validBefore),
        bytes32(nonce),
      ],
    ),
  );
  return eip712Digest(domainSeparator, structHash);
}

/** Signing hash for a sponsored `cancelWithdrawalWithAuthorization`. */
export function digestForCancelWithdrawal(
  domainSeparator: Bytes32Like,
  user: string,
  asset: string,
  validAfter: number,
  validBefore: number,
  nonce: Bytes32Like,
): Hex {
  const structHash = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "bytes32" },
      ],
      [
        keccak256(toHex(CANCEL_WITHDRAWAL_TYPE)),
        normalizeAddress(user) as Hex,
        normalizeAddress(asset) as Hex,
        BigInt(validAfter),
        BigInt(validBefore),
        bytes32(nonce),
      ],
    ),
  );
  return eip712Digest(domainSeparator, structHash);
}
