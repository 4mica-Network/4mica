---
"@4mica/sdk": minor
---

`toCaip2(network)` resolves a shorthand (`"base-sepolia"`), the app API's enum
(`"BASE_SEPOLIA"`, as `resource()` returns it) or a CAIP-2 id to the CAIP-2 id
x402 middleware takes, and throws `InvalidParamsError` for an unknown network.
It replaces `NETWORKS[fromAppNetwork(network)].caip2` and its type cast.
