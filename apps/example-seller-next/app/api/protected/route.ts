import type { PaywallConfig, PaywallVerifier } from "@4mica/sdk-next";
import { withPaywall } from "@4mica/sdk-next";

// The paywall reads the request body / issues a guarantee at request time.
export const dynamic = "force-dynamic";

/**
 * SELLER (recipient) — gates `GET /api/protected` behind a 4Mica x402 payment.
 *
 * Real usage — build a recipient client from env and pass `client.rpc`:
 *
 *   import { createClient } from "@4mica/sdk-node";
 *   const client = await createClient();       // reads 4MICA_* env
 *   ...withPaywall(handler, client.rpc, PAYWALL_CONFIG)
 *
 * The helpers are Web-standard and edge-safe. On-chain settlement is out-of-band:
 * claim net credit for a cleared cycle with `client.recipient.claimNetCredit(cycleId)`.
 */
const verifier: PaywallVerifier = {
  async issueGuarantee(payload) {
    console.log("[seller] verifying payment payload:", payload);
    return { claims: "0xdemoClaims", signature: "0xdemoSignature" };
  },
};

const PAYWALL_CONFIG: PaywallConfig = {
  payTo: "0x1111111111111111111111111111111111111111",
  asset: "0x0000000000000000000000000000000000000000",
  network: "base-sepolia",
  amount: "1000",
  tabEndpoint: "http://localhost:3002/api/session",
  description: "Premium market data feed",
};

export const GET = withPaywall(
  async () =>
    Response.json({ ok: true, data: "🔓 premium market data unlocked" }),
  verifier,
  PAYWALL_CONFIG,
);
