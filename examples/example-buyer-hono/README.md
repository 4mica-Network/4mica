# example-buyer-hono

Buyer (payer) demo: pays for the Hono seller's paywalled `/premium` route by
performing the x402 handshake:

1. `GET /premium` → `402` with payment requirements (`accepts`)
2. Build a base64 `X-PAYMENT` header for the selected requirement
3. `GET /premium` with the header → `200` + `X-PAYMENT-RESPONSE`

It's a one-shot script (runs, prints the exchange, exits).

## Prerequisites

- From the repo root: `pnpm install`, then
  `pnpm turbo build --filter=@4mica/example-buyer-hono...`.
- **A running seller.** Start [`example-seller-hono`](../example-seller-hono)
  first (listens on port 3001):

  ```bash
  pnpm --filter @4mica/example-seller-hono dev
  ```

## Start

```bash
# from the repo root, in a second terminal
pnpm --filter @4mica/example-buyer-hono start
```

Expected output:

```
[buyer] GET http://localhost:3001/premium → 402
[buyer] payment required: { scheme: '4mica', network: 'base-sepolia', ... }
[buyer] GET http://localhost:3001/premium (paid) → 200
[buyer] X-PAYMENT-RESPONSE: <base64>
[buyer] body: { ok: true, guarantee: {...}, data: '🔓 premium market data unlocked' }
```

## Environment variables

Runs in **demo mode** out of the box — **no variables required**.

| Variable | Default | When to change |
| --- | --- | --- |
| `SELLER_URL` | `http://localhost:3001/premium` | Point at the seller. Must match the seller's host/port (e.g. if you started it with `PORT=4001`, use `SELLER_URL=http://localhost:4001/premium`). |

## Going live (real payments)

By default `src/buyer.ts` builds the `X-PAYMENT` header locally so it works
against the mock seller. To sign a real payment, use the SDK's `X402Flow`:

```ts
import { createClient } from "@4mica/sdk-node";
import { X402Flow } from "@4mica/sdk";

const client = await createClient();          // reads 4MICA_* env
const flow = X402Flow.fromClient(client);
const payment = await flow.signPayment(requirement, client.signer.signer.address);
const header = payment.header;                // the X-PAYMENT header
```

`createClient()` requires `4MICA_WALLET_PRIVATE_KEY` (the payer's `0x…` key);
`4MICA_NETWORK` / `4MICA_RPC_URL` are optional (default: 4Mica Ethereum-Sepolia).
See the seller README for the full `4MICA_*` list. Load them from a git-ignored
`.env` (`tsx --env-file=.env src/buyer.ts`).
