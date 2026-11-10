# 4Mica SDK examples

Two sellers and two buyers. A seller reads its price, receiving wallet and
network from your 4Mica listing with a secret key, prices a route over x402
with [`@4mica/x402`](../apps/facilitator/packages/typescript/x402)'s resource
server (through its Express middleware, or directly from a Next.js route
handler), checks the payer's rules, and reports the payment to your dashboard.
The buyers pay for that route through `@x402/fetch` with `@4mica/x402`'s
client scheme, which also recovers from the refusals a payer can fix.

| Example | Role | Framework | Port |
| --- | --- | --- | --- |
| [`example-seller-express`](./example-seller-express) | Seller | Express | 3000 |
| [`example-shop-app`](./example-shop-app) | Seller, with a UI | Next.js | 3010 |
| [`example-buyer`](./example-buyer) | Buyer | — | targets 3000 |
| [`example-wallet-app`](./example-wallet-app) | Buyer, with a UI | Next.js | 3011, targets 3010 |

## What you need

1. **A listing in the dashboard** with a receiving wallet, a network and a
   price. The seller takes all three from it.
2. **A secret key** from that listing's **Secret keys** section.
3. **A buyer wallet** with collateral deposited at 4Mica. The seller needs no
   wallet key: the facilitator verifies the payment and gets the guarantee.

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
body. The payment shows up under **Payments** in the dashboard.

## Environment variables

Seller:

| Variable | Notes |
| --- | --- |
| `FOURMICA_API_KEY` | Secret key from the listing. |
| `FOURMICA_API_URL` | Only for a local `apps/be`, default `https://api.app.4mica.io`. |
| `FACILITATOR_URL` | Defaults to the hosted testnet facilitator. |
| `PORT` | Defaults to 3000. |

Buyer:

| Variable | Notes |
| --- | --- |
| `4MICA_WALLET_PRIVATE_KEY` | The paying wallet, with collateral. |
| `4MICA_NETWORK` or `4MICA_RPC_URL` | Same network as the seller. |
| `RESOURCE_URL` | The paid route, default `http://localhost:3000/quote`. |

For a fully local stack (anvil, core, facilitator, dashboard) see
[`docs/LOCAL_STACK.md`](../docs/LOCAL_STACK.md).

## Developing the SDK against them

The examples import the SDK's built output, so run the watchers alongside:

```bash
pnpm turbo dev --filter=@4mica/example-seller-express...
```

Edits under `packages/sdk/src` or `@4mica/x402` rebuild `dist` and restart the
example.
