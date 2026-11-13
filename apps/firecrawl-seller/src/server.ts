import type { PaymentRequirements } from "@4mica/x402";
import {
  McpServer,
  type ToolCallback,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  ShapeOutput,
  ZodRawShapeCompat,
} from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type { SettleResponse } from "@x402/core/types";
import {
  createPaymentWrapper,
  createToolResourceUrl,
  MCP_PAYMENT_RESPONSE_META_KEY,
} from "@x402/mcp";
import { z } from "zod";
import { type Payments, payerOf } from "./payments.js";
import type { CallProxy, ProxyCall } from "./proxy.js";

interface PaidTool<S extends ZodRawShapeCompat> {
  description: string;
  input: S;
  /** The cap, in Firecrawl credits. The buyer pays it up front and gets back what goes unused. */
  credits: number;
  /** Starts a crawl, whose cost is only known once it finishes. */
  startsCrawl?: boolean;
  request: (args: ShapeOutput<S>) => Omit<ProxyCall, "payer" | "maxCredits">;
}

interface Crawl {
  buyer: string;
  cap: PaymentRequirements;
  refunded: boolean;
}

type TextResult = {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
  _meta?: Record<string, unknown>;
};

const CREDITS_META = "firecrawl/credits";
const pages = z.number().int().min(1).max(10);

const text = (value: string) => ({ type: "text" as const, text: value });
const failure = (message: string): TextResult => ({
  isError: true,
  content: [text(message)],
});

export function createServer(payments: Payments, callProxy: CallProxy) {
  // shortcut: in memory, so a restart forgets unrefunded crawls; persist them before running more than one instance.
  const crawls = new Map<string, Crawl>();

  async function refundNote(
    cap: PaymentRequirements,
    buyer: string,
    used: number,
    onFailure?: () => void,
  ) {
    try {
      const refunded = await payments.refund(cap, buyer, used);
      return `Used ${used} credits of a ${cap.amount} cap; refunded ${refunded ?? 0}.`;
    } catch (error) {
      console.error("refund failed:", error);
      onFailure?.();
      return `Used ${used} credits of a ${cap.amount} cap; the refund failed.`;
    }
  }

  /**
   * `@x402/mcp` verifies the payment, runs the call through the proxy, and settles the cap only
   * when the call succeeded. The unused part of the cap then goes back to the buyer as a
   * guarantee, right away or, for a crawl, once it finishes.
   */
  function paidTool<S extends ZodRawShapeCompat>(
    mcp: McpServer,
    name: string,
    tool: PaidTool<S>,
  ) {
    const cap = payments.cap(tool.credits);
    const withPayment = createPaymentWrapper(payments.server, {
      accepts: [cap],
      resource: {
        url: createToolResourceUrl(name),
        description: tool.description,
        mimeType: "application/json",
      },
    })(async (args: ShapeOutput<S>, { meta }): Promise<TextResult> => {
      const payer = payerOf(meta);
      if (!payer) return failure("The payment names no payer.");
      const response = await callProxy({
        ...tool.request(args),
        payer,
        maxCredits: tool.credits,
      });
      if (!response.ok)
        return failure(
          `Firecrawl failed (${response.status}): ${response.text}`,
        );
      return {
        content: [text(response.text)],
        _meta: { [CREDITS_META]: response.credits },
      };
    });

    // TypeScript cannot resolve the SDK's conditional callback type for a generic shape.
    const callback = (async (
      args: ShapeOutput<S>,
      extra: { _meta?: Record<string, unknown> },
    ) => {
      const result = (await withPayment(args, extra)) as TextResult;
      const settled = result._meta?.[MCP_PAYMENT_RESPONSE_META_KEY] as
        | SettleResponse
        | undefined;
      const buyer = payerOf(extra._meta);
      if (result.isError || !settled?.success || !buyer) return result;

      if (tool.startsCrawl) {
        const { id } = JSON.parse(result.content[0]?.text ?? "{}") as {
          id?: string;
        };
        if (id) crawls.set(id, { buyer, cap, refunded: false });
        result.content.push(
          text(
            `Charged the ${cap.amount} cap; crawl_status refunds what the crawl leaves unused.`,
          ),
        );
        return result;
      }
      const used = Number(result._meta?.[CREDITS_META] ?? tool.credits);
      result.content.push(text(await refundNote(cap, buyer, used)));
      return result;
    }) as unknown as ToolCallback<S>;

    mcp.registerTool(
      name,
      { description: tool.description, inputSchema: tool.input },
      callback,
    );
  }

  return function server() {
    const mcp = new McpServer({ name: "firecrawl", version: "0.0.0" });

    paidTool(mcp, "scrape", {
      description: "Scrape one page as markdown.",
      input: { url: z.string().url() },
      // shortcut: a PDF costs a credit per page, so a long one can cost more than this cap; pass Firecrawl's PDF page limit once confirmed.
      credits: 5,
      request: ({ url }) => ({
        method: "POST",
        path: "/v2/scrape",
        body: { url, formats: ["markdown"], onlyMainContent: true },
      }),
    });
    paidTool(mcp, "search", {
      description: "Search the web; returns titles, URLs and descriptions.",
      input: { query: z.string().min(1), limit: pages.default(5) },
      credits: 2,
      request: ({ query, limit }) => ({
        method: "POST",
        path: "/v2/search",
        body: { query, limit },
      }),
    });
    paidTool(mcp, "map", {
      description: "List a site's URLs.",
      input: { url: z.string().url() },
      credits: 1,
      request: ({ url }) => ({
        method: "POST",
        path: "/v2/map",
        body: { url },
      }),
    });
    paidTool(mcp, "crawl", {
      description:
        "Start crawling a site as markdown, up to 10 pages. Returns an id for crawl_status.",
      input: { url: z.string().url(), limit: pages.default(10) },
      credits: 10,
      startsCrawl: true,
      request: ({ url, limit }) => ({
        method: "POST",
        path: "/v2/crawl",
        body: {
          url,
          limit,
          scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
        },
      }),
    });

    mcp.registerTool(
      "crawl_status",
      {
        description:
          "A crawl's progress and pages. Free; refunds the unused cap once the crawl finishes.",
        inputSchema: { id: z.string().uuid() },
      },
      async ({ id }) => {
        const crawl = crawls.get(id);
        if (!crawl) return failure("Unknown crawl id.");
        const response = await callProxy({
          method: "GET",
          path: `/v2/crawl/${id}`,
          payer: crawl.buyer,
          maxCredits: 0,
        });
        if (!response.ok)
          return failure(
            `Firecrawl failed (${response.status}): ${response.text}`,
          );
        const result = { content: [text(response.text)] };
        if (response.jobCredits !== undefined && !crawl.refunded) {
          crawl.refunded = true;
          result.content.push(
            text(
              // Netting credit is per cycle, so a refund refused now can succeed once the seller is paid again.
              await refundNote(
                crawl.cap,
                crawl.buyer,
                response.jobCredits,
                () => {
                  crawl.refunded = false;
                },
              ),
            ),
          );
        }
        return result;
      },
    );
    return mcp;
  };
}
