import type {
  PaywallConfig,
  PaywallGuarantee,
  PaywallVerifier,
} from "@4mica/sdk/server";
import { createPaywall } from "@4mica/sdk/server";

export * from "@4mica/sdk/app";
export type { PaywallConfig, PaywallGuarantee, PaywallVerifier };

export type RouteHandler = (
  request: Request,
  context?: unknown,
) => Response | Promise<Response>;

export function withPaywall(
  handler: RouteHandler,
  verifier: PaywallVerifier,
  config: PaywallConfig,
): RouteHandler {
  const pw = createPaywall(verifier, config);
  return async (request, context) => {
    const result = await pw.handle(request);
    if (result instanceof Response) {
      return result;
    }
    const response = await handler(request, context);
    result.headers.forEach((value, key) => {
      response.headers.set(key, value);
    });
    return response;
  };
}

export function paywallMiddleware(
  verifier: PaywallVerifier,
  config: PaywallConfig,
): (request: Request) => Promise<Response | undefined> {
  const pw = createPaywall(verifier, config);
  return async (request) => {
    const result = await pw.handle(request);
    return result instanceof Response ? result : undefined;
  };
}
