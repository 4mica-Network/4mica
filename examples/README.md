# 4Mica SDK examples

One seller per framework and one buyer. A seller reads its price, receiving
wallet and network from your 4Mica listing with a secret key, gates a route
behind an x402 paywall, checks the payer's rules, and reports the payment to
your dashboard. The buyer pays for that route.

| Example | Role | Framework | Port |
| --- | --- | --- | --- |
| [`example-seller-express`](./example-seller-express) | Seller | Express | 3000 |
| [`example-seller-hono`](./example-seller-hono) | Seller | Hono | 3001 |
| [`example-seller-next`](./example-seller-next) | Seller | Next.js | 3002 |
| [`example-buyer`](./example-buyer) | Buyer | — | targets 3000 |

## What you need

1. **A listing in the dashboard** with a receiving wallet, a network and a
   price. The seller takes all three from it.
2. **A secret key** from that listing's **Secret keys** section.
3. **Two wallets**: one for the seller (it only signs, no balance needed) and
   one for the buyer with collateral deposited at 4Mica.

## Run it

From the repo root, once:

```bash
pnpm install
pnpm turbo build --filter=@4mica/example-seller-express...
```

Then:

```bash
cp examples/example-seller-express/.env.example examples/example-seller-express/.env
cp examples/example-buyer/.env.example          examples/example-buyer/.env
# fill in the keys

pnpm --filter @4mica/example-seller-express dev    # terminal 1
pnpm --filter @4mica/example-buyer start           # terminal 2
```

The buyer prints the `402`, the price it was quoted, then the paid `200` and the
body. The payment shows up under **Payments** in the dashboard. Swap `express`
for `hono` or `next` and point the buyer's `RESOURCE_URL` at port 3001 or 3002.

## Environment variables

Seller:

| Variable | Notes |
| --- | --- |
| `4MICA_WALLET_PRIVATE_KEY` | Signs payment guarantees. Needs no balance. |
| `4MICA_NETWORK` or `4MICA_RPC_URL` | Hosted network shorthand, or a local core URL. |
| `FOURMICA_API_KEY` | Secret key from the listing. |
| `FOURMICA_API_URL` | Only for a local `apps/be`, default `https://api.app.4mica.io`. |
| `PORT` | Defaults per framework, see the table above. |

Buyer:

| Variable | Notes |
| --- | --- |
| `4MICA_WALLET_PRIVATE_KEY` | The paying wallet, with collateral. |
| `4MICA_NETWORK` or `4MICA_RPC_URL` | Same network as the seller. |
| `RESOURCE_URL` | The paywalled route, default `http://localhost:3000/quote`. |

For a fully local stack (anvil, core, facilitator, dashboard) see
[`docs/LOCAL_STACK.md`](../docs/LOCAL_STACK.md).

## Developing the SDK against them

The examples import the SDK's built output, so run the watchers alongside:

```bash
pnpm turbo dev --filter=@4mica/example-seller-express...
```

Edits under `packages/sdk/src` or an adapter rebuild `dist` and restart the
example.
