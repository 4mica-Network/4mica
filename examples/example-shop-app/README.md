# example-shop-app

Seller with a UI, built with Next.js and the 4Mica component library (`@4mica/ui`, `@4mica/tailwind-config`), styled like the dashboard. A shop that sells one
paid route, `GET /insight`, priced from your 4Mica listing. Its page shows the
listing and its price; sales show up under **Payments** in your 4Mica
dashboard.

- `app/insight/route.ts` — the paywalled product, reported with core's certificate
- `app/api/shop/route.ts` — listing details for the page
- `app/page.tsx` — the shop page

## Setup

```bash
cp .env.example .env
```

| Variable | Notes |
| --- | --- |
| `4MICA_WALLET_PRIVATE_KEY` | Signs payment guarantees. Needs no balance. Locally use core's dev facilitator key (anvil #11). |
| `4MICA_RPC_URL` | `http://127.0.0.1:3000` for a local core. |
| `FOURMICA_API_KEY` | Secret key from the listing in the dashboard. |
| `FOURMICA_API_URL` | `http://localhost:4000` for a local `apps/be`. |

## Run

```bash
pnpm --filter @4mica/example-shop-app dev
```

Open http://localhost:3010, then buy from it with
[`example-wallet-app`](../example-wallet-app).
