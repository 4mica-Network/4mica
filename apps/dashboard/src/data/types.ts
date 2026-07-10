/**
 * Dashboard domain types. The 4Mica SDK has no "agent profile" model, so these
 * are dashboard-owned. Each field is annotated with the SDK trust primitive it
 * maps onto, so flipping from sandbox to a live hosted API is mechanical.
 */

export type Mode = "sandbox" | "live";

export type Verification = "unverified" | "pending" | "verified";

/** Mirrors packages/sdk PaymentGuaranteeValidationPolicyV2 (V2 validation). */
export interface ValidationPolicy {
  /** validatorAgentId (uint256 → string). */
  validatorAgentId?: string;
  /** minValidationScore, 1–100 (uint8). */
  minValidationScore: number;
  /** requiredValidationTag. */
  requiredValidationTag?: string;
  /** validationRegistryAddress — from trustedValidationRegistries allow-list. */
  validationRegistryAddress?: string;
}

export interface AgentPricing {
  /** x402 PaymentRequirements.amount (atomic units, string). */
  amount: string;
  /** Asset address (0x0 = native). */
  asset: string;
  network: string;
}

export interface AgentProfile {
  id: string;
  name: string;
  description: string;
  /** Dashboard-only quality metrics (SDK models neither). */
  accuracy: number;
  uptime: number;
  pricing: AgentPricing;
  /** payTo recipient address. */
  payTo: string;
  policy: ValidationPolicy;
  verification: Verification;
  /** Owner has published the profile so other agents can request to pay/use. */
  published: boolean;
  /** Maps to UserSuspensionStatus (block-list). */
  suspended: boolean;
  createdAt: string;
}

export type TransactionStatus = "settled" | "pending" | "failed";

export interface Transaction {
  id: string;
  from: string;
  to: string;
  /** Atomic units (string), like x402 amounts. */
  amount: string;
  asset: string;
  status: TransactionStatus;
  createdAt: string;
}

/** trustedValidationRegistries allow-list entry. */
export interface WhitelistEntry {
  agentId: string;
  name: string;
  allowed: boolean;
  addedAt: string;
}

export interface NewAgentInput {
  name: string;
  description: string;
  amount: string;
  minValidationScore: number;
}
