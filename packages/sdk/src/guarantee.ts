import {
  decodeAbiParameters,
  encodeAbiParameters,
  type Hex,
  toBytes,
} from "viem";
import { VerificationError } from "./errors";
import type {
  PaymentGuaranteeClaims,
  PaymentGuaranteeValidationPolicyV2,
} from "./models";
import { ensureHexPrefix, hexFromBytes, parseU256 } from "./utils";

const CLAIMS_ENCODED_BYTES = 32 * 10;
// Minimum bytes for a valid outer envelope: uint64 + bytes offset + bytes length
const MIN_ENVELOPE_BYTES = 32 * 2 + 32;
const CLAIM_TYPES = [
  { type: "bytes32" },
  { type: "uint256" },
  { type: "uint256" },
  { type: "address" },
  { type: "address" },
  { type: "uint256" },
  { type: "uint256" },
  { type: "address" },
  { type: "uint64" },
  { type: "uint64" },
] as const;

// V2 adds: validation_registry_address, validation_request_hash, validation_chain_id,
//          validator_address, validator_agent_id, min_validation_score,
//          validation_subject_hash, job_hash, required_validation_tag (dynamic string)
const CLAIM_TYPES_V2 = [
  { type: "bytes32" }, // domain
  { type: "uint256" }, // tab_id
  { type: "uint256" }, // req_id
  { type: "address" }, // client (user)
  { type: "address" }, // recipient
  { type: "uint256" }, // amount
  { type: "uint256" }, // total_amount
  { type: "address" }, // asset
  { type: "uint64" }, // timestamp
  { type: "uint64" }, // version
  { type: "address" }, // validation_registry_address
  { type: "bytes32" }, // validation_request_hash
  { type: "uint64" }, // validation_chain_id
  { type: "address" }, // validator_address
  { type: "uint256" }, // validator_agent_id
  { type: "uint8" }, // min_validation_score
  { type: "bytes32" }, // validation_subject_hash
  { type: "bytes32" }, // job_hash
  { type: "string" }, // required_validation_tag (dynamic)
] as const;

const CLAIM_TYPES_V2_TUPLE = [
  {
    type: "tuple",
    components: [
      { name: "domain", type: "bytes32" },
      { name: "tabId", type: "uint256" },
      { name: "reqId", type: "uint256" },
      { name: "user", type: "address" },
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "totalAmount", type: "uint256" },
      { name: "asset", type: "address" },
      { name: "timestamp", type: "uint64" },
      { name: "claimsVersion", type: "uint64" },
      { name: "validationRegistryAddress", type: "address" },
      { name: "validationRequestHash", type: "bytes32" },
      { name: "validationChainId", type: "uint64" },
      { name: "validatorAddress", type: "address" },
      { name: "validatorAgentId", type: "uint256" },
      { name: "minValidationScore", type: "uint8" },
      { name: "validationSubjectHash", type: "bytes32" },
      { name: "jobHash", type: "bytes32" },
      { name: "requiredValidationTag", type: "string" },
    ],
  },
] as const;

function ensureDomainBytes(domain: string | Uint8Array): Uint8Array {
  const bytes = typeof domain === "string" ? toBytes(domain) : domain;
  if (bytes.length !== 32) {
    throw new VerificationError("domain separator must be 32 bytes");
  }
  return bytes;
}

function normalizeHexBytes(data: string | Uint8Array): Hex {
  if (typeof data === "string") {
    return ensureHexPrefix(data);
  }
  return hexFromBytes(data);
}

/**
 * ABI-encode a {@link PaymentGuaranteeClaims} object into a hex string.
 *
 * Produces the outer `(uint64 version, bytes innerClaims)` envelope format expected
 * by the Core4Mica contract. Supports V1 (10 fields) and V2 (19 fields with validation policy).
 *
 * @param claims - Decoded claims to encode. Must have `version` set to `1` or `2`.
 * @returns `0x`-prefixed hex string of the ABI-encoded envelope.
 * @throws {@link VerificationError} if `version` is not `1` or `2`, the domain is not 32 bytes,
 *   or V2 claims are missing `validationPolicy`.
 */
