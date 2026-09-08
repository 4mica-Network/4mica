/**
 * BLS envelope codec for guarantee claims.
 *
 * Wire format is `abi.encode(uint64 version, bytes claims)`, matching what
 * `Core4Mica` decodes (`crates/rpc/src/guarantee/codec.rs`). The version
 * selects the claims layout; only v1 exists today.
 */

import { decodeAbiParameters, encodeAbiParameters, type Hex } from "viem";
import { VerificationError } from "@/errors";
import {
  GUARANTEE_CLAIMS_VERSION,
  type PaymentGuaranteeClaims,
} from "@/models";
import {
  bytesFromHex,
  ensureHexPrefix,
  hexFromBytes,
  normalizeAddress,
  parseU256,
} from "@/utils";

export const SUPPORTED_GUARANTEE_VERSIONS: number[] = [
  GUARANTEE_CLAIMS_VERSION,
];

const CLAIM_TYPES = [
  { type: "bytes32" }, // domain
  { type: "uint256" }, // cycle_id
  { type: "uint256" }, // req_id
  { type: "address" }, // client (user)
  { type: "address" }, // recipient
  { type: "uint256" }, // amount
  { type: "address" }, // asset
  { type: "uint64" }, // timestamp
  { type: "uint64" }, // version
] as const;

const CLAIMS_ENCODED_BYTES_V1 = 32 * CLAIM_TYPES.length;
const MIN_ENVELOPE_BYTES = 32 * 3;

export function isSupportedGuaranteeVersion(version: number): boolean {
  return SUPPORTED_GUARANTEE_VERSIONS.includes(version);
}

function ensureDomainBytes(domain: string | Uint8Array): Uint8Array {
  const bytes = typeof domain === "string" ? bytesFromHex(domain) : domain;
  if (bytes.length !== 32) {
    throw new VerificationError("domain separator must be 32 bytes");
  }
  return bytes;
}

/**
 * ABI-encode a {@link PaymentGuaranteeClaims} object into a hex string, in the
 * outer `(uint64 version, bytes innerClaims)` envelope format the Core4Mica
 * contract expects.
 */
export function encodeGuaranteeClaims(claims: PaymentGuaranteeClaims): string {
  if (claims.version !== GUARANTEE_CLAIMS_VERSION) {
    throw new VerificationError(
      `unsupported guarantee claims version: ${claims.version}`,
    );
  }
  const domain = ensureDomainBytes(claims.domain);
  const encoded = encodeAbiParameters(CLAIM_TYPES, [
    hexFromBytes(domain),
    parseU256(claims.cycleId),
    parseU256(claims.reqId),
    claims.userAddress as Hex,
    claims.recipientAddress as Hex,
    parseU256(claims.amount),
    claims.assetAddress as Hex,
    BigInt(claims.timestamp),
    BigInt(claims.version),
  ]);
  return encodeAbiParameters(
    [{ type: "uint64" }, { type: "bytes" }],
    [BigInt(claims.version), encoded],
  );
}

/**
 * Decode ABI-encoded guarantee claims into a {@link PaymentGuaranteeClaims}.
 *
 * Accepts either the `(uint64 version, bytes innerClaims)` envelope or the
 * legacy bare V1 layout (claims words with no version envelope).
 */
export function decodeGuaranteeClaims(
  data: string | Uint8Array,
): PaymentGuaranteeClaims {
  const hex =
    typeof data === "string" ? ensureHexPrefix(data) : hexFromBytes(data);
  const byteLen = (hex.length - 2) / 2;

  if (byteLen === CLAIMS_ENCODED_BYTES_V1) {
    return decodeV1Claims(hex, null);
  }
  if (byteLen < MIN_ENVELOPE_BYTES) {
    throw new VerificationError(
      `unexpected guarantee claims length: ${byteLen} bytes`,
    );
  }

  const [version, wrapped] = decodeAbiParameters(
    [{ type: "uint64" }, { type: "bytes" }],
    hex,
  );
  if (!isSupportedGuaranteeVersion(Number(version))) {
    throw new VerificationError(
      `unsupported guarantee claims version: ${version}`,
    );
  }
  const innerByteLen = ((wrapped as Hex).length - 2) / 2;
  if (innerByteLen !== CLAIMS_ENCODED_BYTES_V1) {
    throw new VerificationError(
      `unexpected V1 claims inner length: ${innerByteLen} bytes`,
    );
  }
  return decodeV1Claims(wrapped as Hex, Number(version));
}

function decodeV1Claims(
  encoded: Hex,
  envelopeVersion: number | null,
): PaymentGuaranteeClaims {
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
    cycleId,
    reqId,
    user,
    recipient,
    amount,
    asset,
    timestamp,
    claimsVersion,
  ] = decoded;

  if (envelopeVersion !== null && envelopeVersion !== Number(claimsVersion)) {
    throw new VerificationError(
      `mismatched embedded version: envelope=${envelopeVersion}, ` +
        `embedded=${claimsVersion}`,
    );
  }
  if (Number(claimsVersion) !== GUARANTEE_CLAIMS_VERSION) {
    throw new VerificationError(
      `unsupported guarantee claims version: ${claimsVersion}`,
    );
  }

  return {
    domain: bytesFromHex(domain as Hex),
    userAddress: normalizeAddress(user as string),
    recipientAddress: normalizeAddress(recipient as string),
    cycleId: parseU256(cycleId),
    reqId: parseU256(reqId),
    amount: parseU256(amount),
    assetAddress: normalizeAddress(asset as string),
    timestamp: Number(timestamp),
    version: Number(claimsVersion),
  };
}
