import type { PaymentSignature } from "@/models";
import type { PaymentPayload } from "@/payment";

export interface PaymentRequirementsV1 {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  payTo: string;
  asset: string;
  resource?: string;
  description?: string;
  mimeType?: string;
  outputSchema?: unknown;
  maxTimeoutSeconds?: number;
  extra?: PaymentRequirementsExtra;
}

export interface PaymentRequirementsV2 {
  scheme: string;
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds?: number;
  extra?: PaymentRequirementsExtra;
}

export type PaymentRequirements = PaymentRequirementsV2;

export interface PaymentRequirementsExtra {
  tabEndpoint?: string;
  // V2 validation policy fields (flat, matching Rust SDK extra map)
  validationRegistryAddress?: string;
  validationChainId?: number;
  validatorAddress?: string;
  validatorAgentId?: string;
  minValidationScore?: number;
  jobHash?: string;
  requiredValidationTag?: string;
}

export interface TabResponse {
  userAddress: string;
  nextReqId?: string;
}

export type X402PaymentPayloadClaims = PaymentPayload["claims"];

export type X402PaymentPayload = PaymentPayload;

export interface X402PaymentEnvelopeV1 {
  x402Version: number;
  scheme: string;
  network: string;
  payload: X402PaymentPayload;
}

export interface X402ResourceInfo {
  url: string;
  description: string;
  mimeType: string;
}

export interface X402PaymentEnvelopeV2 {
  x402Version: number;
  accepted: PaymentRequirementsV2;
  payload: X402PaymentPayload;
  resource: X402ResourceInfo;
}

export interface X402SignedPayment {
  header: string;
  payload: X402PaymentPayload;
  signature: PaymentSignature;
}

export interface X402SettledPayment {
  payment: X402SignedPayment;
  settlement: unknown;
}

export interface X402PaymentRequired {
  x402Version: number;
  error?: string;
  resource: X402ResourceInfo;
  accepts: PaymentRequirementsV2[];
  extensions?: Record<string, unknown>;
}
