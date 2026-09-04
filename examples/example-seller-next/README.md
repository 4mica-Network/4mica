# example-seller-next

Seller (recipient) demo: a Next.js App Router route (`GET /api/protected`) gated
behind a 4Mica x402 paywall using [`@4mica/sdk-next`](../../packages/sdk-next).
The helper is Web-standard and edge-safe. A landing page at `/` links to the
protected route.

## Prerequisites

From the repo root, once:

```bash
pnpm install
pnpm turbo build --filter=@4mica/example-seller-next...   # builds @4mica/sdk + adapters
```

## Start

```bash
# from the repo root
pnpm --filter @4mica/example-seller-next dev     # next dev on port 3002
# production: pnpm --filter @4mica/example-seller-next build && ... start
```

Open http://localhost:3002 for the landing page. Verify the route is paywalled:

```bash
curl -i http://localhost:3002/api/protected      # → HTTP/1.1 402 Payment Required
```

Then run the paired buyer in another terminal — see
[`example-buyer-next`](../example-buyer-next):

```bash
pnpm --filter @4mica/example-buyer-next start
```

## Environment variables

Runs in **demo mode** out of the box — **no variables required**.

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3002` | Preferred port. A small `scripts/serve.mjs` wrapper probes from here upward for a free port and launches `next` on it (so a busy 3002 no longer fails to start). |

The chosen URL is published to `<tmpdir>/4mica-example-next.url`, so the paired
buyer finds the server automatically even when the port moves.

## Going live (real payments)

By default `app/api/protected/route.ts` uses a mock `verifier` that returns a
fake guarantee. To verify real payments, build a client from the environment and
pass its RPC proxy as the verifier:

```ts
import { createClient } from "@4mica/sdk-node";

const client = await createClient();          // reads 4MICA_* env
export const GET = withPaywall(handler, client.rpc, PAYWALL_CONFIG);
```

`createClient()` reads these (via `ConfigBuilder.fromEnv`):

| Variable | Required | Notes |
| --- | --- | --- |
| `4MICA_WALLET_PRIVATE_KEY` | ✅ | Recipient wallet key (`0x…`). |
| `4MICA_NETWORK` | — | Shorthand/CAIP-2 (e.g. `base-sepolia`); takes precedence over `4MICA_RPC_URL`. |
| `4MICA_RPC_URL` | — | Core RPC URL. Defaults to 4Mica's Ethereum-Sepolia endpoint. |
| `4MICA_ETHEREUM_HTTP_RPC_URL` | — | Override the on-chain RPC (else provided by core). |
| `4MICA_CONTRACT_ADDRESS` | — | Override the Core4Mica address (else provided by core). |
| `4MICA_ADMIN_API_KEY` / `4MICA_BEARER_TOKEN` | — | Auth for privileged/authenticated RPC. |
| `4MICA_AUTH_URL` / `4MICA_AUTH_REFRESH_MARGIN_SECS` | — | SIWE auth endpoint / refresh margin. |

Next.js auto-loads a git-ignored `.env.local` from this directory. After a
cleared cycle, claim on-chain with `client.settlement.claim(cycleId).send()`.
