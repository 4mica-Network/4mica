# @4mica/sdk-node

Node.js adapter for the 4Mica SDK. It reads configuration from `process.env` and gives you three
things: the core client, an x402 paywall, and an **App API client** that talks to your 4Mica
dashboard with a secret key.

```bash
npm install @4mica/sdk-node
```

Node 18+.

## Secret key

Every API listing and agent in the dashboard has a **Secret keys** section. Create a key there,
copy it once, and put it in your environment:

```bash
FOURMICA_API_KEY=4mica_sk_…
# FOURMICA_API_URL=http://localhost:4000   # only for a local stack
```

The key is tied to the listing or agent it was created on: it can read only that resource, and
payments it reports are attributed to it. Revoke it from the same section.

## Core client and paywall

```ts
import { createClient, createPaywall } from "@4mica/sdk-node";

const client = await createClient(); // reads 4MICA_* variables
const paywall = await createPaywall({
  payTo: "0x…",
  asset: "0x0000000000000000000000000000000000000000",
  network: "base-sepolia",
  amount: "1000",
});
```

`createClient({ env, configure })` lets you pass another env object or tweak the `ConfigBuilder`.
`createPaywallFor(verifier, config)` wraps a client you already have.

## App API client

```ts
import { createAppClient } from "@4mica/sdk-node";

const app = createAppClient(); // reads FOURMICA_API_KEY and FOURMICA_API_URL
```

Options: `{ env, apiKey, baseUrl }`. A missing key throws `ConfigError`.

What it can do:

| Call                        | What it does                                                                 |
| --------------------------- | ---------------------------------------------------------------------------- |
| `app.resource()`            | The listing or agent the key belongs to: pricing, payment wiring, policy, FAQs |
| `app.resolveCustomer(input)`| Applies your customer rules (blocks, allowance, coupons, discounts, credit) to one payer and amount. Read-only |
| `app.reportPayment(input)`  | Records a payment on your dashboard ledger. Idempotent on `reqId`              |

Helpers are re-exported under `app`: `paymentFromHeader`, `toAppNetwork`, `toDisplayAmount`,
`AppError`.

```ts
import { createAppClient, app as appApi } from "@4mica/sdk-node";

const app = createAppClient();
const { listing, policy } = await app.resource();

const paid = appApi.paymentFromHeader(xPaymentHeader, 6);
const decision = await app.resolveCustomer({
  payerAddress: paid.payerAddress,
  network: "base-sepolia",
  amount: paid.amount,
});
if (decision.allowed) {
  await app.reportPayment({
    reqId: paid.reqId,
    payerAddress: paid.payerAddress,
    recipientAddress: listing!.payToAddress!,
    network: "base-sepolia",
    amount: paid.amount,
  });
}
```

The full reference, including the paywall flow end to end and the error table, is in
[`@4mica/sdk` → docs/app-api.md](../sdk/docs/app-api.md).
