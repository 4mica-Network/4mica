import { utf8ToBase64 } from "@/server/base64";
import { parsePaymentHeader } from "@/server/envelope";
import type {
  GuaranteeVerifier,
  Paywall,
  PaywallConfig,
  PaywallDecision,
  PaywallGuarantee,
  PaywallInput,
  PaywallVerifier,
} from "@/server/models";
import {
  PaymentRequirementsV2,
  SCHEME_4MICA_CREDIT,
  X402PaymentRequired,
  X402ResourceInfo,
} from "@/x402/models";

const X402_VERSION = 1;
const PAYMENT_HEADER = "x-payment";
const PAYMENT_RESPONSE_HEADER = "X-PAYMENT-RESPONSE";
const JSON_HEADERS: Record<string, string> = {
  "content-type": "application/json",
};

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

function buildResource(
  input: PaywallInput,
  config: PaywallConfig,
): X402ResourceInfo {
  return new X402ResourceInfo({
    url: config.resource?.url ?? input.url,
    description: config.resource?.description ?? config.description ?? "",
    mimeType: config.resource?.mimeType ?? config.mimeType ?? "",
  });
}

function buildRequirements(
  input: PaywallInput,
  config: PaywallConfig,
  error?: string,
): X402PaymentRequired {
  if (config.buildRequirements) {
    const custom = config.buildRequirements(input);
    if (error) {
      custom.error = error;
    }
    return custom;
  }
  const accepts = new PaymentRequirementsV2({
    scheme: config.scheme ?? SCHEME_4MICA_CREDIT,
    network: config.network,
    asset: config.asset,
    amount: config.amount,
    payTo: config.payTo,
    maxTimeoutSeconds: config.maxTimeoutSeconds,
    extra: { ...config.extra },
  });
  return new X402PaymentRequired({
    x402Version: config.x402Version ?? X402_VERSION,
    error,
    resource: buildResource(input, config),
    accepts: [accepts],
  });
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

function serializeRequired(body: X402PaymentRequired): string {
  return JSON.stringify({
    x402Version: body.x402Version,
    ...(body.error ? { error: body.error } : {}),
    resource: body.resource.toPayload(),
    accepts: body.accepts.map((entry) => entry.toPayload()),
    ...(body.extensions ? { extensions: body.extensions } : {}),
  });
}

/**
 * Create a runtime-neutral x402 paywall.
 *
 * The paywall advertises {@link X402PaymentRequired} when no valid `X-PAYMENT`
 * header is present, and otherwise decodes the header and forwards the payment
 * payload to the verifier's `issueGuarantee`. A successful guarantee means the
 * payment is cryptographically covered → allow the request. On-chain settlement
 * (the cycle-clearing claim flow) is intentionally left as an out-of-band
 * recipient operation.
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
      const cert = await guarantor.issueGuarantee(payload);
      const claims = typeof cert.claims === "string" ? cert.claims : "";
      const signature =
        typeof cert.signature === "string" ? cert.signature : "";
      const guarantee: PaywallGuarantee = {
        claims,
        signature,
        raw: { claims, signature },
      };
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
      return new Response(serializeRequired(decision.body), {
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
