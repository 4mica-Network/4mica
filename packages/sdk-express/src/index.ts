import type {
  PaywallConfig,
  PaywallGuarantee,
  PaywallVerifier,
} from "@4mica/sdk/server";
import { createPaywall } from "@4mica/sdk/server";
import type { NextFunction, Request, RequestHandler, Response } from "express";

export type { PaywallConfig, PaywallGuarantee, PaywallVerifier };

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
