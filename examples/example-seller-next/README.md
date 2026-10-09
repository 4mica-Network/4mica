# example-seller-next

Seller: `GET /api/quote` in a Next.js App Router route, priced from your 4Mica listing and paid over x402 with [`@4mica/sdk-next`](../../packages/sdk-next). Next.js loads `.env` itself.

## Setup

```bash
cp .env.example .env
```

| Variable | Notes |
| --- | --- |
| `4MICA_WALLET_PRIVATE_KEY` | Signs payment guarantees. Needs no balance. |
| `4MICA_NETWORK` or `4MICA_RPC_URL` | Hosted network shorthand, or a local core URL. |
| `FOURMICA_API_KEY` | Dashboard → your API listing → **Secret keys** → Create key. |
| `FOURMICA_API_URL` | Only for a local `apps/be`. |
| `PORT` | Defaults to 3002. |

The listing itself supplies the receiving wallet, the network and the price.

## Run

```bash
# from the repo root, once
pnpm turbo build --filter=@4mica/example-seller-next...

pnpm --filter @4mica/example-seller-next dev
```

```bash
curl -i http://localhost:3002/api/quote        # 402 with the payment requirements
pnpm --filter @4mica/example-buyer start  # pays and prints the 200
```

## What it does

1. `createAppClient()` reads `FOURMICA_API_KEY` and `api.resource()` returns the listing.
2. `createClient()` connects to 4Mica with the seller wallet.
3. The paywall is built from the listing's `payToAddress`, `assetAddress`, `network` and `priceAmount`.
4. After a payment is verified, `api.resolveCustomer()` applies the payer rules you set in the dashboard, and `api.reportPayment()` records the payment so it shows under **Payments**.
