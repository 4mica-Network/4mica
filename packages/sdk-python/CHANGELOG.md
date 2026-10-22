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
- **Checkpointed guarantees** (core 2.0.0-alpha.4), matching the Rust SDK.
  Guarantee claims, BLS certificates, EIP-191 signing and guarantee versions
  are gone, and with them `PaymentGuaranteeRequestClaims`,
  `PaymentGuaranteeClaims`, `BLSCert`, `PaymentSignature`, `SigningScheme`,
  `GuaranteeVersionDomain`, `GUARANTEE_CLAIMS_VERSION`,
  `encode_guarantee_claims` / `decode_guarantee_claims`, `PaymentSigner` and
  `bls_utils`.
  - A payer builds a `PaymentRequestPayload` with `payment.new_payment`,
    scoped to the asset's active settlement cycle (`cycle_id`, bytes32) with
    a random `req_id` and `salt`, and signs it with `payment.sign_request`.
    The signed struct is the ClearingHouse's `PaymentAuthorization`, under the
    `4micaClearingHouse` domain; the recipient and any
    `ValidationRequirement` are bound through a salted recipient commitment.
  - `payment.issue_guarantee(request)` returns a `GuaranteeReceipt`: the
    `GuaranteeV1` bytes the GuaranteeRegistry verifies, with the operator's
    ECDSA signature under the `4micaGuaranteeRegistry` domain.
    `payment.verify_guarantee(receipt)` checks it offline and returns the
    `Guarantee`; `verify_guarantee_receipt` does the same without a client.
  - `CorePublicParameters` lost `public_key`, `supported_guarantee_versions`,
    `guarantee_domain_separator` and `guarantee_domains`, and gained
    `guarantee_signer`, `guarantee_registry_address`, `clearing_house_address`
    and `supported_payment_payload_versions`. Connecting reads nothing from
    the chain.
  - `X402Flow.sign_payment` / `sign_payment_v2` no longer take
    `user_address`; `FlowSigner` is now `new_payment` + `sign_payment`.
    `X402SignedPayment.payload` is the `PaymentRequest` (its `signature`
    field is gone) and `SettlementReceipt.certificate` became `receipt`.
- **The Treasury replaced Core4Mica's Aave accounting** with pool shares and a
  pluggable ERC-4626 strategy. `StablecoinPosition` swapped the scaled-balance
  and aToken fields for `user_shares`, `total_user_shares`,
  `protocol_shares`, `pool_shares`, `pool_assets` and `strategy`.
  `StablecoinWithdrawShortfallError` and `AaveNotConfiguredError` became
  `InsufficientLiquidityError`, and deposits can now fail with
  `DepositsDisabledError`, `StablecoinDepositsDisabledError`,
  `PoolInsolventError` or `PausedError`. The ABI is vendored as
  `treasury.json`, and `clearing_house.json` is refreshed alongside it (both
  from 4mica-core `67d20e9`).
- `AddressMismatchError` names the `payer` (was `claims_user`).
  `InvalidCertificateError`, `CertificateMismatchError`,
  `GuaranteeDomainMismatchError`, `UnsupportedGuaranteeVersionError` and
  `VerificationError` were removed.
- **x402**: scheme is exactly `4mica-credit`; `req_id` is a random 32-byte
  value; `/settle` sends `{x402Version, paymentPayload (object),
  paymentRequirements}` — the `paymentHeader` field is gone.
- **Facilitator responses follow x402** (needs a facilitator with #113).
  `FacilitatorRejectedError.code` is the facilitator's snake_case reason
  (`invalid_signature`, `rate_limited`, `permit2_allowance_required`, …)
  instead of a SCREAMING_CASE code, and `retryable` and the EIP-2612 nonce are
  read from `extra`. `SettlementReceipt` reads the guarantee receipt from
  `extra.receipt`, renames `tx_hash` to `transaction` and `network_id` to
  `network`, splits `error` into `error_reason` and `error_message`, and adds
  `payer`, `retryable` and `details`.
- Admin API-key management methods were removed (the routes no longer exist).
- The public-RPC fallback (`resolve_public_rpc_url`) was removed; the Ethereum
  endpoint comes from config or from core's public parameters.
- `requires-python` is now `>=3.10` (1.x claimed 3.9 but used 3.10 syntax).

### Added

- **Facilitator-sponsored gasless routes** across deposits, withdrawals and
  clearing settlement: `gasless()`, `eip3009()`, `permit2()` (with
  `sponsor_approval()`) route pins, offline `sign()` terminals producing
  self-contained authorizations (`ReceiveAuthorization`,
  `Permit2Authorization`, `WithdrawalRequestAuthorization`,
  `WithdrawalCancelAuthorization`), `authorization(...)` to redeem one signed
  elsewhere, and `verify()` preflights. Auto `send()` prefers gasless and
  falls back to self-funding only when the rejection does not name the
  request; unknown outcomes are never retried. Facilitator rejections carry
  their `errorCode` verbatim; `PERMIT2_ALLOWANCE_REQUIRED` surfaces as
  `Permit2AllowanceRequiredError` with the EIP-2612 nonce when the approval
  can be sponsored. Configure with `facilitator_url` /
  `4MICA_FACILITATOR_URL`.
- Authorization digests in `fourmica_sdk.digest` (EIP-3009, Permit2,
  EIP-2612, withdrawal request/cancel), pinned against the deployed Base
  Sepolia USDC and Permit2 domain separators; `EvmSigner` grew a `sign_hash`
  method to sign them.
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
- Checkpoints: `payment.checkpoint_active_cycle(asset)` and
  `checkpoint_cycle(asset, cycle_id)` sign and submit the checkpoint covering
  a payer's outstanding payments, retrying once when a payment lands
  mid-checkpoint. Core's batch is checked first, and nothing is signed over a
  payment the payer did not sign, a forged previous checkpoint, a payment
  already covered or counted twice, or another cycle or asset
  (`UntrustedCheckpointBatchError`). Also `active_cycle`, `checkpoint_batch`,
  `checkpoint_batch_for_cycle`, `submit_checkpoint`, and the matching
  `RpcProxy` calls.
- Core's coded refusals arrive typed with their details:
  `CheckpointRequiredError`, `CheckpointMismatchError`, `CycleMismatchError`,
  `FutureTimestampError`, `StaleTimestampError`,
  `TimestampNotPastCutoffError`, all `CoreRefusalError` (a `PaymentError` and
  an `RpcError`). `RpcError` carries `code` and `details` for every coded
  refusal.
- Payments are stamped by core's clock as it last reported it, kept inside
  the cycle they are signed for, and held past the payer's latest checkpoint
  cutoff. A cycle is reused until its period ends or core refuses it.
- Golden-vector tests against core's `checkpoint_vectors.json` and
  `guarantee_vectors.json` (shared with the Solidity suites) and the Rust
  SDK's `digest_vectors.json`, plus a port of the Rust SDK's refusal tests.

### Packaging

- Proper `[build-system]` (hatchling). Dropped the unused `pydantic` and
  `websockets` pins, the phantom `[bls]` extra, and `py-ecc` (no BLS left to
  verify). `requirements*.txt` replaced by `uv.lock`.
