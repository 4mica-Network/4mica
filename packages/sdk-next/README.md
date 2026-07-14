# @4mica/sdk-next

Next.js App Router helpers for gating routes behind a [4Mica](https://4mica.io) x402 payment.

These helpers are **Web-standard and edge-safe** — `NextRequest`/`NextResponse` extend the Web
`Request`/`Response`, so no `next` import is needed and they run on both the Edge and Node runtimes.

## Install

```bash
pnpm add @4mica/sdk-next @4mica/sdk-node
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
    tabEndpoint: "https://your-recipient.example/tab",
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
  tabEndpoint: "https://your-recipient.example/tab",
});

export const config = { matcher: "/api/protected/:path*" };

export async function middleware(request: Request) {
  return (await gate(request)) ?? NextResponse.next();
}
```

## Notes

- The paywall only **verifies** payment (issues a guarantee). On-chain settlement (`remunerate`) is
  an out-of-band recipient operation.
- All heavy lifting lives in `@4mica/sdk/server`'s runtime-neutral `createPaywall`; this package is
  a thin mapping to Next's route/middleware shapes.
