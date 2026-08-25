# Changelog

## 0.3.0
- Breaking: include `reqId` in `PaymentGuaranteeRequestClaims` and signing payloads (EIP-712/EIP-191).
- Breaking: X402 envelopes now emit `req_id` and `TabResponse` exposes `nextReqId` for claim building.
- Fix: `listRecipientTabs` query parameter uses `settlement_status` to match core API.
- Improve: RPC admin endpoints return typed `UserSuspensionStatus`/`AdminApiKey*` models and errors carry status metadata.
- Fix: contract gateway disambiguates overloaded withdrawal functions for ethers v6.
