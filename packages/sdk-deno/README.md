# @4mica/sdk-deno

Deno adapter for the 4Mica SDK. It reads configuration from `Deno.env` and gives you the core
client, an x402 paywall, and an **App API client** that talks to your 4Mica dashboard with a secret
key.

```ts
import { createAppClient, createClient, createPaywall } from "npm:@4mica/sdk-deno";
```

Run with `--allow-env --allow-net`.

## Secret key

Create a key in the **Secret keys** section of the API listing or agent you are integrating, copy
it once, and put it in your environment:

```bash
FOURMICA_API_KEY=4mica_sk_…
# FOURMICA_API_URL=http://localhost:4000   # only for a local stack
```

The key is tied to that listing or agent. It can read only that resource, and payments it reports
are attributed to it.

## Core client and paywall

```ts
const client = await createClient(); // reads 4MICA_* from Deno.env
const paywall = await createPaywall({
  payTo: "0x…",
  asset: "0x0000000000000000000000000000000000000000",
  network: "base-sepolia",
  amount: "1000",
});

Deno.serve(async (request) => {
  const result = await paywall.handle(request);
  if (result instanceof Response) return result; // 402
  const response = Response.json({ ok: true });
  result.headers.forEach((value, key) => response.headers.set(key, value));
  return response;
});
```

## App API client

```ts
const app = createAppClient(); // reads FOURMICA_API_KEY and FOURMICA_API_URL
```

Options: `{ env, apiKey, baseUrl }`.

| Call                        | What it does                                                                 |
| --------------------------- | ---------------------------------------------------------------------------- |
| `app.resource()`            | The listing or agent the key belongs to: pricing, payment wiring, policy, FAQs |
| `app.resolveCustomer(input)`| Applies your customer rules (blocks, allowance, coupons, discounts, credit) to one payer and amount. Read-only |
| `app.reportPayment(input)`  | Records a payment on your dashboard ledger. Idempotent on `reqId`              |

Helpers are under the `app` namespace export: `paymentFromHeader`, `toAppNetwork`,
`toDisplayAmount`, `AppError`.

The full reference is in [`@4mica/sdk` → docs/app-api.md](../sdk/docs/app-api.md).
