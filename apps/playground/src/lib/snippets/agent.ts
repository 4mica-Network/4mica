import type { PublicAgent } from "@/schema/agent";
import { networkInfo } from "./networks";
import {
  buildCurlHandshake,
  commentLine,
  formatPrice,
  PLACEHOLDER,
} from "./shared";

export interface AgentSnippets {
  install: string;
  typescript: string;
  collateral: string;
  receipt: string;
}

export interface AgentBuyerSnippets {
  install: string;
  typescript: string;
  python: string;
  curl: string;
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

export const isSellable = (
  agent: PublicAgent,
): agent is PublicAgent & { payToAddress: string; endpointUrl: string } =>
  agent.payToAddress !== null && agent.endpointUrl !== null;

export const buildAgentBuyerSnippets = (
  agent: PublicAgent,
): AgentBuyerSnippets | null => {
  if (!isSellable(agent)) {
    return null;
  }

  const { caip2, sdkName } = networkInfo(agent.network);
  const url = agent.endpointUrl;
  const price = formatPrice(
    agent.priceAmount,
    agent.priceCurrency,
    agent.priceLabel,
  );

  const descriptorParts = [
    agent.name,
    price === null ? null : `${price} per call`,
  ];
  const paidToParts = [
    `Paid to ${agent.payToAddress}`,
    agent.assetAddress === null
      ? "native asset"
      : `ERC-20 ${agent.assetAddress}`,
  ];

  const descriptor = commentLine(descriptorParts);
  const paidTo = commentLine(paidToParts);

  const install = "pnpm add @4mica/x402 @x402/fetch viem";

  const typescript = `import { FourMicaEvmScheme } from "@4mica/x402/client";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";

// Pay from a wallet with collateral deposited at 4Mica.
const account = privateKeyToAccount(
  process.env.PRIVATE_KEY as \`0x\${string}\`,
);
const scheme = await FourMicaEvmScheme.create(account);

const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: "${caip2}", client: scheme }],
});

${descriptor}
${paidTo}
const response = await fetchWithPayment("${url}", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ prompt: "..." }),
});

const data = await response.json();`;

  const python = `import os

from x402 import x402ClientSync
from x402.http.clients import x402_requests
from fourmica_x402.client_scheme import FourMicaEvmScheme

client = x402ClientSync()
client.register("${caip2}", FourMicaEvmScheme(os.environ["PRIVATE_KEY"]))
session = x402_requests(client)

${commentLine(descriptorParts, "#")}
${commentLine(paidToParts, "#")}
response = session.post("${url}", json={"prompt": "..."})
data = response.json()`;

  const curl = buildCurlHandshake({
    method: "POST",
    url,
    caip2,
    payTo: agent.payToAddress,
    assetAddress: agent.assetAddress,
    wireAmount: agent.priceAmount,
  });

  const receipt = `import { Client, ConfigBuilder } from "@4mica/sdk";

// Every paid response carries its settled payment on this header.
const receipt = response.headers.get("X-PAYMENT-RESPONSE");

const client = await Client.connect(
  new ConfigBuilder()
    .network("${sdkName}")
    .walletPrivateKey(process.env.PRIVATE_KEY)
    .build(),
);

try {
  // One entry per asset: collateral, locked credit, pending withdrawal.
  const positions = await client.account.assets();
  console.log({ receipt, positions });
} finally {
  await client.aclose();
}`;

  return { install, typescript, python, curl, receipt };
};
