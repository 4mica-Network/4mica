---
"@4mica/x402": major
---

Facilitator refusals reach the payer, and the client recovers from the ones it
can fix.

- Express: the middlewares wrap `@x402/express` instead of a copy of it. A
  refused settlement now answers `402` with the facilitator's response in
  `PAYMENT-RESPONSE` (`errorReason`, `errorMessage`, `extra.retryable`,
  `extra.details`) rather than a `{ error, details }` body, and routes are
  matched on the decoded path as well, so an encoded path separator no longer
  skips payment. `ExpressAdapter` and `setSettlementOverrides` are re-exported
  from `@x402/express`.
- Client: `FourMicaEvmScheme` checkpoints when core asks for one, relearns the
  active cycle and core's clock after a cycle or timestamp refusal, and waits
  out a checkpoint cutoff, then has x402 retry the request once.
- Built on `@x402/core` and `@x402/express` 2.28.
