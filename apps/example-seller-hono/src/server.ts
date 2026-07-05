import type { PaywallConfig, PaywallVerifier } from "@4mica/sdk-hono";
import { paywall } from "@4mica/sdk-hono";
import { serve } from "@hono/node-server";
import { Hono } from "hono";

/**
 * SELLER (recipient) — gates `GET /premium` behind a 4Mica x402 payment.
 *
 * Real usage — build a recipient client from env and pass `client.rpc`:
 *
 *   import { createClient } from "@4mica/sdk-node";
 *   const client = await createClient();       // reads 4MICA_* env
 *   ...paywall(client.rpc, PAYWALL_CONFIG)
 *
 * On-chain settlement is out-of-band: claim net credit for a cleared cycle with
 * `client.recipient.claimNetCredit(cycleId)`.
 */
const verifier: PaywallVerifier = {
  async issueGuarantee(payload) {
    console.log("[seller] verifying payment payload:", payload);
    return { claims: "0xdemoClaims", signature: "0xdemoSignature" };
  },
};

export const PAYWALL_CONFIG: PaywallConfig = {
  payTo: "0x1111111111111111111111111111111111111111",
  asset: "0x0000000000000000000000000000000000000000",
  network: "base-sepolia",
  amount: "1000",
  tabEndpoint: "http://localhost:3001/session",
  description: "Premium market data feed",
};

const app = new Hono();

app.post("/session", (c) =>
  c.json({
    userAddress: "0x2222222222222222222222222222222222222222",
    nextReqId: "0x1",
  }),
);

app.use("/premium", paywall(verifier, PAYWALL_CONFIG));
app.get("/premium", (c) => {
  const guarantee = c.get("paymentGuarantee");
  return c.json({
    ok: true,
    guarantee,
    data: "🔓 premium market data unlocked",
  });
});

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port }, () => {
  console.log(`[seller-hono] listening on http://localhost:${port}`);
  console.log(`  GET /premium is paywalled — run the buyer to pay for it.`);
});
