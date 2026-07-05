import { SigningError } from "./errors";
import {
  type PaymentGuaranteeRequestClaims,
  PaymentGuaranteeRequestClaimsV2,
  type PaymentSignature,
  type SigningScheme,
} from "./models";
import { serializeU256 } from "./utils";

interface PaymentPayloadClaimsBase {
  user_address: string;
  recipient_address: string;
  req_id: string;
  amount: string;
  timestamp: number;
  asset_address: string;
}

/** Wire-format representation of V1 payment guarantee claims sent to the core RPC. */
export interface PaymentPayloadClaims extends PaymentPayloadClaimsBase {
  version: "v1";
}

/** Wire-format representation of V2 payment guarantee claims sent to the core RPC. */
export interface PaymentPayloadClaimsV2 extends PaymentPayloadClaimsBase {
  version: "v2";
  validation_registry_address: string;
  validation_request_hash: string;
  validation_chain_id: number;
  validator_address: string;
  validator_agent_id: string;
  min_validation_score: number;
  validation_subject_hash: string;
  job_hash: string;
  required_validation_tag: string;
}

/** Assembled payment payload ready to be submitted to the core RPC `issueGuarantee` endpoint. */
export interface PaymentPayload {
  claims: PaymentPayloadClaims | PaymentPayloadClaimsV2;
  /** 65-byte ECDSA signature as a `0x`-prefixed hex string. */
  signature: string;
  scheme: SigningScheme;
}

/**
 * Serialize V1 payment claims to the wire format expected by the core RPC.
 *
 * @param claims - V1 payment guarantee request claims.
 * @returns JSON-serialisable object with snake_case keys and hex-encoded `uint256` fields.
 */
export function serializePaymentClaims(
  claims: PaymentGuaranteeRequestClaims,
): PaymentPayloadClaims {
  return {
    version: "v1",
    user_address: claims.userAddress.toLowerCase(),
    recipient_address: claims.recipientAddress.toLowerCase(),
    req_id: serializeU256(claims.reqId),
    amount: serializeU256(claims.amount),
    asset_address: claims.assetAddress.toLowerCase(),
    timestamp: claims.timestamp,
  };
}

/**
 * Serialize V2 payment claims to the wire format expected by the core RPC.
 *
 * Extends the V1 serialisation with the nine additional validation policy fields.
 *
 * @param claims - V2 payment guarantee request claims with validation policy.
 * @returns JSON-serialisable object with snake_case keys and hex-encoded `uint256` fields.
 */
export function serializePaymentClaimsV2(
  claims: PaymentGuaranteeRequestClaimsV2,
): PaymentPayloadClaimsV2 {
  return {
    ...serializePaymentClaims(claims),
    version: "v2",
    validation_registry_address: claims.validationRegistryAddress.toLowerCase(),
    validation_request_hash: claims.validationRequestHash.toLowerCase(),
    validation_chain_id: claims.validationChainId,
    validator_address: claims.validatorAddress.toLowerCase(),
    validator_agent_id: serializeU256(claims.validatorAgentId),
    min_validation_score: claims.minValidationScore,
    validation_subject_hash: claims.validationSubjectHash.toLowerCase(),
    job_hash: claims.jobHash.toLowerCase(),
    required_validation_tag: claims.requiredValidationTag,
  };
}

/**
 * Build a {@link PaymentPayload} from V2 claims and a {@link PaymentSignature}.
 *
 * @param claims - V2 payment guarantee request claims.
 * @param signature - Pre-built signature object (includes the scheme).
 */
export function buildPaymentPayload(
  claims: PaymentGuaranteeRequestClaimsV2,
  signature: PaymentSignature,
): PaymentPayload;
/**
 * Build a {@link PaymentPayload} from V2 claims, a raw signature hex string, and a scheme.
 *
 * @param claims - V2 payment guarantee request claims.
 * @param signature - 65-byte ECDSA signature as a `0x`-prefixed hex string.
 * @param scheme - Signing scheme used to produce the signature.
 */
export function buildPaymentPayload(
  claims: PaymentGuaranteeRequestClaimsV2,
  signature: string,
  scheme: SigningScheme,
): PaymentPayload;
/**
 * Build a {@link PaymentPayload} from V1 claims and a {@link PaymentSignature}.
 *
 * @param claims - V1 payment guarantee request claims.
 * @param signature - Pre-built signature object (includes the scheme).
 */
export function buildPaymentPayload(
  claims: PaymentGuaranteeRequestClaims,
  signature: PaymentSignature,
): PaymentPayload;
/**
 * Build a {@link PaymentPayload} from V1 claims, a raw signature hex string, and a scheme.
 *
 * @param claims - V1 payment guarantee request claims.
 * @param signature - 65-byte ECDSA signature as a `0x`-prefixed hex string.
 * @param scheme - Signing scheme used to produce the signature.
 * @throws {@link SigningError} if `signature` is a string but no `scheme` is provided.
 */
export function buildPaymentPayload(
  claims: PaymentGuaranteeRequestClaims,
  signature: string,
  scheme: SigningScheme,
): PaymentPayload;
export function buildPaymentPayload(
  claims: PaymentGuaranteeRequestClaims | PaymentGuaranteeRequestClaimsV2,
  signature: PaymentSignature | string,
  scheme?: SigningScheme,
): PaymentPayload {
  const signed =
    typeof signature === "string"
      ? (() => {
          if (!scheme) {
            throw new SigningError(
              "scheme is required when providing a signature string",
            );
          }
          return { signature, scheme };
        })()
      : signature;
  const serialized =
    claims instanceof PaymentGuaranteeRequestClaimsV2
      ? serializePaymentClaimsV2(claims)
      : serializePaymentClaims(claims);
  return {
    claims: serialized,
    signature: signed.signature,
    scheme: signed.scheme,
  };
}
