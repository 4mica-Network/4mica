---
"@4mica/sdk": major
---

Checkpointed guarantees (core 2.0.0-alpha.4), matching the Rust and Python
SDKs.

- Payers build a `PaymentRequestPayload` with `client.payment.newPayment`,
  scoped to the asset's active settlement cycle (read from core and cached
  until its period ends or core refuses it) and stamped by core's clock. It
  is signed as an EIP-712 `PaymentAuthorization` under the
  `4micaClearingHouse` domain, with the recipient and any
  `ValidationRequirement` bound through a salted recipient commitment.
  `PayerSigner` signs it as typed data, so JSON-RPC and browser wallets work.
- `issueGuarantee(request)` returns a `GuaranteeReceipt` — the `GuaranteeV1`
  bytes the GuaranteeRegistry verifies, signed by the operator with ECDSA
  under the `4micaGuaranteeRegistry` domain. `verifyGuarantee(receipt)` checks
  it offline and returns the `Guarantee`; `verifyGuaranteeReceipt` does the
  same without a client.
- Checkpoints: `checkpointActiveCycle(asset)` and `checkpointCycle(asset,
  cycleId)` sign and submit the checkpoint covering a payer's outstanding
  payments, retrying once when a payment lands mid-checkpoint. Core's batch
  is checked first; nothing is signed over a payment the payer did not sign,
  a forged previous checkpoint, a payment already covered or counted twice,
  or another cycle or asset (`UntrustedCheckpointBatchError`). Also
  `activeCycle`, `checkpointBatch`, `checkpointBatchForCycle`,
  `submitCheckpoint`, and the matching `RpcProxy` calls.
- Core's coded refusals arrive typed with their details:
  `CheckpointRequiredError`, `CheckpointMismatchError`, `CycleMismatchError`,
  `FutureTimestampError`, `StaleTimestampError`,
  `TimestampNotPastCutoffError`, all `CoreRefusalError`s extending `RpcError`.
  `RpcError` carries `code` and `details`.
- Breaking: BLS certificates, EIP-191 signing and guarantee versions are gone —
  `BLSCert`, `PaymentGuaranteeRequestClaims`, `PaymentGuaranteeClaims`,
  `SigningScheme`, `PaymentSignature`, `PaymentSigner`,
  `encodeGuaranteeClaims`/`decodeGuaranteeClaims`, the claims typed-data
  helpers, `GUARANTEE_CLAIMS_VERSION`, and the BLS error classes.
  `CorePublicParameters` swapped `publicKey` and the guarantee-domain fields
  for `guaranteeSigner`, `guaranteeRegistryAddress`, `clearingHouseAddress`
  and `supportedPaymentPayloadVersions`; connecting reads nothing from the
  chain. The `@noble/curves` dependency is dropped.
- Breaking (x402): `X402Flow.signPayment(requirements)` and
  `signPaymentV2(paymentRequired, accepted)` no longer take a user address;
  `FlowSigner` is `newPayment` + `signPayment`. The envelope's payload is
  `{ payload: { version: "v1", ... }, signature }`; `X402SignedPayment` gains
  `request` and loses `signature`; `SettlementReceipt.certificate` became
  `receipt`.
- Breaking (facilitator): responses follow x402 (needs a facilitator with
  #113). `FacilitatorRejectedError.code` is the facilitator's snake_case
  reason (`invalid_signature`, `rate_limited`, `permit2_allowance_required`,
  …) instead of a SCREAMING_CASE code, and `retryable` and the EIP-2612 nonce
  are read from `extra`; the exported `NAMES_THE_*` sets and
  `rejectionError(payload, reason, message)` follow. `SettlementReceipt`
  reads the receipt from `extra.receipt`, renames `txHash` to `transaction`
  and `networkId` to `network`, splits `error` into `errorReason` and
  `errorMessage`, and adds `payer`, `retryable` and `details`.
- Breaking (server): the paywall's guarantee is `{ receipt, signature, raw }`
  instead of `{ claims, signature, raw }`, and `paymentFromHeader` reads the
  new envelope. When reporting a payment, send `guarantee.receipt` as
  `guaranteeClaims` and `guarantee.signature` as `guaranteeSignature`.
- Breaking (contracts): `core4micaAbi` is replaced by `treasuryAbi`.
  `StablecoinPosition` reports `userShares`, `totalUserShares`,
  `protocolShares`, `poolShares`, `poolAssets` and `strategy`;
  `StablecoinWithdrawShortfallError` and `AaveNotConfiguredError` became
  `InsufficientLiquidityError`, joined by `PoolInsolventError`,
  `DepositsDisabledError`, `StablecoinDepositsDisabledError` and
  `PausedError`; `EscrowScaledUnderflowError` is `EscrowUnderflowError`.
