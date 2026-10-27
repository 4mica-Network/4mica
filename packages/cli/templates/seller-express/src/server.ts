import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { x402ResourceServer } from "@4mica/x402/server";
import { paymentMiddleware } from "@4mica/x402/server/express";
import type { FacilitatorClient } from "@x402/core/server";
import express from "express";

const PORT_FILE = join(tmpdir(), "__TMPFILE__");

const NETWORK = "eip155:84532";
// Base Sepolia USDC, one of the stablecoins 4mica core accepts there.
const ASSET = "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f";
const PAY_TO = "0x1111111111111111111111111111111111111111";

// Demo mode: stands in for the 4mica facilitator and accepts any payment. To go
// live, pass `new FourMicaFacilitatorClient()` from @4mica/x402/server instead.
const demoFacilitator: FacilitatorClient = {
  async getSupported() {
    return {
      kinds: [{ x402Version: 2, scheme: "4mica-credit", network: NETWORK }],
      extensions: [],
      signers: {},
    };
  },
  async verify(paymentPayload) {
    console.log("[seller] verifying payment:", paymentPayload.payload);
    return { isValid: true };
  },
  async settle(_paymentPayload, requirements) {
    return {
      success: true,
      transaction: "",
      network: requirements.network,
      extra: {
        receipt: { receipt: "0xdemoReceipt", signature: "0xdemoSignature" },
      },
    };
  },
};

const app = express();
app.use(express.json());

app.use(
  paymentMiddleware(
    {
      "GET /premium": {
        accepts: {
          scheme: "4mica-credit",
          price: { amount: "1000", asset: ASSET },
          network: NETWORK,
          payTo: PAY_TO,
        },
        description: "Premium market data feed",
      },
    },
    new x402ResourceServer(demoFacilitator),
  ),
);

app.get("/premium", (_req, res) => {
  res.json({ ok: true, data: "🔓 premium market data unlocked" });
});

function listen(port: number, attemptsLeft = 20) {
  const server = app.listen(port);
  server.once("listening", () => {
    const url = `http://localhost:${port}`;
    writeFileSync(PORT_FILE, url);
    console.log(`[seller-express] listening on ${url}`);
    console.log(`  GET /premium costs a payment — run the buyer to pay for it.`);
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

listen(Number(process.env.PORT ?? __PORT__));
