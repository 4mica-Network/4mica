import "dotenv/config";
import type { Network } from "@4mica/x402";
import { FourMicaEvmScheme } from "@4mica/x402/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createx402MCPClient, type x402MCPToolCallResult } from "@x402/mcp";
import { privateKeyToAccount } from "viem/accounts";

// An agent paying the seller: scrape a page, then crawl a site and poll until the crawl's refund.
const key = process.env.BUYER_PRIVATE_KEY;
if (!key?.startsWith("0x")) throw new Error("BUYER_PRIVATE_KEY is not set");
const network = (process.env.NETWORK || "eip155:84532") as Network;
const coreUrl = process.env.CORE_URL || undefined;
const sellerUrl = process.env.SELLER_URL || "http://127.0.0.1:3020/mcp";
const target = process.env.TARGET_URL || "https://example.com";

const scheme = await FourMicaEvmScheme.create(
  privateKeyToAccount(key as `0x${string}`),
  {
    networks: [network],
    ...(coreUrl ? { coreUrls: { [network]: coreUrl } } : {}),
  },
);
const client = createx402MCPClient({
  name: "firecrawl-buyer",
  version: "0.0.0",
  schemes: [{ network, client: scheme }],
  onPaymentRequested: ({ toolName, paymentRequired }) => {
    console.log(
      `${toolName}: paying a cap of ${paymentRequired.accepts[0]?.amount}`,
    );
    return true;
  },
});
await client.connect(new StreamableHTTPClientTransport(new URL(sellerUrl)));

const { tools } = await client.listTools();
console.log("tools:", tools.map((tool) => tool.name).join(", "));

show("scrape", await client.callTool("scrape", { url: target }));

const crawl = await client.callTool("crawl", { url: target, limit: 2 });
show("crawl", crawl);
const { id } = JSON.parse(texts(crawl)[0] ?? "{}") as { id?: string };
if (crawl.isError || !id) throw new Error("the crawl did not start");

for (let attempt = 0; attempt < 40; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const status = await client.callTool("crawl_status", { id });
  const { status: state } = JSON.parse(texts(status)[0] ?? "{}");
  console.log(`crawl_status: ${state}`);
  if (status.content.length > 1 || status.isError) {
    show("crawl_status", status);
    break;
  }
}
await client.close();

function texts(result: x402MCPToolCallResult): string[] {
  return result.content.map((item) =>
    typeof item.text === "string" ? item.text : "",
  );
}

function show(tool: string, result: x402MCPToolCallResult) {
  const [body, ...notes] = texts(result);
  console.log(
    `${tool}: ${result.isError ? "error" : "ok"}, paid ${result.paymentMade}, settled ${result.paymentResponse?.success ?? "-"}`,
  );
  console.log(`  ${body?.slice(0, 200)}`);
  for (const note of notes) console.log(`  ${note}`);
}
