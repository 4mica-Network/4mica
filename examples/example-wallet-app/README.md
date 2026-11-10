# example-wallet-app

Buyer with a UI, built with Next.js and the 4Mica component library (`@4mica/ui`, `@4mica/tailwind-config`), styled like the dashboard. A wallet that deposits
collateral at 4Mica and pays for any x402 route on credit: paste a paid URL,
check its price, buy it. The private key stays in the server's route handlers
(`app/api/*`); the page only calls them.

Buying goes through `@x402/fetch` with `@4mica/x402`'s client scheme: the
wrapped `fetch` answers the seller's `402` by signing a payment and retrying, and
recovers from the refusals a payer can fix, such as core asking for a
checkpoint. The SDK client in `lib/wallet.ts` serves the balance and deposits.

## Setup

```bash
cp .env.example .env
```

| Variable | Notes |
| --- | --- |
| `4MICA_WALLET_PRIVATE_KEY` | The paying wallet. Any funded anvil key locally. |
| `4MICA_RPC_URL` | `http://127.0.0.1:3000` for a local core. |
| `NEXT_PUBLIC_SHOP_URL` | The URL the page starts with, default `http://localhost:3010/insight` ([`example-shop-app`](../example-shop-app)); `http://localhost:3000/quote` for [`example-seller-express`](../example-seller-express). |

## Run

```bash
pnpm --filter @4mica/example-wallet-app dev
```

Open http://localhost:3011, deposit some ETH, then buy.

On a local anvil, core credits a deposit only after the next block, and
anvil mines only when a transaction arrives. Nudge it with
`cast rpc --rpc-url http://127.0.0.1:8545 anvil_mine 2`.
