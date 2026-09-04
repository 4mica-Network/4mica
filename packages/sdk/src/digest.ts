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

import { encodeAbiParameters, type Hex } from "viem";
import type {
  CorePublicParameters,
  PaymentGuaranteeRequestClaims,
} from "@/models";
import { ensureHexPrefix, normalizeAddress } from "@/utils";

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
