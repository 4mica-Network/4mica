# example-seller-hono

Seller (recipient) demo: gates `GET /premium` behind a 4Mica x402 paywall using
[`@4mica/sdk-hono`](../../packages/sdk-hono). Returns `402` with payment
requirements until a valid `X-PAYMENT` header is presented, then verifies it,
exposes the guarantee on the Hono context, and responds `200`.

## Prerequisites

From the repo root, once:

```bash
pnpm install
pnpm turbo build --filter=@4mica/example-seller-hono...   # builds @4mica/sdk + adapters
```

## Start

```bash
# from the repo root
pnpm --filter @4mica/example-seller-hono dev     # tsx watch, restarts on changes
# or: pnpm --filter @4mica/example-seller-hono start
```

You should see:

```
[seller-hono] listening on http://localhost:3001
  GET /premium is paywalled — run the buyer to pay for it.
```

Verify it's paywalled:

```bash
curl -i http://localhost:3001/premium        # → HTTP/1.1 402 Payment Required
```

Then run the paired buyer in another terminal — see
[`example-buyer-hono`](../example-buyer-hono):

```bash
pnpm --filter @4mica/example-buyer-hono start
```

## Environment variables

Runs in **demo mode** out of the box — **no variables required**.

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3001` | Preferred port. If it's already in use, the server automatically tries the next one (3002, 3003, …) and logs the port it settled on. |

The chosen URL is published to a temp file (`<tmpdir>/4mica-example-hono.url`),
so the paired buyer finds the server automatically even when the port moves — you
don't need to set `SELLER_URL`.

## Going live (real payments)

By default `src/server.ts` uses a mock `verifier` that returns a fake guarantee.
To verify real payments, build a client from the environment and pass its RPC
proxy as the verifier:

```ts
import { createClient } from "@4mica/sdk-node";

const client = await createClient();          // reads 4MICA_* env
app.use("/premium", paywall(client.rpc, PAYWALL_CONFIG));
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

Put these in a local `.env` (git-ignored) and load it (`tsx --env-file=.env …`
or your shell). After a cleared cycle, claim on-chain with
`client.recipient.claimNetCredit(cycleId)`.