export function encodeGuaranteeClaims(claims: PaymentGuaranteeClaims): string {
  if (claims.version === 1) {
    const domain = ensureDomainBytes(claims.domain);
    const encoded = encodeAbiParameters(CLAIM_TYPES, [
      hexFromBytes(domain),
      parseU256(claims.tabId),
      parseU256(claims.reqId),
      claims.userAddress as Hex,
      claims.recipientAddress as Hex,
      parseU256(claims.amount),
      parseU256(claims.totalAmount),
      claims.assetAddress as Hex,
      BigInt(claims.timestamp),
      BigInt(claims.version),
    ]);
    return encodeAbiParameters(
      [{ type: "uint64" }, { type: "bytes" }],
      [BigInt(claims.version), encoded],
    );
  }

  if (claims.version === 2) {
    if (!claims.validationPolicy) {
      throw new VerificationError(
        "V2 guarantee claims missing validationPolicy",
      );
    }
    const p = claims.validationPolicy;
    const domain = ensureDomainBytes(claims.domain);
    const encoded = encodeAbiParameters(CLAIM_TYPES_V2_TUPLE, [
      {
        domain: hexFromBytes(domain),
        tabId: parseU256(claims.tabId),
        reqId: parseU256(claims.reqId),
        user: claims.userAddress as Hex,
        recipient: claims.recipientAddress as Hex,
        amount: parseU256(claims.amount),
        totalAmount: parseU256(claims.totalAmount),
        asset: claims.assetAddress as Hex,
        timestamp: BigInt(claims.timestamp),
        claimsVersion: BigInt(claims.version),
        validationRegistryAddress: p.validationRegistryAddress as Hex,
        validationRequestHash: ensureHexPrefix(p.validationRequestHash),
        validationChainId: BigInt(p.validationChainId),
        validatorAddress: p.validatorAddress as Hex,
        validatorAgentId: p.validatorAgentId,
        minValidationScore: p.minValidationScore,
        validationSubjectHash: ensureHexPrefix(p.validationSubjectHash),
        jobHash: ensureHexPrefix(p.jobHash),
        requiredValidationTag: p.requiredValidationTag,
      },
    ]);
    return encodeAbiParameters(
      [{ type: "uint64" }, { type: "bytes" }],
      [BigInt(claims.version), encoded],
    );
  }

  throw new VerificationError(
    `unsupported guarantee claims version: ${claims.version}`,
  );
}

/**
 * Decode ABI-encoded guarantee claims into a {@link PaymentGuaranteeClaims} object.
 *
 * Accepts either the modern `(uint64 version, bytes innerClaims)` envelope or the legacy
 * unwrapped V1 format (raw 320-byte ABI encoding without an outer envelope).
 *
 * @param data - Hex string or raw bytes of the ABI-encoded claims.
 * @returns Decoded {@link PaymentGuaranteeClaims} with `version` set to `1` or `2`.
 * @throws {@link VerificationError} if the data is too short, the inner length is wrong,
 *   or the encoded version number is unsupported.
 */
export function decodeGuaranteeClaims(
  data: string | Uint8Array,
): PaymentGuaranteeClaims {
  const hex = normalizeHexBytes(data);
  const byteLen = (hex.length - 2) / 2;

  // Try to decode as unwrapped V1 (legacy)
  if (byteLen === CLAIMS_ENCODED_BYTES) {
    return decodeV1Claims(hex);
  }

  // Decode outer envelope to get version
  if (byteLen < MIN_ENVELOPE_BYTES) {
    throw new VerificationError(
      `unexpected guarantee claims length: ${byteLen} bytes`,
    );
  }

  const [version, wrapped] = decodeAbiParameters(
    [{ type: "uint64" }, { type: "bytes" }],
    hex,
  );

  if (version === 1n) {
    const innerHex = wrapped as Hex;
    const innerByteLen = (innerHex.length - 2) / 2;
    if (innerByteLen !== CLAIMS_ENCODED_BYTES) {
      throw new VerificationError(
        `unexpected V1 claims inner length: ${innerByteLen} bytes`,
      );
    }
    return decodeV1Claims(innerHex);
  }

  if (version === 2n) {
    return decodeV2Claims(wrapped as Hex);
  }

  throw new VerificationError(
    `unsupported guarantee claims version: ${version}`,
  );
}

