import { config as loadEnv } from "dotenv";
import { Client, ConfigBuilder, PaymentRequirements, X402Flow } from "sdk-4mica";

loadEnv({ path: ".env", override: false });

const payerKey = process.env.PAYER_KEY ?? process.env["4MICA_WALLET_PRIVATE_KEY"];
const userAddress = process.env.USER_ADDRESS;
const resourceUrl = process.env.RESOURCE_URL;

if (!payerKey || !userAddress || !resourceUrl) {
  throw new Error("PAYER_KEY (or 4MICA_WALLET_PRIVATE_KEY), USER_ADDRESS, and RESOURCE_URL must be set");
}

// Values are guaranteed above, so capture non-nullable versions for later use.
const payerKeyRequired = payerKey!;
const userAddressRequired = userAddress!;
const resourceUrlRequired = resourceUrl!;

async function main(): Promise<void> {
  console.log("--- x402 / 4mica flow (TypeScript SDK) ---");

  const cfg = new ConfigBuilder().walletPrivateKey(payerKeyRequired).build();
  const client = await Client.new(cfg);

  try {
    const flow = X402Flow.fromClient(client);
    const requirements = PaymentRequirements.fromRaw(
      (await (await fetch(resourceUrlRequired)).json()).accepts?.[0] as Record<string, unknown>
    );
    const payment = await flow.signPayment(requirements, userAddressRequired);
    console.log(`X-PAYMENT: ${payment.header}\n`);
    const resp = await fetch(resourceUrlRequired, { headers: { "X-PAYMENT": payment.header } });
    console.log(await resp.text());
  } finally {
    await client.aclose();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
