# example-buyer-express

Buyer (payer) demo: pays for the Express seller's paywalled `/premium` route by
performing the x402 handshake:

1. `GET /premium` → `402` with payment requirements (`accepts`)
2. Build a base64 `X-PAYMENT` header for the selected requirement
3. `GET /premium` with the header → `200` + `X-PAYMENT-RESPONSE`

It's a one-shot script (runs, prints the exchange, exits).

## Prerequisites

- From the repo root: `pnpm install`, then
  `pnpm turbo build --filter=@4mica/example-buyer-express...`.
- **A running seller.** Start [`example-seller-express`](../example-seller-express)
  first (listens on port 3000):

  ```bash
  pnpm --filter @4mica/example-seller-express dev
  ```

## Start

```bash
# from the repo root, in a second terminal
pnpm --filter @4mica/example-buyer-express start
```

Expected output:

```
[buyer] GET http://localhost:3000/premium → 402
[buyer] payment required: { scheme: '4mica', network: 'base-sepolia', ... }
[buyer] GET http://localhost:3000/premium (paid) → 200
[buyer] X-PAYMENT-RESPONSE: <base64>
[buyer] body: { ok: true, data: '🔓 premium market data unlocked' }
```

## Environment variables

Runs in **demo mode** out of the box — **no variables required**.

| Variable | Default | Notes |
| --- | --- | --- |
| `SELLER_URL` | auto-discovered | Resolved as: `SELLER_URL` env → the running seller's published URL (`<tmpdir>/4mica-example-express.url`) → `http://localhost:3000/premium`. Set it explicitly only to target a seller on another host. |

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
