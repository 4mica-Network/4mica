import type {
  PaywallConfig,
  PaywallGuarantee,
  PaywallVerifier,
} from "@4mica/sdk/server";
import { createPaywall } from "@4mica/sdk/server";

export type { PaywallConfig, PaywallGuarantee, PaywallVerifier };

/**
 * A Next.js App Router route handler. `NextRequest` extends the Web `Request`
 * and `NextResponse` extends `Response`, so these helpers are Web-standard and
 * edge-safe — no `next` import required.
 */
export type RouteHandler = (
  request: Request,
  context?: unknown,
) => Response | Promise<Response>;

/**
 * Wrap an App Router route handler so it is gated behind a 4Mica x402 payment.
 *
 * When no valid `X-PAYMENT` header is present, returns a `402` with the x402
 * payment requirements. Otherwise verifies the payment, runs `handler`, and
 * merges the `X-PAYMENT-RESPONSE` header onto its response.
 *
 * @example
 * ```ts
 * export const GET = withPaywall(async () => Response.json({ ok: true }), client.rpc, config);
 * ```
 */
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

/**
 * Build a `middleware.ts` handler that gates matched routes behind a payment.
 *
 * Returns a `402` `Response` when payment is required/invalid, or `undefined`
 * to let the request continue. Edge-safe — usable without `export const runtime
 * = "nodejs"` (Node runtime remains a supported fallback).
 *
 * @example
 * ```ts
 * // middleware.ts
 * const gate = paywallMiddleware(client.rpc, config);
 * export async function middleware(req: Request) { return (await gate(req)) ?? NextResponse.next(); }
 * ```
 */
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
