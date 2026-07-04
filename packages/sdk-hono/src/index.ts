import type {
  PaywallConfig,
  PaywallGuarantee,
  PaywallVerifier,
} from "@4mica/sdk/server";
import { createPaywall } from "@4mica/sdk/server";
import type { MiddlewareHandler } from "hono";

export type { PaywallConfig, PaywallGuarantee, PaywallVerifier };

declare module "hono" {
  interface ContextVariableMap {
    /** The verified 4Mica payment guarantee, set by the {@link paywall} middleware. */
    paymentGuarantee: PaywallGuarantee;
  }
}

/**
 * Hono middleware that gates a route behind a 4Mica x402 payment.
 *
 * Returns a `402` response with the x402 payment requirements when no valid
 * `X-PAYMENT` header is present; otherwise verifies the payment, exposes the
 * guarantee via `c.get("paymentGuarantee")`, runs the handler, and merges the
 * `X-PAYMENT-RESPONSE` header onto the response.
 *
 * @param verifier - `client`, `client.rpc`, or any guarantee verifier.
 * @param config - Advertised payment requirements for the protected resource.
 */
export function paywall(
  verifier: PaywallVerifier,
  config: PaywallConfig,
): MiddlewareHandler {
  const pw = createPaywall(verifier, config);
  return async (c, next) => {
    const result = await pw.handle(c.req.raw);
    if (result instanceof Response) {
      return result;
    }
    c.set("paymentGuarantee", result.guarantee);
    await next();
    result.headers.forEach((value, key) => {
      c.res.headers.set(key, value);
    });
  };
}
