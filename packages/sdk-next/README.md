# @4mica/sdk-next

Next.js App Router helpers for gating routes behind a [4Mica](https://4mica.io) x402 payment, plus
the App API client for reading your dashboard configuration and recording payments with a secret
key.

These helpers are **Web-standard and edge-safe**: `NextRequest`/`NextResponse` extend the Web
`Request`/`Response`, so no `next` import is needed and they run on both the Edge and Node runtimes.

## Install

```bash
pnpm add @4mica/sdk-next @4mica/sdk-node
```

## Secret key

Create a key in the **Secret keys** section of the API listing or agent you are integrating, copy
it once, and set it in your environment:

```bash
FOURMICA_API_KEY=4mica_sk_…
# FOURMICA_API_URL=http://localhost:4000   # only for a local stack
```

## Route handler

```ts
// app/api/protected/route.ts
import { withPaywall } from "@4mica/sdk-next";
import { createClient } from "@4mica/sdk-node";

const client = await createClient(); // reads 4MICA_* env

export const GET = withPaywall(
  async () => Response.json({ data: "premium content" }),
  client.rpc,
  {
    payTo: "0x…",
    asset: "0x0000000000000000000000000000000000000000",
    network: "base-sepolia",
    amount: "1000",
  },
);
```

No `X-PAYMENT` header → `402` with the x402 payment requirements. Valid payment → your handler runs
and `X-PAYMENT-RESPONSE` is added to the response.

## Middleware

```ts
// middleware.ts
import { NextResponse } from "next/server";
import { paywallMiddleware } from "@4mica/sdk-next";
import { createClient } from "@4mica/sdk-node";

const client = await createClient();
const gate = paywallMiddleware(client.rpc, {
  payTo: "0x…",
  asset: "0x0000000000000000000000000000000000000000",
  network: "base-sepolia",
  amount: "1000",
});

export const config = { matcher: "/api/protected/:path*" };

export async function middleware(request: Request) {
  return (await gate(request)) ?? NextResponse.next();
}
```

## App API

Everything from `@4mica/sdk/app` is re-exported here. Use it to take the price and wallet from the
dashboard, check the payer's rules after the paywall verifies the payment, and record it.

```ts
// app/api/quote/route.ts
import { createAppClient, paymentFromHeader, withPaywall } from "@4mica/sdk-next";
import { createAppClient as createAppClientFromEnv, createClient } from "@4mica/sdk-node";

const client = await createClient();
const api = createAppClientFromEnv(); // reads FOURMICA_API_KEY
const { listing } = await api.resource();

export const GET = withPaywall(
  async (request) => {
    const paid = paymentFromHeader(request.headers.get("x-payment")!, 6);

    const decision = await api.resolveCustomer({
      payerAddress: paid.payerAddress,
      network: "base-sepolia",
      amount: paid.amount,
    });
    if (!decision.allowed) {
      return Response.json({ error: decision.deniedReason }, { status: 403 });
    }

    void api.reportPayment({
      reqId: paid.reqId,
      payerAddress: paid.payerAddress,
      recipientAddress: listing!.payToAddress!,
      network: "base-sepolia",
      assetAddress: listing!.assetAddress,
      amount: paid.amount,
      resource: request.url,
    });

    return Response.json({ ok: true });
  },
  client.rpc,
  {
    payTo: listing!.payToAddress!,
    asset: listing!.assetAddress ?? "0x0000000000000000000000000000000000000000",
    network: "base-sepolia",
    amount: "10000",
  },
);
```

On the Edge runtime there is no `process.env`; pass the key directly with
`createAppClient({ apiKey })` from this package instead of the env-driven factory.

| Call                        | What it does                                                                 |
| --------------------------- | ---------------------------------------------------------------------------- |
| `api.resource()`            | The listing or agent the key belongs to: pricing, payment wiring, policy, FAQs |
| `api.resolveCustomer(input)`| Applies your customer rules (blocks, allowance, coupons, discounts, credit) to one payer and amount. Read-only |
| `api.reportPayment(input)`  | Records a payment on your dashboard ledger. Idempotent on `reqId`              |

The full reference and error table are in [`@4mica/sdk` → docs/app-api.md](../sdk/docs/app-api.md).

## Notes

- The paywall only **verifies** payment (issues a guarantee). On-chain settlement (`remunerate`) is
  an out-of-band recipient operation.
- All heavy lifting lives in `@4mica/sdk/server`'s runtime-neutral `createPaywall`; this package is
  a thin mapping to Next's route/middleware shapes.
