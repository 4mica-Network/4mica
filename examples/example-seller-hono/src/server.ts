import "dotenv/config";

import { fromAppNetwork, paymentFromHeader, paywall } from "@4mica/sdk-hono";
import { createAppClient, createClient } from "@4mica/sdk-node";
import { serve } from "@hono/node-server";
import { Hono } from "hono";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const api = createAppClient();
const { listing, policy } = await api.resource();

if (!listing?.payToAddress || !listing.network || !listing.priceAmount) {
  throw new Error(
    "Give the listing a receiving wallet, a network and a price in the dashboard first.",
  );
}

const payTo = listing.payToAddress;
const asset = listing.assetAddress;
const network = fromAppNetwork(listing.network);
const client = await createClient();

const app = new Hono();

app.use(
  "/quote",
  paywall(client, {
    payTo,
    asset: asset ?? ZERO_ADDRESS,
    network,
    amount: listing.priceAmount,
    x402Version: 2,
    description: listing.summary ?? listing.name,
  }),
);

app.get("/quote", async (c) => {
  const paid = paymentFromHeader(c.req.header("x-payment") ?? "", 0);

  const decision = await api.resolveCustomer({
    payerAddress: paid.payerAddress,
    network,
    amount: paid.amount,
  });
  if (!decision.allowed) {
    return c.json({ error: decision.deniedReason }, 403);
  }

  api
    .reportPayment({
      reqId: paid.reqId,
      payerAddress: paid.payerAddress,
      recipientAddress: payTo,
      network,
      assetAddress: asset,
      amount: paid.amount,
      resource: c.req.url,
    })
    .catch((error) => console.error("[seller] report failed:", error));

  return c.json({
    symbol: "ETH",
    price: 3142.55,
    asOf: new Date().toISOString(),
  });
});

const port = Number(process.env.PORT ?? 3001);

serve({ fetch: app.fetch, port }, () => {
  console.log(`[seller] ${listing.name} on http://localhost:${port}`);
  console.log(
    `  GET /quote costs ${listing.priceAmount} on ${network}, paid to ${payTo}`,
  );
  if (policy?.refundPolicy) {
    console.log(`  refund policy: ${policy.refundPolicy}`);
  }
});
