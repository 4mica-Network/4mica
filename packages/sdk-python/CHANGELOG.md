# Changelog

## 2.1.0 - Unreleased

### Added

- The package ships `py.typed`, so type checkers read its annotations; it
  passes `mypy --strict`.
- **`FourMica`**: a short way in, matching `FourMica` in the TypeScript SDK.
  Connect once, then deposit, pay and withdraw with amounts written the way
  people write them.

  ```python
  async with await FourMica.connect(private_key="0x...") as client:
      await client.deposit("5 USDC")
      response = await client.fetch("https://api.example.com/data")
  ```

  - `FourMica.connect(private_key= | signer= | env=, network=, rpc_url=,
    facilitator_url=, spend=, protocols=, http_client=)`. Each network the
    session touches gets its own `Client`, connected on first use;
    `aclose()` (or `async with`) closes them all, and `await
    client.low_level(network)` hands over the `Client`.
  - `deposit("5 USDC")` resolves the asset against core's token list, checks
    the wallet before anything is signed, goes gasless where it can, and
    returns once core counts the deposit. Running out of time returns
    `status="pending"` instead of raising. "Counted" is read off the
    account's collateral total, so deposits of one asset through a session
    run one after another: started together, two would both be confirmed by
    core counting either.
  - `balance()`, `withdraw()`, `withdrawals()`, `finalize_withdrawal()` and
    `cancel_withdrawal()`. The last two take a token address for an asset
    core no longer lists, so every request `withdrawals()` reports can be
    finalized or cancelled.
  - `fetch(url, method=, **kwargs)` sends an `httpx` request, pays a
    `4mica-credit` x402 challenge within the session's `SpendLimits`
    (default: at most 1 USDC per payment) and retries once.
    `payment_for(response)` reports what was paid. A payment over a limit
    raises `SpendLimitError` before anything is signed.
  - `SpendLimits.total` is one budget per entry for the whole session,
    shared by every network it pays on, and once set refuses an asset no
    entry names. A payment sent to a seller stays counted whatever comes
    back, a second 402 included.
  - After a redirect, `fetch` pays the request that was answered 402, not
    the one it started with, and only on the origin it was asked for. The
    paid retry follows no redirect, so the payment is never forwarded.
  - `positions()` lists what the wallet still owes and is owed, one entry
    per asset and settlement cycle, soonest deadline first. `settle(only=)`
    pays every open debit and claims every open credit, gaslessly where it
    can; with no facilitator a token debit is approved for the exact amount
    and paid by the wallet. One that fails does not stop the others: each
    `SettleResult` says `settled`, `skipped`, `failed` or `unknown`.
- `client.settlement.positions()` and `client.payment.list_issued(cycle_id,
  limit=, after=)`, over core's `/core/participants/{addr}/positions` and
  `/core/payers/{addr}/guarantees`, with `ClearingPosition`,
  `PayerGuaranteeInfo` and `PayerGuaranteesPage`. A position missing a
  field, or with an unknown role or a deadline that is not a time, raises
  `InvalidParamsError` rather than being filled in.
- `fourmica_sdk.app`, for sellers: `AppClient(api_key)` with `resource()`,
  `resolve_customer()` and `report_payment()`; `parse_settlement(context)`
  reads an x402 after-settle hook into what `report_payment` takes, and
  `payment_from_header()` reads an `X-PAYMENT` header. `AppListing` and
  `AppAgent` carry `assetDecimals` for pricing a route in base units.
- `to_caip2(network)` gives the CAIP-2 id from any form of a hosted
  network's name: `base-sepolia`, `BASE_SEPOLIA` or `eip155:84532`.
- `fourmica_sdk.amounts`: `parse_amount`, `to_base_units`, `format_units` and
  `resolve_token`, pinned to the same `amounts.vectors.json` as the
  TypeScript SDK.
- `ConfigBuilder.from_env()` reads `FOURMICA_*` variables, and takes a
  mapping to read instead of `os.environ`. The `4MICA_` prefix still works;
  both prefixes set to different values is a `ConfigError`.
- `NetworkInfo` carries the chain id, label, hosted facilitator, explorer and
  native symbol. `DEFAULT_NETWORK` and `resolve_network()` are exported.
- Errors: `TokenNotSupportedError`, `AmbiguousTokenError`,
  `AmountPrecisionError`, `InsufficientBalanceError`, `GasRequiredError` and
  `SpendLimitError`. `AmountZeroError`, `NoWithdrawalRequestedError` and
  `GracePeriodNotElapsedError` are now exported from the package root.

### Changed

