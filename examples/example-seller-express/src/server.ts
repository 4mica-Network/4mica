import "dotenv/config";

import { toBaseUnits, toCaip2, ZERO_ADDRESS } from "@4mica/sdk";
import {
  createAppClient,
  parseSettlement,
  paymentFromHeader,
} from "@4mica/sdk/app";
import {
  FourMicaFacilitatorClient,
  x402ResourceServer,
} from "@4mica/x402/server";
import { paymentMiddleware } from "@4mica/x402/server/express";
import express from "express";

const apiKey = process.env.FOURMICA_API_KEY;
if (!apiKey) {
  throw new Error("FOURMICA_API_KEY is not set");
}
const api = createAppClient({ apiKey, baseUrl: process.env.FOURMICA_API_URL });
const { listing, policy } = await api.resource();

if (!listing) {
  throw new Error("FOURMICA_API_KEY is not tied to a listing.");
}

const {
  name,
  summary,
  payToAddress: payTo,
  assetAddress: asset,
  assetDecimals: decimals,
  network,
  priceAmount: price,
} = listing;

if (!payTo || !network || !price || decimals === null) {
  throw new Error(
    "Give the listing a receiving wallet, a network and a price in the dashboard first.",
  );
}

const port = Number(process.env.PORT ?? 3000);

const facilitator = new FourMicaFacilitatorClient(
  process.env.FACILITATOR_URL
    ? { url: process.env.FACILITATOR_URL }
    : undefined,
);
const server = new x402ResourceServer(facilitator);

// Settlement runs after the route answers, so the guarantee receipt is only
// known here, not in the handler.
server.onAfterSettle(async (settlement) => {
  const { reqId, payerAddress, amount, guaranteeClaims, guaranteeSignature } =
    parseSettlement(settlement);

  try {
    await api.reportPayment({
      reqId,
      payerAddress,
      amount,
      guaranteeClaims,
      guaranteeSignature,
      recipientAddress: payTo,
      network,
      assetAddress: asset,
      resource: `http://localhost:${port}/quote`,
    });
  } catch (error) {
    console.error("[seller] report failed:", error);
  }
});

const app = express();

app.use(
  paymentMiddleware(
    {
      "GET /quote": {
        accepts: {
          scheme: "4mica-credit",
          price: {
            amount: toBaseUnits(price, decimals).toString(),
            asset: asset ?? ZERO_ADDRESS,
          },
          network: toCaip2(network),
          payTo,
        },
        description: summary ?? name,
      },
    },
    server,
  ),
);

app.get("/quote", async (req, res) => {
  const paid = paymentFromHeader(req.get("payment-signature") ?? "", decimals);

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
  console.log(`[seller] ${name} on http://localhost:${port}`);
  console.log(`  GET /quote costs ${price} on ${network}, paid to ${payTo}`);
  if (policy?.refundPolicy) {
    console.log(`  refund policy: ${policy.refundPolicy}`);
  }
});
