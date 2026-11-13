import { SupportedTokensResponse } from "@4mica/sdk";
import type { Network } from "@4mica/x402";
import { FourMicaEvmScheme, x402ResourceServer } from "@4mica/x402/server";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { FacilitatorClient } from "@x402/core/server";
import { createx402MCPClient } from "@x402/mcp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { capFor, type Payments, refundFor } from "./payments.js";
import type { ProxyCall, ProxyResult } from "./proxy.js";
import { createServer } from "./server.js";

const NETWORK: Network = "eip155:84532";
const USDC = "0x2222222222222222222222222222222222222222";
const SELLER = "0x5555555555555555555555555555555555555555";
const BUYER = "0x1111111111111111111111111111111111111111";
const CRAWL = "6f1b3c1e-0f6a-4d35-9a57-2a6f0f6b9d10";

/** The whole MCP flow in process: the real x402 MCP client and wrapper, a fake facilitator and proxy. */
async function connect(proxy: (call: ProxyCall) => ProxyResult) {
  vi.spyOn(
    FourMicaEvmScheme as unknown as {
      loadSupportedTokens: () => Promise<SupportedTokensResponse>;
    },
    "loadSupportedTokens",
  ).mockResolvedValue(
    new SupportedTokensResponse(84532, [
      { symbol: "USDC", address: USDC, decimals: 6 },
    ]),
  );
  const settle = vi.fn(async () => ({
    success: true,
    transaction: "0xabc",
    network: NETWORK,
    payer: BUYER,
  }));
  const facilitator: FacilitatorClient = {
    getSupported: async () => ({
      kinds: [{ x402Version: 2, scheme: "4mica-credit", network: NETWORK }],
      extensions: [],
      signers: {},
    }),
    verify: async () => ({ isValid: true, payer: BUYER }),
    settle,
  };
  const server = new x402ResourceServer(facilitator).register(
    NETWORK,
    new FourMicaEvmScheme(),
  );
  await server.initialize();
  const [perCredit] = await server.buildPaymentRequirements({
    scheme: "4mica-credit",
    network: NETWORK,
    payTo: SELLER,
    price: "$0.002",
  });
  if (!perCredit) throw new Error("no requirements");

  const refund = vi.fn(async (cap, _buyer: string, used: number) => {
    const amount = refundFor(cap, perCredit, used);
    return amount ? amount.toString() : undefined;
  });
  const payments: Payments = {
    server,
    cap: (credits) => capFor(perCredit, credits),
    refund,
  };
  const calls: ProxyCall[] = [];
  const mcp = createServer(payments, async (call) => {
    calls.push(call);
    return proxy(call);
  })();

  const client = createx402MCPClient({
    name: "buyer",
    version: "0.0.0",
    // The fake scheme names no default asset for the spend caps to price.
    spendControls: false,
    schemes: [
      {
        network: NETWORK,
        client: {
          scheme: "4mica-credit",
          createPaymentPayload: async (x402Version) => ({
            x402Version,
            payload: { signature: "0x", payload: { user_address: BUYER } },
          }),
        },
      },
    ],
  });
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await mcp.connect(serverSide);
  await client.connect(clientSide);
  return { client, settle, refund, calls };
}

const texts = (result: { content: unknown[] }) =>
  result.content.map((item) => (item as { text: string }).text);

describe("firecrawl seller", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("charges a scrape's cap and refunds what Firecrawl did not use", async () => {
    const { client, settle, refund, calls } = await connect(() => ({
      ok: true,
      status: 200,
      text: '{"success":true}',
      credits: 1,
    }));

    const result = await client.callTool("scrape", {
      url: "https://example.com",
    });

    expect(result.paymentMade).toBe(true);
    expect(result.paymentResponse?.success).toBe(true);
    expect(settle).toHaveBeenCalledTimes(1);
    expect(calls[0]).toMatchObject({
      path: "/v2/scrape",
      payer: BUYER,
      maxCredits: 5,
    });
    expect(refund).toHaveBeenCalledWith(
      expect.objectContaining({ amount: "10000" }),
      BUYER,
      1,
    );
    expect(texts(result)).toEqual([
      '{"success":true}',
      "Used 1 credits of a 10000 cap; refunded 8000.",
    ]);
  });

  it("does not charge a call Firecrawl failed", async () => {
    const { client, settle, refund } = await connect(() => ({
      ok: false,
      status: 400,
      text: "bad url",
      credits: 0,
    }));

    const result = await client.callTool("scrape", {
      url: "https://example.com",
    });

    expect(result.isError).toBe(true);
    expect(settle).not.toHaveBeenCalled();
    expect(refund).not.toHaveBeenCalled();
  });

  it("holds a crawl's cap until it finishes, then refunds once", async () => {
    const statuses: ProxyResult[] = [
      { ok: true, status: 200, text: '{"status":"scraping"}', credits: 0 },
      {
        ok: true,
        status: 200,
        text: '{"status":"completed"}',
        credits: 0,
        jobCredits: 2,
      },
      {
        ok: true,
        status: 200,
        text: '{"status":"completed"}',
        credits: 0,
        jobCredits: 2,
      },
    ];
    const { client, refund, calls } = await connect((call) =>
      call.method === "POST"
        ? {
            ok: true,
            status: 200,
            text: JSON.stringify({ success: true, id: CRAWL }),
            credits: 10,
          }
        : (statuses.shift() as ProxyResult),
    );

    const started = await client.callTool("crawl", {
      url: "https://example.com",
      limit: 2,
    });
    expect(started.paymentMade).toBe(true);
    expect(refund).not.toHaveBeenCalled();

    const polls = [];
    for (let i = 0; i < 3; i++) {
      polls.push(texts(await client.callTool("crawl_status", { id: CRAWL })));
    }

    expect(calls[1]).toMatchObject({
      method: "GET",
      path: `/v2/crawl/${CRAWL}`,
      payer: BUYER,
      maxCredits: 0,
    });
    expect(refund).toHaveBeenCalledTimes(1);
    expect(refund).toHaveBeenCalledWith(
      expect.objectContaining({ amount: "20000" }),
      BUYER,
      2,
    );
    expect(polls.map((poll) => poll.length)).toEqual([1, 2, 1]);
    expect(polls[1]?.[1]).toBe(
      "Used 2 credits of a 20000 cap; refunded 16000.",
    );
  });

  it("does not poll a crawl it did not start", async () => {
    const { client, calls } = await connect(() => {
      throw new Error("unreachable");
    });

    const result = await client.callTool("crawl_status", { id: CRAWL });

    expect(result.isError).toBe(true);
    expect(calls).toEqual([]);
  });
});
