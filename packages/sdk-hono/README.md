# @4mica/sdk-hono

Hono middleware that gates a route behind a 4Mica x402 payment, plus the App API client for
reading your dashboard configuration and recording payments with a secret key. Edge-safe.

```bash
npm install @4mica/sdk-hono @4mica/sdk
```

## Secret key

Create a key in the **Secret keys** section of the API listing or agent you are integrating, copy
it once, and set it in your environment:

```bash
FOURMICA_API_KEY=4mica_sk_…
# FOURMICA_API_URL=http://localhost:4000   # only for a local stack
```

## Paywall

```ts
import { Hono } from "hono";
import { paywall } from "@4mica/sdk-hono";

const app = new Hono();

app.use(
  "/quote",
  paywall(client.rpc, {
    payTo: "0x…",
    asset: "0x0000000000000000000000000000000000000000",
    network: "base-sepolia",
    amount: "1000",
  }),
);

app.get("/quote", (c) => c.json({ ok: true, guarantee: c.get("paymentGuarantee") }));
```

Without a valid `X-PAYMENT` header the middleware returns `402` with the payment requirements.
Otherwise it verifies the payment, sets `c.get("paymentGuarantee")`, runs the handler and merges
`X-PAYMENT-RESPONSE` onto the response.

## App API

Everything from `@4mica/sdk/app` is re-exported here.

```ts
import { createAppClient, paymentFromHeader, paywall } from "@4mica/sdk-hono";

const api = createAppClient({ apiKey: process.env.FOURMICA_API_KEY! });
const { listing } = await api.resource();

app.use(
  "/quote",
  paywall(client.rpc, {
    payTo: listing!.payToAddress!,
    asset: listing!.assetAddress ?? "0x0000000000000000000000000000000000000000",
    network: "base-sepolia",
    amount: "10000",
  }),
);

app.get("/quote", async (c) => {
  const paid = paymentFromHeader(c.req.header("x-payment")!, 6);

  const decision = await api.resolveCustomer({
    payerAddress: paid.payerAddress,
    network: "base-sepolia",
    amount: paid.amount,
  });
  if (!decision.allowed) {
    return c.json({ error: decision.deniedReason }, 403);
  }

  c.executionCtx.waitUntil(
    api.reportPayment({
      reqId: paid.reqId,
      payerAddress: paid.payerAddress,
      recipientAddress: listing!.payToAddress!,
      network: "base-sepolia",
      assetAddress: listing!.assetAddress,
      amount: paid.amount,
      resource: c.req.url,
    }),
  );

  return c.json({ ok: true });
});
```

| Call                        | What it does                                                                 |
| --------------------------- | ---------------------------------------------------------------------------- |
| `api.resource()`            | The listing or agent the key belongs to: pricing, payment wiring, policy, FAQs |
| `api.resolveCustomer(input)`| Applies your customer rules (blocks, allowance, coupons, discounts, credit) to one payer and amount. Read-only |
| `api.reportPayment(input)`  | Records a payment on your dashboard ledger. Idempotent on `reqId`              |

The full reference and error table are in [`@4mica/sdk` → docs/app-api.md](../sdk/docs/app-api.md).
