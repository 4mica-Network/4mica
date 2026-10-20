import {
  Client,
  ConfigBuilder,
  PaymentRequirementsV1,
  X402Flow,
} from "@4mica/sdk";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env", override: false });

const payerKey =
  process.env.PAYER_KEY ?? process.env["4MICA_WALLET_PRIVATE_KEY"];
const resourceUrl = process.env.RESOURCE_URL;

if (!payerKey || !resourceUrl) {
  throw new Error(
    "PAYER_KEY (or 4MICA_WALLET_PRIVATE_KEY) and RESOURCE_URL must be set",
  );
}

async function main(): Promise<void> {
  console.log("--- x402 / 4mica flow (TypeScript SDK) ---");

  const cfg = new ConfigBuilder().walletPrivateKey(payerKey as string).build();
  const client = await Client.connect(cfg);

  try {
    const flow = X402Flow.fromClient(client);
    // The 402 body advertises the requirements; the claim is signed straight
    // from them — no tab step, the reqId is a random local nonce.
    const requirements = PaymentRequirementsV1.fromRaw(
      (await (await fetch(resourceUrl as string)).json())
        .accepts?.[0] as Record<string, unknown>,
    );
    const payment = await flow.signPayment(requirements, client.signerAddress);
    console.log(`X-PAYMENT: ${payment.header}\n`);
    const resp = await fetch(resourceUrl as string, {
      headers: { "X-PAYMENT": payment.header },
    });
    console.log(await resp.text());
  } finally {
    await client.aclose();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
