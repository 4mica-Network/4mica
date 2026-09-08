import type {
  PaymentRequirementsExtra,
  X402PaymentRequired,
  X402ResourceInfo,
} from "@/x402/models";

export type { X402PaymentEnvelope } from "@/x402/models";

/**
 * Minimal verification surface the paywall needs: issue a payment guarantee
 * for an already-serialized wire payload. The SDK `Client`'s `rpc` proxy and
 * its `RpcProxy` both satisfy this structurally, so callers can pass
 * `client.rpc` or the `Client` itself.
 */
export interface GuaranteeVerifier {
  issueGuarantee(
    payload: unknown,
  ): Promise<{ claims: string; signature: string }>;
}

/** A bare verifier, or anything exposing one at `.rpc` (e.g. the SDK `Client`). */
export type PaywallVerifier = GuaranteeVerifier | { rpc: GuaranteeVerifier };

/** What the framework adapter hands the paywall: method, url, and a header reader. */
export interface PaywallInput {
  method: string;
  url: string;
  /** Case-insensitive header lookup, returning `null` when absent. */
  header: (name: string) => string | null;
}

/** Advertised payment requirements + how to describe the protected resource. */
export interface PaywallConfig {
  /** Recipient address that collateral is claimed against. */
  payTo: string;
  /** Asset (token) address, or the zero address for native ETH. */
  asset: string;
  /** Network id (shorthand or CAIP-2) advertised to the payer. */
  network: string;
  /** Amount required, as an integer string in the asset's base units. */
  amount: string;
  scheme?: string;
  x402Version?: number;
  description?: string;
  mimeType?: string;
  maxTimeoutSeconds?: number;
  /** Extra requirements — e.g. `{ validation: { validator, subject, … } }` to gate the payment on a validator. */
  extra?: PaymentRequirementsExtra;
  /** Override the described resource in the 402 body. */
  resource?: Partial<
    Pick<X402ResourceInfo, "url" | "description" | "mimeType">
  >;
  /** Fully override the advertised 402 body. Takes precedence over every field above. */
  buildRequirements?: (input: PaywallInput) => X402PaymentRequired;
}

export interface PaywallGuarantee {
  /** ABI-encoded guarantee claims (hex). */
  claims: string;
  /** BLS12-381 G2 signature (hex). */
  signature: string;
  /** Raw guarantee record returned by the core RPC. */
  raw: { claims: string; signature: string };
}

export type PaywallDecision =
  | {
      ok: true;
      guarantee: PaywallGuarantee;
      responseHeaders: Record<string, string>;
    }
  | {
      ok: false;
      status: 402;
      headers: Record<string, string>;
      body: X402PaymentRequired;
    };

export interface Paywall {
  /** Low-level primitive: decide from a headers-in / decision-out request. */
  protect(input: PaywallInput): Promise<PaywallDecision>;
  /**
   * Web-Fetch convenience wrapper. Returns a 402 `Response` when payment is
   * required/invalid, or `{ ok: true, headers, guarantee }` for the adapter to
   * merge onto the downstream response (the headers include `X-PAYMENT-RESPONSE`).
   */
  handle(
    request: Request,
  ): Promise<
    Response | { ok: true; headers: Headers; guarantee: PaywallGuarantee }
  >;
}
