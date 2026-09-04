import type { PublicAgent } from "@/schema/agent";
import { networkInfo } from "./networks";
import { PLACEHOLDER } from "./shared";

export interface AgentSnippets {
  install: string;
  typescript: string;
  collateral: string;
  receipt: string;
}

/**
 * Build the payer-side setup snippets for one agent.
 *
 * An `Agent` is the paying identity in 4Mica — it holds a wallet and a credit
 * limit — so these show how to wire it up as a client that pays for requests,
 * not how to call it.
 *
 * `agent.walletAddress` is null for every viewer who does not own the profile
 * (see AGENT_PUBLIC_SELECT in services/agents.ts), and the snippet then shows a
 * placeholder. Never source the address from anywhere else here.
 */
export const buildAgentSnippets = (agent: PublicAgent): AgentSnippets => {
  const { caip2, sdkName } = networkInfo(agent.network);
  const wallet = agent.walletAddress ?? PLACEHOLDER.agentWallet;

  const install = "pnpm add @4mica/x402 @x402/fetch viem @4mica/sdk";

  const typescript = `import { FourMicaEvmScheme } from "@4mica/x402/client";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";

// ${agent.name} signs from ${wallet}.
// Keep its key in a secret manager — never in source control.
const account = privateKeyToAccount(
  process.env.AGENT_PRIVATE_KEY as \`0x\${string}\`,
);
const scheme = await FourMicaEvmScheme.create(account);

// Wrap the fetch this agent already uses. Every request it makes is now
// credit-backed: no gas, no chain round-trip on the hot path.
const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: "${caip2}", client: scheme }],
});

const response = await fetchWithPayment("https://some-seller.example/data");`;

  const collateral = `import { Client, ConfigBuilder } from "@4mica/sdk";

const client = await Client.connect(
  new ConfigBuilder()
    .network("${sdkName}")
    .walletPrivateKey(process.env.AGENT_PRIVATE_KEY)
    .build(),
);

try {
  // Deposit 0.001 ETH of collateral. Credit is extended against this balance.
  await client.deposit.of(null, 1_000_000_000_000_000n).send();

  // For an ERC-20 instead, approve first:
  // await client.deposit.of(tokenAddress, "1000").selfFunded().approve();
  // await client.deposit.of(tokenAddress, "1000").send();

  // One entry per asset: collateral, locked credit, pending withdrawal.
  const positions = await client.account.assets();
  console.log(positions);
} finally {
  await client.aclose();
}`;

  const receipt = `// Each paid response carries its settled payment on this header.
const receipt = response.headers.get("X-PAYMENT-RESPONSE");

// Guarantees this agent signed are netted into a settlement cycle. When it
// ends up a net debtor, pay the committed amount on-chain:
// await client.settlement.pay(cycleId).send();

// Record the request id, guarantee id, seller and amount against your own task
// log — that pairing is what makes a payment auditable later.
console.log(receipt);`;

  return { install, typescript, collateral, receipt };
};
