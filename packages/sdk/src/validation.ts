import { encodeAbiParameters, type Hex, keccak256 } from "viem";
import type {
  PaymentGuaranteeRequestClaims,
  PaymentGuaranteeRequestClaimsV2,
} from "./models";
import { ensureHexPrefix } from "./utils";

/** Binding domain string used as a prefix when hashing validation subjects. */
export const VALIDATION_SUBJECT_BINDING_DOMAIN = "4MICA_VALIDATION_SUBJECT_V1";

/** Binding domain string used as a prefix when hashing validation requests. */
export const VALIDATION_REQUEST_BINDING_DOMAIN = "4MICA_VALIDATION_REQUEST_V2";

/**
 * Compute the `validationSubjectHash` for a V2 payment guarantee request.
 *
 * Binds the payment subject (tab, user, recipient, amount, asset, timestamp) to
 * a keccak256 hash prefixed by {@link VALIDATION_SUBJECT_BINDING_DOMAIN} so that
 * on-chain validators can verify which payment the validation refers to.
 *
 * @param claims - V1 base claims (the subject fields are the same for V1 and V2).
 * @returns 32-byte keccak256 hash as a `0x`-prefixed hex string.
 */
export function computeValidationSubjectHash(
  claims: PaymentGuaranteeRequestClaims,
): Hex {
  const bindingDomain = keccak256(
    new TextEncoder().encode(VALIDATION_SUBJECT_BINDING_DOMAIN),
  );
  const encoded = encodeAbiParameters(
    [
      { type: "bytes32" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "address" },
      { type: "address" },
      { type: "uint256" },
      { type: "address" },
      { type: "uint64" },
    ],
    [
      bindingDomain,
      claims.tabId,
      claims.reqId,
      claims.userAddress as Hex,
      claims.recipientAddress as Hex,
      claims.amount,
      claims.assetAddress as Hex,
      BigInt(claims.timestamp),
    ],
  );
  return keccak256(encoded);
}

/**
 * Compute the `validationRequestHash` for a V2 payment guarantee request.
 *
 * Binds the full validation policy (chain, registry, validator, score threshold,
 * subject hash, required tag, job hash) to a keccak256 hash prefixed by
 * {@link VALIDATION_REQUEST_BINDING_DOMAIN}. This hash is included in the V2 claims
 * that are BLS-signed by the core service, allowing on-chain verification that the
 * validation policy was not tampered with.
 *
 * @param claims - V2 claims with all validation policy fields populated.
 *   The `validationSubjectHash` field must already be computed via
 *   {@link computeValidationSubjectHash} before calling this function.
 * @returns 32-byte keccak256 hash as a `0x`-prefixed hex string.
 */
export function computeValidationRequestHash(
  claims: PaymentGuaranteeRequestClaimsV2,
): Hex {
  const bindingDomain = keccak256(
    new TextEncoder().encode(VALIDATION_REQUEST_BINDING_DOMAIN),
  );
  const tagHash = keccak256(
    new TextEncoder().encode(claims.requiredValidationTag),
  );
  const encoded = encodeAbiParameters(
    [
      { type: "bytes32" },
      { type: "uint256" },
      { type: "address" },
      { type: "address" },
      { type: "uint256" },
      { type: "bytes32" },
      { type: "uint8" },
      { type: "bytes32" },
      { type: "bytes32" },
    ],
    [
      bindingDomain,
      BigInt(claims.validationChainId),
      claims.validationRegistryAddress as Hex,
      claims.validatorAddress as Hex,
      claims.validatorAgentId,
      ensureHexPrefix(claims.validationSubjectHash),
      claims.minValidationScore,
      tagHash,
      ensureHexPrefix(claims.jobHash),
    ],
  );
  return keccak256(encoded);
}
