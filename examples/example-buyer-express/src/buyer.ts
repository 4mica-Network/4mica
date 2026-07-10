/**
 * BUYER (payer) — pays for the Express seller's paywalled `/premium` route.
 *
 * The x402 handshake:
 *   1. GET /premium               → 402 with payment requirements (`accepts`)
 *   2. Sign a payment for the selected requirement → base64 `X-PAYMENT` header
 *   3. GET /premium with X-PAYMENT → 200 + `X-PAYMENT-RESPONSE`
 *
 * Real usage — sign with the SDK against live 4Mica core (set 4MICA_* env):
 *
 *   import { createClient } from "@4mica/sdk-node";
 *   import { X402Flow } from "@4mica/sdk";
 *   const client = await createClient();                 // reads 4MICA_* env
 *   const flow = X402Flow.fromClient(client);
 *   const payment = await flow.signPayment(requirements, client.signer.signer.address);
 *   const header = payment.header;                        // <- the X-PAYMENT header
 *
 * This demo builds the header locally so it runs against the mock seller without
 * live credentials.
 */
const SELLER_URL = process.env.SELLER_URL ?? "http://localhost:3000/premium";

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
  // Shape mirrors an x402 payment envelope; a real header is produced by X402Flow.
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
  // 1) Hit the protected resource — expect 402.
  const first = await fetch(SELLER_URL);
  console.log(`[buyer] GET ${SELLER_URL} → ${first.status}`);
  if (first.status !== 402) {
    console.log("[buyer] unexpected: not paywalled?", await first.text());
    return;
  }
  const required = (await first.json()) as X402PaymentRequired;
  const requirement = required.accepts[0];
  console.log("[buyer] payment required:", requirement);

  // 2) Produce the X-PAYMENT header (see real usage in the header comment).
  const header = demoPaymentHeader(requirement);

  // 3) Retry with the header — expect 200.
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
