import type { PaywallConfig, PaywallVerifier } from "@4mica/sdk-next";
import { withPaywall } from "@4mica/sdk-next";

export const dynamic = "force-dynamic";

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
  tabEndpoint: `${process.env.EXAMPLE_BASE_URL ?? "http://localhost:__PORT__"}/api/session`,
  description: "Premium market data feed",
};

export const GET = withPaywall(
  async () =>
    Response.json({ ok: true, data: "🔓 premium market data unlocked" }),
  verifier,
  PAYWALL_CONFIG,
);
