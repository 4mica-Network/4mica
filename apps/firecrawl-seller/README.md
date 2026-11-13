# Firecrawl seller

An MCP server that resells Firecrawl through the API proxy (`apps/proxy`), paid per call over
x402 with `4mica-credit`. It holds no Firecrawl key.

| Tool | Cap (credits) | Firecrawl |
| --- | --- | --- |
| `scrape` | 5 | `POST /v2/scrape`, markdown |
| `search` | 2 | `POST /v2/search`, up to 10 results |
| `map` | 1 | `POST /v2/map` |
| `crawl` | 10 | `POST /v2/crawl`, up to 10 pages |
| `crawl_status` | free | `GET /v2/crawl/{id}` |

## Flow

1. An unpaid call gets the x402 MCP challenge: an error result whose `structuredContent` is the
   `PaymentRequired`, for the tool's cap at `CREDIT_PRICE` per credit.
2. The buyer retries with the payment in `_meta["x402/payment"]`. `@x402/mcp` verifies it with the
   facilitator, the seller calls the proxy with `x-max-cost` set to the cap, and the cap is settled
   (the guarantee issued) only if the call succeeded.
3. The seller pays the unused part of the cap back as a `4mica-credit` guarantee from its own
   wallet to the buyer. For `crawl` this happens on the first `crawl_status` that carries the
   proxy's `x-proxy-job-cost`.

The seller wallet needs 4mica collateral of its own, since each refund locks some until the
cycle commits.

## Run

Locally, with everything but Firecrawl on this machine (needs the `4mica-core` checkout beside
this repo, Docker, and Foundry):

```bash
pnpm turbo build --filter=@4mica/firecrawl-seller^...
FIRECRAWL_API_KEY=fc-... apps/firecrawl-seller/stack.sh up   # core, facilitator, Valkey, proxy, funded wallets, seller
apps/firecrawl-seller/stack.sh buyer                         # scrapes, crawls, polls until the refund
apps/firecrawl-seller/stack.sh down
```

Against your own proxy and a hosted facilitator:

```bash
pnpm turbo build --filter=@4mica/firecrawl-seller^...
cp apps/firecrawl-seller/.env.example apps/firecrawl-seller/.env   # fill in the keys
pnpm --filter @4mica/firecrawl-seller dev     # the seller, needs the proxy running
pnpm --filter @4mica/firecrawl-seller buyer   # scrapes, crawls, polls until the refund
```

`PROXY_TOKEN` is a seller token whose SHA-256 hex is in the proxy's `sellers` table. The buyer
needs 4mica collateral; see the x402 demo's README for minting test USDC and depositing it.

`pnpm --filter @4mica/firecrawl-seller test` runs the whole MCP payment flow in process, with a
fake facilitator and proxy.
