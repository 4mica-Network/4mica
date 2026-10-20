---
"@4mica/x402": minor
---

The server scheme advertises core's EIP-712 domain on every requirement, as
`extra.name`, `extra.version` and `extra.verifyingContract` (`eip712_name`,
`eip712_version` and `contract_address` from `GET /core/public-params`, fetched
once per network). The client signs from those fields when they are present
instead of connecting to core, taking the chain id from `network`, so a payer
needs no core URL for a seller that advertises them. Requirements without them
are signed as before.
