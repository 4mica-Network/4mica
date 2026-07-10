import type { PaywallConfig, PaywallVerifier } from "@4mica/sdk-express";
import { paywall } from "@4mica/sdk-express";
import express from "express";

/**
 * SELLER (recipient) — gates `GET /premium` behind a 4Mica x402 payment.
 *
 * The paywall returns `402` with payment requirements when there's no valid
 * `X-PAYMENT` header, and otherwise verifies the payment (issues a guarantee)
 * and lets the request through with an `X-PAYMENT-RESPONSE` header.
 *
 * Real usage — build a recipient client from env and pass `client.rpc`:
 *
 *   import { createClient } from "@4mica/sdk-node";
 *   const client = await createClient();       // reads 4MICA_* env
 *   const verifier = client.rpc;
 *
 * On-chain settlement is out-of-band: later, claim your net credit for a cleared
 * cycle with `client.recipient.claimNetCredit(cycleId)`.
 */
const verifier: PaywallVerifier = {
  async issueGuarantee(payload) {
    console.log("[seller] verifying payment payload:", payload);
    // A real verifier (client.rpc) returns the BLS certificate from core.
    return { claims: "0xdemoClaims", signature: "0xdemoSignature" };
  },
};

export const PAYWALL_CONFIG: PaywallConfig = {
  payTo: "0x1111111111111111111111111111111111111111",
  asset: "0x0000000000000000000000000000000000000000", // native ETH
  network: "base-sepolia",
  amount: "1000",
  // The payer resolves the next reqId for this payment session here.
  tabEndpoint: "http://localhost:3000/session",
  description: "Premium market data feed",
};

const app = express();
app.use(express.json());

// Payment-session endpoint the buyer calls to get the next reqId (no tabId anymore).
app.post("/session", (_req, res) => {
  res.json({
    userAddress: "0x2222222222222222222222222222222222222222",
    nextReqId: "0x1",
  });
});

app.get("/premium", paywall(verifier, PAYWALL_CONFIG), (_req, res) => {
  res.json({ ok: true, data: "🔓 premium market data unlocked" });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`[seller-express] listening on http://localhost:${port}`);
  console.log(`  GET /premium is paywalled — run the buyer to pay for it.`);
});
