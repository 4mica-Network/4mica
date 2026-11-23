---
"@4mica/sdk": minor
---

`parseSettlement(settlement)` in `@4mica/sdk/app` reads an x402
`onAfterSettle` context into what `reportPayment` takes: `reqId`,
`payerAddress`, the amount in the asset's base units, and the guarantee
receipt as `guaranteeClaims` and `guaranteeSignature`. Sellers no longer cast
the payment payload or the settle result themselves.
