import type {
  PaymentRequirementsExtra,
  PaymentRequirementsV2,
  X402PaymentRequired,
  X402ResourceInfo,
} from "../x402/models";
import { utf8ToBase64 } from "./base64";
import { parsePaymentHeader } from "./envelope";

const X402_VERSION = 1;
const DEFAULT_SCHEME = "4mica";
const PAYMENT_HEADER = "x-payment";
const PAYMENT_RESPONSE_HEADER = "X-PAYMENT-RESPONSE";
const JSON_HEADERS: Record<string, string> = {
  "content-type": "application/json",
};

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

function resolveVerifier(verifier: PaywallVerifier): GuaranteeVerifier {
  if (
    "issueGuarantee" in verifier &&
    typeof (verifier as GuaranteeVerifier).issueGuarantee === "function"
  ) {
    return verifier as GuaranteeVerifier;
  }
  const withRpc = verifier as { rpc?: GuaranteeVerifier };
  if (withRpc.rpc && typeof withRpc.rpc.issueGuarantee === "function") {
    return withRpc.rpc;
  }
  throw new TypeError(
    "paywall verifier must expose issueGuarantee() or a .rpc that does",
  );
}

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

function buildResource(
  input: PaywallInput,
  config: PaywallConfig,
): X402ResourceInfo {
  return {
    url: config.resource?.url ?? input.url,
    description: config.resource?.description ?? config.description ?? "",
    mimeType: config.resource?.mimeType ?? config.mimeType ?? "",
  };
}

function buildRequirements(
  input: PaywallInput,
  config: PaywallConfig,
  error?: string,
): X402PaymentRequired {
  if (config.buildRequirements) {
    const custom = config.buildRequirements(input);
    return error ? { ...custom, error } : custom;
  }
  const accepts: PaymentRequirementsV2 = {
    scheme: config.scheme ?? DEFAULT_SCHEME,
    network: config.network,
    asset: config.asset,
    amount: config.amount,
    payTo: config.payTo,
    maxTimeoutSeconds: config.maxTimeoutSeconds,
    extra: { tabEndpoint: config.tabEndpoint, ...config.extra },
  };
  return {
    x402Version: config.x402Version ?? X402_VERSION,
    ...(error ? { error } : {}),
    resource: buildResource(input, config),
    accepts: [accepts],
  };
}

function requireResponse(
  input: PaywallInput,
  config: PaywallConfig,
  error?: string,
): Extract<PaywallDecision, { ok: false }> {
  return {
    ok: false,
    status: 402,
    headers: { ...JSON_HEADERS },
    body: buildRequirements(input, config, error),
  };
}

/**
 * Create a runtime-neutral x402 paywall.
 *
 * The paywall advertises {@link X402PaymentRequired} when no valid `X-PAYMENT`
 * header is present, and otherwise decodes the header and forwards the payment
 * payload to the verifier's `issueGuarantee`. A successful guarantee means the
 * payment is cryptographically covered → allow the request. On-chain settlement
 * (the cycle-clearing `claimNetCredit` flow) is intentionally left as an
 * out-of-band recipient operation.
 *
 * @param verifier - `client.rpc`, the SDK `Client`, or any {@link GuaranteeVerifier}.
 * @param config - Advertised requirements for the protected resource.
 */
export function createPaywall(
  verifier: PaywallVerifier,
  config: PaywallConfig,
): Paywall {
  const guarantor = resolveVerifier(verifier);

  async function protect(input: PaywallInput): Promise<PaywallDecision> {
    const paymentHeader = input.header(PAYMENT_HEADER);
    if (!paymentHeader) {
      return requireResponse(input, config);
    }

    let payload: unknown;
    try {
      payload = parsePaymentHeader(paymentHeader).payload;
    } catch (err) {
      return requireResponse(
        input,
        config,
        err instanceof Error ? err.message : String(err),
      );
    }

    try {
      const raw = await guarantor.issueGuarantee(payload);
      const claims = typeof raw.claims === "string" ? raw.claims : "";
      const signature = typeof raw.signature === "string" ? raw.signature : "";
      const guarantee: PaywallGuarantee = { claims, signature, raw };
      return {
        ok: true,
        guarantee,
        responseHeaders: {
          [PAYMENT_RESPONSE_HEADER]: utf8ToBase64(
            JSON.stringify({ success: true, guarantee: { claims, signature } }),
          ),
        },
      };
    } catch (err) {
      return requireResponse(
        input,
        config,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  async function handle(request: Request) {
    const decision = await protect({
      method: request.method,
      url: request.url,
      header: (name) => request.headers.get(name),
    });
    if (!decision.ok) {
      return new Response(JSON.stringify(decision.body), {
        status: decision.status,
        headers: decision.headers,
      });
    }
    return {
      ok: true as const,
      headers: new Headers(decision.responseHeaders),
      guarantee: decision.guarantee,
    };
  }

  return { protect, handle };
}
