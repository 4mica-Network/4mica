# example-buyer-next

Buyer (payer) demo: pays for the Next.js seller's paywalled `/api/protected`
route by performing the x402 handshake:

1. `GET /api/protected` → `402` with payment requirements (`accepts`)
2. Build a base64 `X-PAYMENT` header for the selected requirement
3. `GET /api/protected` with the header → `200` + `X-PAYMENT-RESPONSE`

It's a one-shot script (runs, prints the exchange, exits).

## Prerequisites

- From the repo root: `pnpm install`, then
  `pnpm turbo build --filter=@4mica/example-buyer-next...`.
- **A running seller.** Start [`example-seller-next`](../example-seller-next)
  first (listens on port 3002):

  ```bash
  pnpm --filter @4mica/example-seller-next dev
  ```

## Start

```bash
# from the repo root, in a second terminal
pnpm --filter @4mica/example-buyer-next start
```

Expected output:

```
[buyer] GET http://localhost:3002/api/protected → 402
[buyer] payment required: { scheme: '4mica', network: 'base-sepolia', ... }
[buyer] GET http://localhost:3002/api/protected (paid) → 200
[buyer] X-PAYMENT-RESPONSE: <base64>
[buyer] body: { ok: true, data: '🔓 premium market data unlocked' }
```

## Environment variables

Runs in **demo mode** out of the box — **no variables required**.

| Variable | Default | When to change |
| --- | --- | --- |
| `SELLER_URL` | `http://localhost:3002/api/protected` | Point at the seller. Must match the seller's host/port (the Next seller is fixed at 3002). |

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
