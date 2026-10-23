---
"@4mica/x402": major
---

Built on `@4mica/sdk`'s checkpointed guarantees (core 2.0.0-alpha.4).

- Client: every payment carries the asset's active settlement cycle, which only
  core knows, so `FourMicaEvmScheme` always signs through a core: the seller's
  `extra.rpcUrl`, then `coreUrls`, then the hosted deployment. The path that
  signed locally from an EIP-712 domain in `extra` is removed. The x402
  `payload` is now `{ payload: { version: "v1", ... }, signature }`.
- Server: requirements no longer carry `extra.name`, `extra.version` and
  `extra.verifyingContract`; a payer reads core's ClearingHouse domain from the
  core it signs against. `enhancePaymentRequirements` returns the requirements
  unchanged and makes no call to core. The `FourMicaDomainExtra` type is gone.
- The settle response's BLS certificate is replaced by core's guarantee
  receipt: `FourMicaSettleResponse.certificate` (`CertificateResponse`,
  `{ claims, signature }`) becomes `receipt` (`GuaranteeReceiptResponse`,
  `{ receipt, signature }`), lifted from the facilitator's `extra.receipt`.
  Verify it with `@4mica/sdk`'s `client.payment.verifyGuarantee`.
- `FourMicaFacilitatorClient.settle` delegates to `@x402/core`'s client, which
  parses the facilitator's x402-shaped response as is, and throws x402's
  `SettleError` (carrying `errorReason` and `errorMessage`) on a refusal. The
  `txHash`, `networkId` and `error` aliases on `FourMicaSettleResponse` are
  gone; read `transaction`, `network` and `errorReason`.
