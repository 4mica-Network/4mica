# example-seller-express

Seller (recipient) demo: gates `GET /premium` behind a 4Mica x402 paywall using
[`@4mica/sdk-express`](../../packages/sdk-express). Returns `402` with payment
requirements until a valid `X-PAYMENT` header is presented, then verifies it and
responds `200` with an `X-PAYMENT-RESPONSE` header.

## Prerequisites

From the repo root, once:

```bash
pnpm install
pnpm turbo build --filter=@4mica/example-seller-express...   # builds @4mica/sdk + adapters
```

## Start

```bash
# from the repo root
pnpm --filter @4mica/example-seller-express dev     # tsx watch, restarts on changes
# or: pnpm --filter @4mica/example-seller-express start
```

You should see:

```
[seller-express] listening on http://localhost:3000
  GET /premium is paywalled — run the buyer to pay for it.
```

Verify it's paywalled:

```bash
curl -i http://localhost:3000/premium        # → HTTP/1.1 402 Payment Required
```

Then run the paired buyer in another terminal — see
[`example-buyer-express`](../example-buyer-express):

```bash
pnpm --filter @4mica/example-buyer-express start
```

## Environment variables

Runs in **demo mode** out of the box — **no variables required**.

| Variable | Default | When to change |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on. If you change it, set the buyer's `SELLER_URL` to match, and update `tabEndpoint` in `src/server.ts`. |

Example: `PORT=4000 pnpm --filter @4mica/example-seller-express dev`, then run the
buyer with `SELLER_URL=http://localhost:4000/premium`.

## Going live (real payments)

By default `src/server.ts` uses a mock `verifier` that returns a fake guarantee.
To verify real payments, build a client from the environment and pass its RPC
proxy as the verifier:

```ts
import { createClient } from "@4mica/sdk-node";

const client = await createClient();          // reads 4MICA_* env
app.get("/premium", paywall(client.rpc, PAYWALL_CONFIG), handler);
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

Put these in a local `.env` (git-ignored) and load it (`node --env-file=.env …`,
`tsx --env-file=.env …`, or your shell). After a cleared cycle, claim on-chain
with `client.recipient.claimNetCredit(cycleId)`.
