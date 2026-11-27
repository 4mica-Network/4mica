---
"@4mica/sdk": minor
---

`resource()` now returns `assetDecimals` on the listing or agent: the decimals of the token its price is in, or `null` before it has a network. Sellers price x402 routes with `toBaseUnits(priceAmount, assetDecimals)`, since `priceAmount` is in display units and x402 prices in base units, and pass `assetDecimals` to `paymentFromHeader`.
