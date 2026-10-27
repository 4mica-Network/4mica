---
"@4mica/cli": minor
---

The seller and buyer templates come in Express only, and the sellers charge
through `@4mica/x402`'s Express middleware. The Hono and Next templates are
removed, so `--framework` accepts only `express`. Templates speak x402 v2: the
requirements arrive in `PAYMENT-REQUIRED` and the payment goes in
`PAYMENT-SIGNATURE`.
