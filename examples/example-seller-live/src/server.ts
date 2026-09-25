import "dotenv/config";

import type { PaywallConfig } from "@4mica/sdk/server";
import { paywall } from "@4mica/sdk-express";
import { createClient } from "@4mica/sdk-node";
import express from "express";
import { reportPayment } from "./report";

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

const FOURMICA_API_URL =
  process.env.FOURMICA_API_URL ?? "http://localhost:4000";
const FOURMICA_API_KEY = process.env.FOURMICA_API_KEY ?? null;
const LISTING_SLUG = process.env.LISTING_SLUG ?? null;
const ASSET_DECIMALS = Number(process.env.ASSET_DECIMALS ?? 18);

const NETWORK_ENUM_BY_CAIP2: Record<string, string> = {
  "eip155:8453": "BASE",
  "eip155:84532": "BASE_SEPOLIA",
  "eip155:11155111": "ETHEREUM_SEPOLIA",
};

const NETWORK_ENUM = NETWORK_ENUM_BY_CAIP2[NETWORK] ?? null;

if (FOURMICA_API_KEY && !NETWORK_ENUM) {
  console.warn(
    `[seller-live] ${NETWORK} has no PaymentNetwork equivalent, so payments ` +
      "on it cannot be reported to 4Mica. The paywall still works.",
  );
}

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

  app.get("/quote", paywall(client, config), (req, res) => {
    res.json({
      symbol: "ETH",
      price: 3142.55,
      asOf: new Date().toISOString(),
      note: "You paid for this over x402. No gas, no prepaid balance.",
    });

    const header = req.get("payment-signature") ?? req.get("x-payment") ?? null;

    if (FOURMICA_API_KEY && NETWORK_ENUM && header) {
      void reportPayment(
        {
          baseUrl: FOURMICA_API_URL,
          apiKey: FOURMICA_API_KEY,
          recipientAddress: PAY_TO,
          network: NETWORK_ENUM,
          assetAddress:
            ASSET === "0x0000000000000000000000000000000000000000"
              ? null
              : ASSET,
          listingSlug: LISTING_SLUG,
          decimals: ASSET_DECIMALS,
        },
        header,
        { resource: `${BASE_URL}/quote`, description: "Live quote" },
      );
    }
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

    if (!FOURMICA_API_KEY) {
      console.log(
        "  FOURMICA_API_KEY is unset, so payments will not appear in the\n" +
          "  dashboard. Mint one at Settings → Developer.\n",
      );
    }
  });
}

main().catch((error) => {
  console.error("[seller-live] failed to start:", error);
  process.exit(1);
});
