---
"@4mica/sdk": major
---

Breaking: `@4mica/sdk/server` and its `createPaywall` are removed, along with
the `@4mica/sdk-express`, `-hono`, `-next`, `-node` and `-deno` packages built
on it. Charge for a route with `@4mica/x402`'s Express middleware instead.
`parsePaymentHeader` moves to the main entry; the base64 helpers are no longer
exported.
