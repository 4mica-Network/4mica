import { paymentFromHeader, withPaywall } from "@4mica/sdk-next";
import { getShop, type Shop } from "@/lib/shop";

export const dynamic = "force-dynamic";

const INSIGHTS = [
  "Credit beats prepayment: your buyers sign promises, not transfers.",
  "One settlement per cycle beats one transaction per request.",
  "Collateral once, pay per call forever.",
  "Agents that can borrow can act without waiting for funding.",
  "A guarantee is a receipt the network already agreed to honour.",
];

const paywalled = (shop: Shop) =>
  withPaywall(
    async (request, _context, guarantee) => {
      const paid = paymentFromHeader(
        request.headers.get("x-payment") ?? "",
        shop.decimals,
      );

      const decision = await shop.api.resolveCustomer({
        payerAddress: paid.payerAddress,
        network: shop.network,
        amount: paid.amount,
      });
      if (!decision.allowed) {
        return Response.json({ error: decision.deniedReason }, { status: 403 });
      }

      const item = INSIGHTS[Math.floor(Math.random() * INSIGHTS.length)];
      shop.api
        .reportPayment({
          reqId: paid.reqId,
          payerAddress: paid.payerAddress,
          recipientAddress: shop.payTo,
          network: shop.network,
          assetAddress: shop.listing.assetAddress,
          amount: paid.amount,
          guaranteeClaims: guarantee.claims,
          guaranteeSignature: guarantee.signature,
          resource: request.url,
          description: "Market insight",
        })
        .catch((error) => console.error("[shop] report failed:", error));

      return Response.json({ insight: item, soldBy: shop.listing.name });
    },
    shop.client,
    {
      payTo: shop.payTo,
      asset: shop.asset,
      network: shop.network,
      amount: shop.price,
      x402Version: 2,
      description: shop.listing.summary ?? shop.listing.name,
    },
  );

let handler: Promise<ReturnType<typeof paywalled>> | undefined;

export async function GET(request: Request) {
  handler ??= getShop().then(paywalled);
  return (await handler)(request);
}