- The SDK no longer sets `SSL_CERT_FILE` and `REQUESTS_CA_BUNDLE` in the
  process environment. The chain provider gets certifi's bundle directly.
- `FacilitatorRejectedError(code, message, *, retryable=, transaction=,
  details=)` and `RpcProxy.update_user_suspension(user, *, suspended=)` take
  their flags by keyword.
- `FourMica.settle()` reports SDK errors per position as before, and the
  deposit wait keeps polling through them; any other exception now
  propagates instead of being recorded as a failure or retried until the
  timeout.
- `aiohttp` and `eth-keys`, imported directly, are declared dependencies;
  `typing-extensions`, unused, is not.
- **`ConfigBuilder.network()` also selects the network's hosted
  facilitator**, where one exists. A `Client` built with
  `.network("base-sepolia")` and no `.facilitator_url(...)` used to
  self-fund every operation; its unpinned `send()` now takes the gasless
  route first. `.facilitator_url(...)` still wins, and `.rpc_url(...)`
  clears the default.
- **Core's token list is read strictly.** `SupportedTokenInfo.decimals` is
  an `int`, no longer `Optional`, and a token missing `symbol` or `decimals`
  raises `InvalidParamsError` instead of defaulting. Core always sends both.
- An environment variable set to the empty string now counts as unset.
- `Client.ctx` and `Client.rpc` are public, as in the TypeScript SDK.
- `X402Flow`'s own HTTP client allows 30 seconds, and `FourMica.fetch`'s
  allows five minutes for the answer, in place of httpx's 5-second default.

### Fixed

- Integers above `2**256 - 1`, negative ones and `True`/`False` are refused
  wherever a u256 is read, including deposit and withdrawal amounts, where
  a negative amount is now an `InvalidParamsError` rather than
  `AmountZeroError`.
- Validation params that are not hex raise `ValidationError`, so an x402
  offer carrying them is refused as an `X402Error` instead of escaping as a
  bare `ValueError`.
- `examples/payer_quickstart.py` and `examples/recipient_quickstart.py` used
  the 1.x API and failed on import; they use `new_payment`, `sign_request`
  and `issue_guarantee`.
- **An x402 v2 payment echoes `extra` as the seller advertised it.** An
  advertised `extra: {}` was dropped from `accepted`, which the upstream
  TypeScript seller middleware refuses as "No matching payment
  requirements". `PaymentRequirementsV2.to_payload()` now keeps it.
- **Payer signatures are sent in the form core and the facilitator
  accept**: `v` of 27 or 28 and a low `s`. A remote signer answering with
  `v` of 0 or 1 had every payment refused.
- **A sponsored request the facilitator already broadcast is never resent
  self-funded.** `settlement_pending`, `invalid_transaction_state` and
  `duplicate_in_flight` used to trigger the self-funded fallback on
  withdrawals, claims and payments. `FacilitatorRejectedError` now carries
  the facilitator's `transaction` and `details`.
- A connect timeout to the facilitator is "never sent", not "outcome
  unknown", so the self-funded fallback applies.
- A facilitator that sponsors no gas is reported in its own words instead of
  "no facilitator configured".
- `rpc.health()` returns an unhealthy core's report instead of retrying and
  raising on its 503.
- Self-funded transactions are sent one at a time, so two started together
  no longer share a nonce.
- `deposit.of()` and `withdraw.request()` refuse a float amount instead of
  truncating it, and a bool instead of reading `True` as one base unit.
- A 65-byte signature from a remote signer that cannot be one (`r` or `s`
  outside the curve order, or `v` other than 0, 1, 27 or 28) raises
  `SigningError`. An `s` above the order used to escape as `OverflowError`.
- A `wallet_private_key` and an `evm_signer` for two different accounts are
  refused at connect: payments were signed by one and transactions sent by
  the other.
- `repr(Config)` no longer shows the private key or bearer token.
- **A transaction the wallet sent itself whose fate is unknown is no longer
  reported as failed.** A broadcast that got no usable answer (a timeout, a
  dropped connection, a 5xx or 408, a JSON-RPC internal error), or a receipt
  that did not come in time, raises `TransactionOutcomeUnknownError` with
  its `stage` and, once the node accepted it, its `tx_hash`. It used to be a
  `ContractError`, which invited a retry that could send it twice. It
  extends `OutcomeUnknownError`, so one `except` covers sponsored and
  self-sent transactions alike. An approval whose outcome is unknown is no
  longer reset to zero and sent again.

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
  their reason verbatim; `permit2_allowance_required` surfaces as
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
