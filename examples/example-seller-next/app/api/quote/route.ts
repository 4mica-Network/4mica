import {
  fromAppNetwork,
  paymentFromHeader,
  withPaywall,
} from "@4mica/sdk-next";
import { createAppClient, createClient } from "@4mica/sdk-node";

export const dynamic = "force-dynamic";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const init = async () => {
  const api = createAppClient();
  const { listing } = await api.resource();

  if (!listing?.payToAddress || !listing.network || !listing.priceAmount) {
    throw new Error(
      "Give the listing a receiving wallet, a network and a price in the dashboard first.",
    );
  }

  const payTo = listing.payToAddress;
  const asset = listing.assetAddress;
  const network = fromAppNetwork(listing.network);
  const client = await createClient();

  return withPaywall(
    async (request) => {
      const paid = paymentFromHeader(request.headers.get("x-payment") ?? "", 0);

      const decision = await api.resolveCustomer({
        payerAddress: paid.payerAddress,
        network,
        amount: paid.amount,
      });
      if (!decision.allowed) {
        return Response.json({ error: decision.deniedReason }, { status: 403 });
      }

      api
        .reportPayment({
          reqId: paid.reqId,
          payerAddress: paid.payerAddress,
          recipientAddress: payTo,
          network,
          assetAddress: asset,
          amount: paid.amount,
          resource: request.url,
        })
        .catch((error) => console.error("[seller] report failed:", error));

      return Response.json({
        symbol: "ETH",
        price: 3142.55,
        asOf: new Date().toISOString(),
      });
    },
    client,
    {
      payTo,
      asset: asset ?? ZERO_ADDRESS,
      network,
      amount: listing.priceAmount,
      x402Version: 2,
      description: listing.summary ?? listing.name,
    },
  );
};

let ready: ReturnType<typeof init> | undefined;

export async function GET(request: Request) {
  ready ??= init();
  return (await ready)(request);
}
