import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PaywallConfig, PaywallVerifier } from "@4mica/sdk-express";
import { paywall } from "@4mica/sdk-express";
import express from "express";

const PORT_FILE = join(tmpdir(), "4mica-example-express.url");

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
  description: "Premium market data feed",
};

const app = express();
app.use(express.json());

app.get("/premium", paywall(verifier, PAYWALL_CONFIG), (_req, res) => {
  res.json({ ok: true, data: "🔓 premium market data unlocked" });
});

function listen(port: number, attemptsLeft = 20) {
  const server = app.listen(port);
  server.once("listening", () => {
    const url = `http://localhost:${port}`;
    writeFileSync(PORT_FILE, url);
    console.log(`[seller-express] listening on ${url}`);
    console.log(`  GET /premium is paywalled — run the buyer to pay for it.`);
  });
  server.once("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && attemptsLeft > 0) {
      console.log(`[seller-express] port ${port} in use, trying ${port + 1}…`);
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

listen(Number(process.env.PORT ?? 3000));
