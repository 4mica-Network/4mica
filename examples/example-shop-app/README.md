# example-shop-app

Seller with a UI, built with Next.js and the 4Mica component library (`@4mica/ui`, `@4mica/tailwind-config`), styled like the dashboard. A shop that sells one
paid route, `GET /insight`, priced from your 4Mica listing and paid over x402
with [`@4mica/x402`](../../apps/facilitator/packages/typescript/x402)'s resource
server. Its page shows the listing and its price; sales show up under
**Payments** in your 4Mica dashboard.

- `lib/shop.ts` — reads the listing, prices the route and reports each settled payment
- `app/insight/route.ts` — the paywalled product
- `app/api/shop/route.ts` — listing details for the page
- `app/page.tsx` — the shop page

## Setup

```bash
cp .env.example .env
```

| Variable | Notes |
| --- | --- |
| `FOURMICA_API_KEY` | Dashboard → your API listing → **Secret keys** → Create key. |
| `FOURMICA_API_URL` | Only for a local `apps/be`. |
| `FACILITATOR_URL` | Defaults to the hosted testnet facilitator. |

The listing itself supplies the receiving wallet, the network and the price. The shop needs no wallet key of its own: the facilitator verifies each payment and gets the guarantee from 4mica core.

## Run

```bash
# from the repo root, once
pnpm turbo build --filter=@4mica/example-shop-app...

pnpm --filter @4mica/example-shop-app dev
```

Open http://localhost:3010, then buy from it with
[`example-wallet-app`](../example-wallet-app).

## What it does

1. `createAppClient()` takes `FOURMICA_API_KEY` and `api.resource()` returns the listing.
2. `x402HTTPResourceServer` prices `GET /insight` from the listing's `payToAddress`, `assetAddress`, `network` and `priceAmount`. The route handler hands it each request: an unpaid one gets the `402`, a paid one is verified before the insight is produced and settled after.
3. Before answering, `api.resolveCustomer()` applies the payer rules you set in the dashboard. A refused payer gets a 403 and is not charged.
4. Once the facilitator settles the payment, `api.reportPayment()` records it, with the guarantee receipt 4mica core issued, so it shows under **Payments**.
