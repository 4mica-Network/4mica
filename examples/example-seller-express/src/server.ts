import "dotenv/config";

import { NETWORKS } from "@4mica/sdk";
import {
  createAppClient,
  fromAppNetwork,
  paymentFromHeader,
} from "@4mica/sdk/app";
import {
  FourMicaFacilitatorClient,
  x402ResourceServer,
} from "@4mica/x402/server";
import { paymentMiddleware } from "@4mica/x402/server/express";
import express from "express";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const apiKey = process.env.FOURMICA_API_KEY;
if (!apiKey) {
  throw new Error("FOURMICA_API_KEY is not set");
}
const api = createAppClient({ apiKey, baseUrl: process.env.FOURMICA_API_URL });
const { listing, policy } = await api.resource();

if (!listing?.payToAddress || !listing.network || !listing.priceAmount) {
  throw new Error(
    "Give the listing a receiving wallet, a network and a price in the dashboard first.",
  );
}

const payTo = listing.payToAddress;
const asset = listing.assetAddress;
// x402 names networks by CAIP-2 id, such as eip155:84532.
const network = NETWORKS[fromAppNetwork(listing.network)]
  .caip2 as `${string}:${string}`;
const port = Number(process.env.PORT ?? 3000);

const facilitator = new FourMicaFacilitatorClient(
  process.env.FACILITATOR_URL
    ? { url: process.env.FACILITATOR_URL }
    : undefined,
);

// Settlement runs after the route answers, so the guarantee receipt is only
// known here, not in the handler.
const server = new x402ResourceServer(facilitator).onAfterSettle(
  async ({ paymentPayload, result }) => {
    const paid = (paymentPayload.payload as { payload: Record<string, string> })
      .payload;
    const receipt = result.extra?.receipt as
      | { receipt: string; signature: string }
      | undefined;
    api
      .reportPayment({
        reqId: paid.req_id,
        payerAddress: paid.user_address,
        recipientAddress: payTo,
        network,
        assetAddress: asset,
        amount: paid.amount,
        guaranteeClaims: receipt?.receipt,
        guaranteeSignature: receipt?.signature,
        resource: `http://localhost:${port}/quote`,
      })
      .catch((error) => console.error("[seller] report failed:", error));
  },
);

const app = express();

app.use(
  paymentMiddleware(
    {
      "GET /quote": {
        accepts: {
          scheme: "4mica-credit",
          price: { amount: listing.priceAmount, asset: asset ?? ZERO_ADDRESS },
          network,
          payTo,
        },
        description: listing.summary ?? listing.name,
      },
    },
    server,
  ),
);

app.get("/quote", async (req, res) => {
  const paid = paymentFromHeader(req.get("payment-signature") ?? "", 0);

  const decision = await api.resolveCustomer({
    payerAddress: paid.payerAddress,
    network,
    amount: paid.amount,
  });
  if (!decision.allowed) {
    // A refused request is not settled, so the payer is not charged.
    res.status(403).json({ error: decision.deniedReason });
    return;
  }

  res.json({ symbol: "ETH", price: 3142.55, asOf: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`[seller] ${listing.name} on http://localhost:${port}`);
  console.log(
    `  GET /quote costs ${listing.priceAmount} on ${network}, paid to ${payTo}`,
  );
  if (policy?.refundPolicy) {
    console.log(`  refund policy: ${policy.refundPolicy}`);
  }
});
