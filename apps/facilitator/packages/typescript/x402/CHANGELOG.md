# @4mica/x402

## 2.0.0-alpha.2

### Major Changes

- 70d83f9: First release on `@4mica/sdk` 2.0 and the tab-free protocol.

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

### Minor Changes

- 9136814: The server scheme advertises core's EIP-712 domain on every requirement, as
  `extra.name`, `extra.version` and `extra.verifyingContract` (`eip712_name`,
  `eip712_version` and `contract_address` from `GET /core/public-params`, fetched
  once per network). The client signs from those fields when they are present
  instead of connecting to core, taking the chain id from `network`, so a payer
  needs no core URL for a seller that advertises them. Requirements without them
  are signed as before.

### Patch Changes

- Updated dependencies [34eada6]
- Updated dependencies [8998b02]
- Updated dependencies [6b0974a]
  - @4mica/sdk@2.0.0-alpha.0

## 2.0.0-alpha.1

- Breaking: migrate to `@4mica/sdk` 2.0 and the tab-free protocol. The tab
  handshake is gone — clients sign their claim straight from the payment
  requirements with a random 32-byte `reqId`.
- Breaking: `FourMicaEvmScheme` (server) takes no `advertisedTabEndpoint`;
  `enhancePaymentRequirements` no longer injects `extra.tabEndpoint`.
- Breaking: the Express middlewares lose their `tabConfig` parameter and the
  tab-open route interception.
- Breaking: `FourMicaFacilitatorClient.openTab`, `OpenTabRequest`,
  `OpenTabResponse`, and `OpenTabError` are removed (`POST /tabs` no longer
  exists).
- Breaking: `FourMicaV2RequirementsExtra` / `FourMicaPaymentRequirementsV2`
  (the flat ERC-8004 validation policy) are replaced by
  `FourMicaRequirementsExtra` with a nested `validation`
  (`{ validator, subject, deadline?, params? }`).

## 0.3.0

- Breaking: include `reqId` in `PaymentGuaranteeRequestClaims` and signing payloads (EIP-712/EIP-191).
- Breaking: X402 envelopes now emit `req_id` and `TabResponse` exposes `nextReqId` for claim building.
- Fix: `listRecipientTabs` query parameter uses `settlement_status` to match core API.
- Improve: RPC admin endpoints return typed `UserSuspensionStatus`/`AdminApiKey*` models and errors carry status metadata.
- Fix: contract gateway disambiguates overloaded withdrawal functions for ethers v6.