function decodeV1Claims(encoded: Hex): PaymentGuaranteeClaims {
  let decoded: ReturnType<typeof decodeAbiParameters<typeof CLAIM_TYPES>>;
  try {
    decoded = decodeAbiParameters(CLAIM_TYPES, encoded);
  } catch (err) {
    throw new VerificationError(
      `failed to decode V1 guarantee claims: ${String(err)}`,
    );
  }
  const [
    domain,
    tabId,
    reqId,
    user,
    recipient,
    amount,
    totalAmount,
    asset,
    timestamp,
    claimsVersion,
  ] = decoded;

  if (claimsVersion !== 1n) {
    throw new VerificationError(
      `unsupported guarantee claims version: ${claimsVersion}`,
    );
  }

  return {
    domain: toBytes(domain as Hex),
    userAddress: user as string,
    recipientAddress: recipient as string,
    tabId: parseU256(tabId),
    reqId: parseU256(reqId),
    amount: parseU256(amount),
    totalAmount: parseU256(totalAmount),
    assetAddress: asset as string,
    timestamp: Number(timestamp),
    version: Number(claimsVersion),
  };
}

function decodeV2Claims(encoded: Hex): PaymentGuaranteeClaims {
  try {
    const [decoded] = decodeAbiParameters(CLAIM_TYPES_V2_TUPLE, encoded);
    return buildDecodedV2Claims(decoded);
  } catch (tupleErr) {
    try {
      const decoded = decodeAbiParameters(CLAIM_TYPES_V2, encoded);
      return buildDecodedV2Claims({
        domain: decoded[0],
        tabId: decoded[1],
        reqId: decoded[2],
        user: decoded[3],
        recipient: decoded[4],
        amount: decoded[5],
        totalAmount: decoded[6],
        asset: decoded[7],
        timestamp: decoded[8],
        claimsVersion: decoded[9],
        validationRegistryAddress: decoded[10],
        validationRequestHash: decoded[11],
        validationChainId: decoded[12],
        validatorAddress: decoded[13],
        validatorAgentId: decoded[14],
        minValidationScore: decoded[15],
        validationSubjectHash: decoded[16],
        jobHash: decoded[17],
        requiredValidationTag: decoded[18],
      });
    } catch (flatErr) {
      throw new VerificationError(
        `failed to decode V2 guarantee claims: ${String(tupleErr)}; fallback decode failed: ${String(flatErr)}`,
      );
    }
  }
}

function buildDecodedV2Claims(decoded: {
  domain: unknown;
  tabId: unknown;
  reqId: unknown;
  user: unknown;
  recipient: unknown;
  amount: unknown;
  totalAmount: unknown;
  asset: unknown;
  timestamp: unknown;
  claimsVersion: unknown;
  validationRegistryAddress: unknown;
  validationRequestHash: unknown;
  validationChainId: unknown;
  validatorAddress: unknown;
  validatorAgentId: unknown;
  minValidationScore: unknown;
  validationSubjectHash: unknown;
  jobHash: unknown;
  requiredValidationTag: unknown;
}): PaymentGuaranteeClaims {
  const {
    domain,
    tabId,
    reqId,
    user,
    recipient,
    amount,
    totalAmount,
    asset,
    timestamp,
    claimsVersion,
    validationRegistryAddress,
    validationRequestHash,
    validationChainId,
    validatorAddress,
    validatorAgentId,
    minValidationScore,
    validationSubjectHash,
    jobHash,
    requiredValidationTag,
  } = decoded;
  if (claimsVersion !== 2n) {
    throw new VerificationError(
      `expected V2 claims version, got: ${claimsVersion}`,
    );
  }

  const validationPolicy: PaymentGuaranteeValidationPolicyV2 = {
    validationRegistryAddress: validationRegistryAddress as string,
    validationRequestHash: validationRequestHash as string,
    validationChainId: Number(validationChainId as bigint | number | string),
    validatorAddress: validatorAddress as string,
    validatorAgentId: parseU256(validatorAgentId as bigint | number | string),
    minValidationScore: Number(minValidationScore as bigint | number | string),
    validationSubjectHash: validationSubjectHash as string,
    jobHash: jobHash as string,
    requiredValidationTag: requiredValidationTag as string,
  };

  return {
    domain: toBytes(domain as Hex),
    userAddress: user as string,
    recipientAddress: recipient as string,
    tabId: parseU256(tabId as bigint | number | string),
    reqId: parseU256(reqId as bigint | number | string),
    amount: parseU256(amount as bigint | number | string),
    totalAmount: parseU256(totalAmount as bigint | number | string),
    assetAddress: asset as string,
    timestamp: Number(timestamp as bigint | number | string),
    version: Number(claimsVersion),
    validationPolicy,
  };
}
