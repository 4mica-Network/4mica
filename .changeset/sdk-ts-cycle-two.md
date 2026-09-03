---
"@4mica/sdk": minor
---

Facilitator-sponsored gasless routes (Cycle 2 of the TypeScript SDK 2.0
series).

- Route pins across deposits, withdrawals, and settlement: `gasless()`,
  `eip3009()`, `permit2()` (+ `sponsorApproval()`), `selfFunded()`, with
  offline `sign()`, portable `authorization(...)`, and no-gas `verify()`
  terminals; unpinned `send()` auto-routes EIP-3009 → sponsored Permit2 →
  self-funded.
- Authorization types and digests: EIP-3009 `ReceiveWithAuthorization`,
  Permit2 `PermitTransferFrom`, EIP-2612 `Permit`, and Core4Mica's
  `RequestWithdrawal` / `CancelWithdrawal`, built from raw domain separators
  (token separators are relayed by core — signing needs no Ethereum RPC) and
  pinned against the deployed USDC and Permit2 contracts.
- Settlement debits pin the authorization nonce to the cycle id, as
  `payNetDebitWithAuthorization` / `payNetDebitWithPermit2` require; claims
  stay signature-free.
- The facilitator transport keeps the three-way outcome distinction
  (transport / rejected / outcome-unknown), carries `errorCode` verbatim,
  confirms every echoed field, and never falls back to self-funding on an
  unknown outcome.
