---
"@4mica/sdk": major
"@4mica/sdk-node": major
"@4mica/sdk-bun": major
"@4mica/sdk-deno": major
"@4mica/sdk-next": major
"@4mica/sdk-express": major
"@4mica/sdk-hono": major
---

TypeScript SDK 2.0: settlement cycles and the tab-free protocol.

- `Client.new(cfg)` → `await Client.connect(cfg)`; the client is now six
  capability sub-clients (`deposit`, `withdraw`, `payment`, `settlement`,
  `account`, `tokens`) with intent-builder terminals, replacing
  `client.user` / `client.recipient`.
- The EIP-712 request domain now includes `verifyingContract` and the claims
  collapse to a single V1 class with an optional nested
  `ValidationRequirement` — the flat V2 validation-policy claims, the local
  hash derivation, and `PaymentGuaranteeRequestClaimsV2` are gone. Digests are
  pinned by the golden vectors shared with the Rust, Python, and Solidity
  suites.
- x402 is tab-free: `requestTab` / `TabResponse` / `extra.tabEndpoint` are
  removed, each payment mints a random 32-byte `reqId` locally, the scheme is
  strictly `4mica-credit`, `/settle` takes the envelope object (no
  `paymentHeader`), and settlement results are typed `SettlementReceipt`s
  (failures are HTTP 200 + `success: false`).
- `PaywallConfig` loses its required `tabEndpoint`; validation gating is
  advertised via `extra.validation`.
- `verifyGuarantee` now BLS-verifies certificates against the operator key.
- Removed dead surface: admin API-key management, `markDefaulted`, and the
  public-RPC fallback. Transport errors are typed `RpcError`s; GETs retry on
  429/5xx, POSTs never do; connecting stays unauthenticated until the public
  parameters resolve.
