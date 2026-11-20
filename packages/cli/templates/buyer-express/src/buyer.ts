import "./env";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function resolveSellerUrl() {
  if (process.env.SELLER_URL) return process.env.SELLER_URL;
  try {
    const base = readFileSync(
      join(tmpdir(), "__TMPFILE__"),
      "utf8",
    ).trim();
    if (base) return `${base}/premium`;
  } catch {
    return "http://localhost:__PORT__/premium";
  }
  return "http://localhost:__PORT__/premium";
}

const SELLER_URL = resolveSellerUrl();

// Live once the wallet key is set: payments are then signed for real through
// @4mica/sdk. Without it the payment is a hand-built stand-in that only a
// demo seller accepts.
const LIVE = Boolean(
  process.env.FOURMICA_WALLET_PRIVATE_KEY ??
    process.env["4MICA_WALLET_PRIVATE_KEY"],
);

type X402PaymentRequired = {
  x402Version: number;
  resource: Record<string, unknown>;
  accepts: Array<{
    scheme: string;
    network: string;
    asset: string;
    amount: string;
    payTo: string;
    extra?: Record<string, unknown>;
  }>;
};

function demoPaymentHeader(required: X402PaymentRequired) {
  const requirement = required.accepts[0];
  // Mint a random 32-byte req_id — uniqueness is all core asks of it.
  const reqIdBytes = new Uint8Array(32);
  crypto.getRandomValues(reqIdBytes);
  const reqId = `0x${Array.from(reqIdBytes, (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("")}`;
  const envelope = {
    x402Version: 2,
    accepted: requirement,
    resource: required.resource,
    payload: {
      payload: {
        version: "v1",
        user_address: "0x2222222222222222222222222222222222222222",
        recipient_address: requirement.payTo,
        // Demo only: a real payment carries core's active cycle id.
        cycle_id: `0x${"0".repeat(64)}`,
        req_id: reqId,
        amount: `0x${BigInt(requirement.amount).toString(16)}`,
        asset_address: requirement.asset,
        timestamp: Math.floor(Date.now() / 1000),
        salt: `0x${"0".repeat(64)}`,
      },
      signature: "0xdemoSignature",
    },
  };
  return Buffer.from(JSON.stringify(envelope)).toString("base64");
}

/**
 * `client.fetch` answers a 402 by signing a payment within the spend limit
 * (1 USDC a payment unless `spend` says otherwise) and repeating the request.
 */
async function payLive() {
  const { FourMica } = await import("@4mica/sdk");
  const client = await FourMica.connect();
  try {
    console.log(`[buyer] paying as ${client.address} on ${client.network}`);
    const paid = await client.fetch(SELLER_URL);
    const payment = client.paymentFor(paid);
    console.log(`[buyer] GET ${SELLER_URL} → ${paid.status}`);
    if (payment) {
      console.log(
        `[buyer] paid ${payment.amount} ${payment.asset.symbol} to ${payment.payTo}`,
      );
    }
    console.log("[buyer] body:", await paid.text());
    if (paid.status === 402) {
      // Signed and sent, but not accepted: most often there is no collateral.
      console.log(
        "[buyer] the payment was not accepted. Check `4mica balance`: " +
          "the wallet needs deposited collateral to pay from.",
      );
      process.exitCode = 1;
    }
  } finally {
    await client.close();
  }
}

async function main() {
  if (LIVE) return payLive();
  console.log("[buyer] demo mode. Set the wallet key in .env to pay for real.");
  const first = await fetch(SELLER_URL);
  console.log(`[buyer] GET ${SELLER_URL} → ${first.status}`);
  if (first.status !== 402) {
    console.log("[buyer] unexpected: no payment asked for", await first.text());
    return;
  }
  // x402 v2 carries the requirements in a base64 `PAYMENT-REQUIRED` header.
  const required = JSON.parse(
    Buffer.from(first.headers.get("PAYMENT-REQUIRED") ?? "", "base64").toString(
      "utf8",
    ),
  ) as X402PaymentRequired;
  console.log("[buyer] payment required:", required.accepts[0]);

  const header = demoPaymentHeader(required);

  const paid = await fetch(SELLER_URL, {
    headers: { "PAYMENT-SIGNATURE": header },
  });
  console.log(`[buyer] GET ${SELLER_URL} (paid) → ${paid.status}`);
  console.log(
    "[buyer] PAYMENT-RESPONSE:",
    paid.headers.get("PAYMENT-RESPONSE"),
  );
  console.log("[buyer] body:", await paid.json());
}

main().catch((err) => {
  console.error("[buyer] failed:", err);
  process.exitCode = 1;
});
