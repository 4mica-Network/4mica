import "dotenv/config";

import { Client, ConfigBuilder } from "@4mica/sdk";

const amount = process.env.DEPOSIT_AMOUNT ?? "1000000000000000000";

const client = await Client.connect(new ConfigBuilder().fromEnv().build());

try {
  const { txHash, account } = await client.deposit.of(null, amount).send();
  console.log(`[buyer] deposited ${amount} wei for ${account} in ${txHash}`);
} finally {
  await client.aclose();
}
