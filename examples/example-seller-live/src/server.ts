import "dotenv/config";

import type { PaywallConfig } from "@4mica/sdk/server";
import { paywall } from "@4mica/sdk-express";
import { createClient } from "@4mica/sdk-node";
import express from "express";

const PORT = Number(process.env.PORT ?? 3010);

const required = (name: string): string => {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    console.error(
      `\n[seller-live] ${name} is not set.\n` +
        `  Copy .env.example to .env and fill it in, or run the dev stack:\n` +
        `    scripts/dev-stack.sh up\n`,
    );
    process.exit(1);
  }
  return value;
};

const PAY_TO = required("PAY_TO");
const NETWORK = required("NETWORK");
const ASSET = process.env.ASSET ?? "0x0000000000000000000000000000000000000000";
const AMOUNT = process.env.AMOUNT ?? "1000";

required("4MICA_WALLET_PRIVATE_KEY");

const BASE_URL = process.env.PUBLIC_BASE_URL ?? `http://localhost:${PORT}`;

async function main() {
  const client = await createClient();

  const config: PaywallConfig = {
    payTo: PAY_TO,
    asset: ASSET,
    network: NETWORK,
    amount: AMOUNT,
    description: "Live quote for one symbol",
    mimeType: "application/json",
  };

  const app = express();
  app.use(express.json());

  app.get("/", (_req, res) => {
    res.json({
      name: "Live Quotes API",
      paidEndpoints: ["GET /quote"],
      payTo: PAY_TO,
      network: NETWORK,
      asset: ASSET,
      amount: AMOUNT,
    });
  });

  app.get("/quote", paywall(client, config), (_req, res) => {
    res.json({
      symbol: "ETH",
      price: 3142.55,
      asOf: new Date().toISOString(),
      note: "You paid for this over x402. No gas, no prepaid balance.",
    });
  });

  app.listen(PORT, () => {
    console.log(`\n[seller-live] listening on ${BASE_URL}`);
    console.log(`  GET /quote is paywalled at ${AMOUNT} base units.\n`);

    console.log("  Paste into the dashboard (APIs → New API):");
    console.log(`    Name          Live Quotes API`);
    console.log(`    Base URL      ${BASE_URL}`);
    console.log(`    Endpoint      GET /quote`);
    console.log(`    Network       ${NETWORK}`);
    console.log(`    Receiving     ${PAY_TO}`);
    console.log(
      `    Token         ${
        ASSET === "0x0000000000000000000000000000000000000000"
          ? "(leave empty — native asset)"
          : ASSET
      }`,
    );
    console.log(`    Price         ${AMOUNT} base units\n`);
  });
}

main().catch((error) => {
  console.error("[seller-live] failed to start:", error);
  process.exit(1);
});
