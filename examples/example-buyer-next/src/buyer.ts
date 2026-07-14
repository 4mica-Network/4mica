import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function resolveSellerUrl() {
  if (process.env.SELLER_URL) return process.env.SELLER_URL;
  try {
    const base = readFileSync(
      join(tmpdir(), "4mica-example-next.url"),
      "utf8",
    ).trim();
    if (base) return `${base}/api/protected`;
  } catch {
    return "http://localhost:3002/api/protected";
  }
  return "http://localhost:3002/api/protected";
}

const SELLER_URL = resolveSellerUrl();

type X402PaymentRequired = {
  x402Version: number;
  accepts: Array<{
    scheme: string;
    network: string;
    asset: string;
    amount: string;
    payTo: string;
    extra?: { tabEndpoint?: string };
  }>;
};

function demoPaymentHeader(
  requirement: X402PaymentRequired["accepts"][number],
) {
  const envelope = {
    x402Version: 1,
    scheme: requirement.scheme,
    network: requirement.network,
    payload: {
      claims: {
        version: "v1",
        user_address: "0x2222222222222222222222222222222222222222",
        recipient_address: requirement.payTo,
        req_id: "0x1",
        amount: `0x${BigInt(requirement.amount).toString(16)}`,
        asset_address: requirement.asset,
        timestamp: Math.floor(Date.now() / 1000),
      },
      signature: "0xdemoSignature",
      scheme: "eip712",
    },
  };
  return Buffer.from(JSON.stringify(envelope)).toString("base64");
}

async function main() {
  const first = await fetch(SELLER_URL);
  console.log(`[buyer] GET ${SELLER_URL} → ${first.status}`);
  if (first.status !== 402) {
    console.log("[buyer] unexpected: not paywalled?", await first.text());
    return;
  }
  const required = (await first.json()) as X402PaymentRequired;
  const requirement = required.accepts[0];
  console.log("[buyer] payment required:", requirement);

  const header = demoPaymentHeader(requirement);

  const paid = await fetch(SELLER_URL, { headers: { "X-PAYMENT": header } });
  console.log(`[buyer] GET ${SELLER_URL} (paid) → ${paid.status}`);
  console.log(
    "[buyer] X-PAYMENT-RESPONSE:",
    paid.headers.get("X-PAYMENT-RESPONSE"),
  );
  console.log("[buyer] body:", await paid.json());
}

main().catch((err) => {
  console.error("[buyer] failed:", err);
  process.exitCode = 1;
});
