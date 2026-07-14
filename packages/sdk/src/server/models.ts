import type {
  PaymentRequirementsExtra,
  X402PaymentEnvelopeV1,
  X402PaymentEnvelopeV2,
  X402PaymentRequired,
  X402ResourceInfo,
} from "@/x402/models";

/** Decoded `X-PAYMENT` envelope: either the V1 or V2 wire shape. */
export type X402PaymentEnvelope = X402PaymentEnvelopeV1 | X402PaymentEnvelopeV2;

/**
 * Minimal verification surface the paywall needs: issue a payment guarantee for
 * an already-serialized wire payload. The SDK `Client`'s `rpc` proxy and its
 * `RpcProxy` both satisfy this structurally, so callers can pass `client.rpc`.
 */
export interface GuaranteeVerifier {
  issueGuarantee(payload: unknown): Promise<Record<string, unknown>>;
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
  /** Endpoint the payer calls to open/resolve a tab (advertised via `extra.tabEndpoint`). */
  tabEndpoint: string;
  scheme?: string;
  x402Version?: number;
  description?: string;
  mimeType?: string;
  maxTimeoutSeconds?: number;
  /** Extra requirements (e.g. a V2 validation policy); merged over `tabEndpoint`. */
  extra?: PaymentRequirementsExtra;
  /** Override the described resource in the 402 body. */
  resource?: Partial<X402ResourceInfo>;
  /** Fully override the advertised 402 body. Takes precedence over every field above. */
  buildRequirements?: (input: PaywallInput) => X402PaymentRequired;
}

export interface PaywallGuarantee {
  /** ABI-encoded guarantee claims (hex). */
  claims: string;
  /** BLS12-381 G2 signature (hex). */
  signature: string;
  /** Raw guarantee record returned by the core RPC. */
  raw: Record<string, unknown>;
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
