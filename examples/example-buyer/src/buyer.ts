import "dotenv/config";

import { X402Flow, X402PaymentRequired } from "@4mica/sdk";
import { createClient } from "@4mica/sdk-node";

const url = process.env.RESOURCE_URL ?? "http://localhost:3000/quote";

const client = await createClient();

try {
  const unpaid = await fetch(url);
  console.log(`[buyer] GET ${url} -> ${unpaid.status}`);

  if (unpaid.status !== 402) {
    console.log(await unpaid.text());
    process.exit(0);
  }

  const challenge = X402PaymentRequired.fromRaw(await unpaid.json());
  const accepted = challenge.accepts[0];
  console.log(
    `[buyer] price ${accepted.amount} of ${accepted.asset} on ${accepted.network}, paid to ${accepted.payTo}`,
  );

  const signed = await X402Flow.fromClient(client).signPaymentV2(
    challenge,
    accepted,
    client.signerAddress,
  );

  const paid = await fetch(url, { headers: { "X-PAYMENT": signed.header } });
  console.log(`[buyer] GET ${url} (paid) -> ${paid.status}`);
  console.log(await paid.json());

  if (!paid.ok) {
    process.exitCode = 1;
  }
} finally {
  await client.aclose();
}
