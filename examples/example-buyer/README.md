# example-buyer

Buyer: pays for a seller's x402-priced route with `@x402/fetch` and
`@4mica/x402`'s client scheme. The wrapped `fetch` answers the seller's `402` by
signing a payment and retrying, and recovers from the refusals a payer can fix,
such as core asking for a checkpoint.

## Setup

```bash
cp .env.example .env
```

| Variable | Notes |
| --- | --- |
| `4MICA_WALLET_PRIVATE_KEY` | The paying wallet. It needs collateral deposited at 4Mica. |
| `4MICA_NETWORK` or `4MICA_RPC_URL` | Same network as the seller. |
| `RESOURCE_URL` | The paywalled route, default `http://localhost:3000/quote`. |

To deposit native collateral (`DEPOSIT_AMOUNT` wei, default 1 ETH):

```bash
pnpm --filter @4mica/example-buyer deposit
```

## Run

```bash
pnpm --filter @4mica/example-buyer start
```

