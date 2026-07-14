import type { SigningScheme } from "@/models";

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
