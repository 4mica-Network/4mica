# @4mica/sdk-nuxt

> 🚧 **Coming soon.** Nuxt (Nitro) adapter for gating server routes behind a 4Mica x402 payment.

Until this ships, Nuxt's Nitro server routes use Web-standard `Request`/`Response`, so you can
use the runtime-neutral paywall directly:

```ts
// server/middleware/paywall.ts
import { createPaywall } from "@4mica/sdk/server";
import { createClient } from "@4mica/sdk-node";

const client = await createClient();
const pw = createPaywall(client.rpc, {
  payTo: "0x…",
  asset: "0x0000000000000000000000000000000000000000",
  network: "base-sepolia",
  amount: "1000",
});

export default defineEventHandler(async (event) => {
  const result = await pw.handle(toWebRequest(event));
  if (result instanceof Response) return result;
});
```

See [`@4mica/sdk-express`](../sdk-express) and [`@4mica/sdk-hono`](../sdk-hono) for reference adapters.
