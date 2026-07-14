import type {
  PaywallConfig,
  PaywallGuarantee,
  PaywallVerifier,
} from "@4mica/sdk/server";
import { createPaywall } from "@4mica/sdk/server";
import type { NextFunction, Request, RequestHandler, Response } from "express";

export type { PaywallConfig, PaywallGuarantee, PaywallVerifier };

/**
 * Express middleware that gates a route behind a 4Mica x402 payment.
 *
 * Responds `402` with the x402 payment requirements when no valid `X-PAYMENT`
 * header is present; otherwise verifies the payment, sets `X-PAYMENT-RESPONSE`,
 * exposes the guarantee at `res.locals.paymentGuarantee`, and calls `next()`.
 *
 * @param verifier - `client`, `client.rpc`, or any guarantee verifier.
 * @param config - Advertised payment requirements for the protected resource.
 */
export function paywall(
  verifier: PaywallVerifier,
  config: PaywallConfig,
): RequestHandler {
  const pw = createPaywall(verifier, config);
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const decision = await pw.protect({
        method: req.method,
        url: req.originalUrl || req.url,
        header: (name) => req.get(name) ?? null,
      });
      if (!decision.ok) {
        res.status(decision.status).set(decision.headers).json(decision.body);
        return;
      }
      for (const [key, value] of Object.entries(decision.responseHeaders)) {
        res.setHeader(key, value);
      }
      (res.locals as Record<string, unknown>).paymentGuarantee =
        decision.guarantee;
      next();
    } catch (err) {
      next(err);
    }
  };
}
