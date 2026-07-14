import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PaywallConfig, PaywallVerifier } from "@4mica/sdk-hono";
import { paywall } from "@4mica/sdk-hono";
import { serve } from "@hono/node-server";
import { Hono } from "hono";

const PORT_FILE = join(tmpdir(), "4mica-example-hono.url");

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

function listen(port: number, attemptsLeft = 20) {
  const server = serve({ fetch: app.fetch, port }, (info) => {
    const url = `http://localhost:${info.port}`;
    PAYWALL_CONFIG.tabEndpoint = `${url}/session`;
    writeFileSync(PORT_FILE, url);
    console.log(`[seller-hono] listening on ${url}`);
    console.log(`  GET /premium is paywalled — run the buyer to pay for it.`);
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && attemptsLeft > 0) {
      console.log(`[seller-hono] port ${port} in use, trying ${port + 1}…`);
      listen(port + 1, attemptsLeft - 1);
    } else {
      throw err;
    }
  });
}

const cleanup = () => rmSync(PORT_FILE, { force: true });
process.on("exit", cleanup);
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

listen(Number(process.env.PORT ?? 3001));
