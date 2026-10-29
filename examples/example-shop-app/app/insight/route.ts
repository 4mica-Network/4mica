import { paymentFromHeader } from "@4mica/sdk/app";
import {
  FacilitatorResponseError,
  type HTTPRequestContext,
  type HTTPResponseInstructions,
  withPrivateCacheControl,
} from "@x402/core/server";
import { getShop } from "@/lib/shop";

export const dynamic = "force-dynamic";

const INSIGHTS = [
  "Credit beats prepayment: your buyers sign promises, not transfers.",
  "One settlement per cycle beats one transaction per request.",
  "Collateral once, pay per call forever.",
  "Agents that can borrow can act without waiting for funding.",
  "A guarantee is a receipt the network already agreed to honour.",
];

const respond = ({
  status,
  headers,
  body,
  isHtml,
}: HTTPResponseInstructions) =>
  isHtml
    ? new Response(String(body ?? ""), {
        status,
        headers: { ...headers, "content-type": "text/html; charset=utf-8" },
      })
    : Response.json(body ?? {}, { status, headers });

const decodedRoutePath = (path: string) => {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
};

const contextFor = (request: Request): HTTPRequestContext => {
  const url = new URL(request.url);
  const header = (name: string) => request.headers.get(name) ?? undefined;
  return {
    adapter: {
      getHeader: header,
      getMethod: () => request.method,
      getPath: () => url.pathname,
      getUrl: () => request.url,
      getAcceptHeader: () => header("accept") ?? "",
      getUserAgent: () => header("user-agent") ?? "",
      getQueryParams: () => Object.fromEntries(url.searchParams),
      getQueryParam: (name) => url.searchParams.get(name) ?? undefined,
    },
    path: url.pathname,
    decodedPath: decodedRoutePath(url.pathname),
    method: request.method,
    paymentHeader: header("payment-signature") ?? header("x-payment"),
  };
};

export async function GET(request: Request) {
  const shop = await getShop();
  const context = contextFor(request);

  try {
    const verified = await shop.http.processHTTPRequest(context);
    if (verified.type === "payment-error") {
      return respond(verified.response);
    }
    if (verified.type === "no-payment-required") {
      throw new Error(`${context.method} ${context.path} is not a paid route`);
    }

    const paid = paymentFromHeader(context.paymentHeader ?? "", 0);
    const decision = await shop.api.resolveCustomer({
      payerAddress: paid.payerAddress,
      network: shop.network,
      amount: paid.amount,
    });
    if (!decision.allowed) {
      // A refused request is not settled, so the payer is not charged.
      const cancelled = await verified.cancellationDispatcher.cancel({
        reason: "handler_failed",
        responseStatus: 403,
      });
      const headers = shop.http.createFailurePathSettlementHeaders(
        cancelled,
        verified.beforeHandlerSettlement,
        verified.paymentPayload,
      );
      return Response.json(
        { error: decision.deniedReason },
        { status: 403, headers },
      );
    }

    const body = {
      insight: INSIGHTS[Math.floor(Math.random() * INSIGHTS.length)],
      soldBy: shop.listing.name,
    };

    const settled = await shop.http.processSettlement(
      verified.paymentPayload,
      verified.paymentRequirements,
      verified.declaredExtensions,
      { request: context, responseBody: Buffer.from(JSON.stringify(body)) },
      undefined,
      verified.beforeHandlerSettlement,
    );
    if (!settled.success) {
      return respond(settled.response);
    }

    return Response.json(body, {
      headers: {
        ...settled.headers,
        "cache-control": withPrivateCacheControl(null),
      },
    });
  } catch (error) {
    if (error instanceof FacilitatorResponseError) {
      return Response.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
