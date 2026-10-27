import "dotenv/config";

import { NETWORKS } from "@4mica/sdk";
import { FourMicaEvmScheme } from "@4mica/x402/client";
import { decodePaymentResponseHeader } from "@x402/core/http";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";

const url = process.env.RESOURCE_URL ?? "http://localhost:3000/quote";
const privateKey = process.env["4MICA_WALLET_PRIVATE_KEY"];
if (!privateKey?.startsWith("0x")) {
  throw new Error("4MICA_WALLET_PRIVATE_KEY is not set");
}
// x402 names networks by CAIP-2 id, such as eip155:84532.
const network = NETWORKS[process.env["4MICA_NETWORK"] ?? "base-sepolia"]
  .caip2 as `${string}:${string}`;
const coreUrl = process.env["4MICA_RPC_URL"];

const scheme = await FourMicaEvmScheme.create(
  privateKeyToAccount(privateKey as `0x${string}`),
  {
    networks: [network],
    ...(coreUrl ? { coreUrls: { [network]: coreUrl } } : {}),
  },
);

// Answers a 402 by signing a payment and retrying, and recovers from the
// refusals a payer can fix, such as core asking for a checkpoint.
const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network, client: scheme }],
});

const paid = await fetchWithPayment(url);
console.log(`[buyer] GET ${url} -> ${paid.status}`);

if (paid.ok) {
  console.log(await paid.json());
} else {
  // A refused payment comes back as a 402 whose PAYMENT-RESPONSE header names
  // the facilitator's reason.
  const header = paid.headers.get("PAYMENT-RESPONSE");
  const settlement = header ? decodePaymentResponseHeader(header) : undefined;
  console.error(
    settlement
      ? `${settlement.errorReason}: ${settlement.errorMessage}`
      : await paid.text(),
  );
  process.exitCode = 1;
}
