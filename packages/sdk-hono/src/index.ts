import type {
  PaywallConfig,
  PaywallGuarantee,
  PaywallVerifier,
} from "@4mica/sdk/server";
import { createPaywall } from "@4mica/sdk/server";
import type { MiddlewareHandler } from "hono";

export * from "@4mica/sdk/app";
export type { PaywallConfig, PaywallGuarantee, PaywallVerifier };

declare module "hono" {
  interface ContextVariableMap {
    paymentGuarantee: PaywallGuarantee;
  }
}

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
