# Changelog

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
