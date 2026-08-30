# Changelog

## 2.0.0a1 - Unreleased

Ground-up rewrite for the settlement-cycle protocol, mirroring the Rust SDK
2.0 architecture. Development moved from the standalone `py-sdk-4mica`
repository into the `4mica` monorepo (`packages/sdk-python`); the PyPI name
(`sdk-4mica`) and import name (`fourmica_sdk`) are unchanged.

### Breaking

- **The tab model is gone**, matching its removal from the core service.
  Everything tab-shaped was deleted: `create_tab`, `pay_tab`, `list_tabs`,
  settled-tabs / pending-remunerations / collateral-events queries,
  `remunerate`, `TabInfo`, `GuaranteeInfo`, `TabPaymentStatus`, and the
  `tabEndpoint` step of the x402 flow.
- **`UserClient` / `RecipientClient` are replaced by capability sub-clients**:
  `client.payment`, `client.settlement`, `client.deposit`, `client.withdraw`,
  `client.account`, `client.tokens`. Intents build up and a terminal runs them
  (`client.deposit.of(asset, amount).self_funded().send()`).
- **`Client.new` is now `Client.connect(cfg)`**. The Ethereum provider is
  constructed lazily on first chain access, so signing-only clients need no
  Ethereum RPC endpoint.
- **Guarantee claims are V1-only, 9 fields, with `cycle_id`** (server-assigned
  settlement cycle) instead of `tab_id`, and no `total_amount`. Claims V2 and
  the flat validation-policy hashing (`validation.py`) were removed; the
  validation story is now the nested `ValidationRequirement`
  (`{validator, subject, deadline?, params?}`) attached to V1 claims.
- **Request signing changed**: the EIP-712 domain now includes
  `verifyingContract`, and the signed struct has no `tabId`. Signatures
  produced by 1.x do not verify against current core.
- **x402**: scheme is exactly `4mica-credit`; `req_id` is a random 32-byte
  value; `/settle` sends `{x402Version, paymentPayload (object),
  paymentRequirements}` — the `paymentHeader` field is gone.
- Admin API-key management methods were removed (the routes no longer exist).
- The public-RPC fallback (`resolve_public_rpc_url`) was removed; the Ethereum
  endpoint comes from config or from core's public parameters.
- `requires-python` is now `>=3.10` (1.x claimed 3.9 but used 3.10 syntax).

### Added

- Settlement-cycle clearing: `client.settlement.pay(cycle_id)` /
  `claim(cycle_id)` builders with `action()`, `self_funded().approve()` and
  `send()`; `RpcProxy.get_clearing_participant_proof` /
  `get_clearing_settlement_action`; ClearingHouse contract support
  (`payNetDebit`, `claimNetCreditFor`).
- Account reads: `assets()`, `principal_balance`, `withdrawable_balance`,
  `stablecoin_position`, `asset_balance`.
- `SupportedTokenInfo.domain_separator`, relayed by core for gasless signing.
- Typed contract reverts (`AmountZeroError`, `InsufficientAvailableError`, …)
  and a reworked exception taxonomy mirroring the Rust SDK's error enums.
- Golden-vector tests sharing `guarantee_vectors.json` with the Rust and
  Solidity test suites.

### Packaging

- Proper `[build-system]` (hatchling). Dropped the unused `pydantic` and
  `websockets` pins and the phantom `[bls]` extra (`py-ecc` is a normal
  dependency). `requirements*.txt` replaced by `uv.lock`.
