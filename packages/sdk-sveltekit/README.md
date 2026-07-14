# @4mica/sdk-sveltekit

> 🚧 **Coming soon.** SvelteKit adapter for gating routes behind a 4Mica x402 payment.

Until this ships, SvelteKit `hooks.server.ts` and endpoints use Web-standard `Request`/`Response`,
so you can use the runtime-neutral paywall directly:

```ts
// src/hooks.server.ts
import { createPaywall } from "@4mica/sdk/server";
import { createClient } from "@4mica/sdk-node";

const client = await createClient();
const pw = createPaywall(client.rpc, {
  payTo: "0x…",
  asset: "0x0000000000000000000000000000000000000000",
  network: "base-sepolia",
  amount: "1000",
  tabEndpoint: "https://recipient.example/tab",
});

export async function handle({ event, resolve }) {
  const result = await pw.handle(event.request);
  if (result instanceof Response) return result;
  const response = await resolve(event);
  result.headers.forEach((v, k) => response.headers.set(k, v));
  return response;
}
```

See [`@4mica/sdk-express`](../sdk-express) and [`@4mica/sdk-hono`](../sdk-hono) for reference adapters.
