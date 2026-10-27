# example-seller-express

Seller: `GET /quote` on Express, priced from your 4Mica listing and paid over x402 with [`@4mica/x402`](../../apps/facilitator/packages/typescript/x402)'s Express middleware.

## Setup

```bash
cp .env.example .env
```

| Variable | Notes |
| --- | --- |
| `FOURMICA_API_KEY` | Dashboard → your API listing → **Secret keys** → Create key. |
| `FOURMICA_API_URL` | Only for a local `apps/be`. |
| `FACILITATOR_URL` | Defaults to the hosted testnet facilitator. |
| `PORT` | Defaults to 3000. |

The listing itself supplies the receiving wallet, the network and the price. The seller needs no wallet key of its own: the facilitator verifies each payment and gets the guarantee from 4mica core.

## Run

```bash
# from the repo root, once
pnpm turbo build --filter=@4mica/example-seller-express...

pnpm --filter @4mica/example-seller-express dev
```

```bash
curl -i http://localhost:3000/quote        # 402 with the payment requirements
pnpm --filter @4mica/example-buyer start  # pays and prints the 200
```

## What it does

1. `createAppClient()` takes `FOURMICA_API_KEY` and `api.resource()` returns the listing.
2. `paymentMiddleware()` prices `GET /quote` from the listing's `payToAddress`, `assetAddress`, `network` and `priceAmount`.
3. Before answering, `api.resolveCustomer()` applies the payer rules you set in the dashboard. A refused payer gets a 403 and is not charged.
4. Once the facilitator settles the payment, `api.reportPayment()` records it, with the guarantee receipt 4mica core issued, so it shows under **Payments**.
