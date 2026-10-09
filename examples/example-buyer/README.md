# example-buyer

Buyer: pays for a seller's paywalled route over x402. It fetches the route,
reads the `402` payment requirements, signs a payment guarantee with the SDK,
and fetches again with the `X-PAYMENT` header.

## Setup

```bash
cp .env.example .env
```

| Variable | Notes |
| --- | --- |
| `4MICA_WALLET_PRIVATE_KEY` | The paying wallet. It needs collateral deposited at 4Mica. |
| `4MICA_NETWORK` or `4MICA_RPC_URL` | Same network as the seller. |
| `RESOURCE_URL` | The paywalled route, default `http://localhost:3000/quote`. |

To deposit collateral:

```ts
await client.deposit.of(null, 1_000_000_000_000_000n).send();
```

## Run

```bash
pnpm --filter @4mica/example-buyer start
```

Point `RESOURCE_URL` at `http://localhost:3001/quote` for the Hono seller or
`http://localhost:3002/api/quote` for the Next.js seller.
