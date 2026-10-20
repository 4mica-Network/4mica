---
"@4mica/x402": major
---

First release on `@4mica/sdk` 2.0 and the tab-free protocol.

- The tab handshake is gone: clients sign their claim straight from the payment
  requirements with a random 32-byte `reqId`. `FourMicaFacilitatorClient.openTab`,
  the `OpenTab*` types, the Express middlewares' `tabConfig` parameter and the
  server scheme's `advertisedTabEndpoint` are removed. The flat ERC-8004 policy
  types are replaced by `FourMicaRequirementsExtra` with a nested `validation`.
- Server: a `Money` price (`"$0.10"`) resolves to the stablecoin 4mica core lists
  for the network (`GET /core/tokens`) instead of a hardcoded USDC table, so the
  advertised `asset` is always one core accepts. `new FourMicaEvmScheme({
  coreUrls?, stablecoinSymbol? })` points a network at a self-hosted core or
  picks another listed token. The EIP-3009 `name` / `version` hints in `extra`
  are gone: a 4mica-credit payer signs against core's guarantee domain.
- Client: `FourMicaEvmScheme.create(account, { coreUrls?, networks? })`
  overrides a network's core and limits the up-front connections. The scheme
  implements `findDefaultAsset` from core's token list, so `@x402/fetch` spend
  controls accept the advertised asset and apply their USD cap to it.
- Express: the middlewares no longer overwrite a scheme server the caller
  registered for a hosted network, so a self-hosted core on a hosted chain id
  works.
- Supported networks: Base (`eip155:8453`) and Base Sepolia (`eip155:84532`)
  for x402 v1 and v2; Ethereum Sepolia for v1 only.
