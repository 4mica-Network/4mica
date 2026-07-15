# @4mica/sdk-remix

> 🚧 **Coming soon.** Remix / React Router adapter for gating routes behind a 4Mica x402 payment.

Until this ships, Remix loaders/actions receive a Web-standard `Request`, so you can use the
runtime-neutral paywall directly:

```ts
// app/routes/protected.tsx
import { createPaywall } from "@4mica/sdk/server";
import { createClient } from "@4mica/sdk-node";

const client = await createClient();
const pw = createPaywall(client.rpc, {
  payTo: "0x…",
  asset: "0x0000000000000000000000000000000000000000",
  network: "base-sepolia",
  amount: "1000",
  reqId: "0x1",
});

export async function loader({ request }: { request: Request }) {
  const result = await pw.handle(request);
  if (result instanceof Response) throw result; // 402
  return Response.json({ ok: true });
}
```

See [`@4mica/sdk-express`](../sdk-express) and [`@4mica/sdk-hono`](../sdk-hono) for reference adapters.
