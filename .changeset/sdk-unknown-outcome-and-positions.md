---
"@4mica/sdk": minor
---

**A transaction the wallet sends itself is no longer reported as failed when
its outcome is unknown.** Until now a deposit, withdrawal, approval, cycle
payment or claim whose broadcast got no answer from the chain's node came
back as a `ContractError` ("deposit failed: the request took too long"), and
one whose receipt did not arrive in time as a raw viem error. Both read as
"nothing happened", and running the call again could send it twice.

They now throw `TransactionOutcomeUnknownError`, which extends
`OutcomeUnknownError`, so one `instanceof OutcomeUnknownError` check covers a
sponsored action and a self-funded one:

- `stage: "broadcast"`: handed to the node, and no usable answer came back (a
  timeout, a dropped connection, a gateway's 5xx, an HTTP 408, a JSON-RPC
  internal error). There is no hash.
- `stage: "receipt"`: accepted by the node, as `txHash`, and its receipt was
  not seen in time.

A refusal is still a `ContractError`: any other JSON-RPC error from the node,
any other HTTP 4xx, or a failure before the broadcast means nothing was sent.
`approveErc20` no longer follows an approval that may be out with a reset and
a second approval.

**A cycle payment or claim that would revert is no longer sent.** Both carry
a fixed gas limit, so nothing estimated them, and a claim on a cycle that was
not funded yet was mined as a revert at the wallet's expense. The wallet's
own `payNetDebit` and `claimNetCreditFor` are now run against the chain
first, and a revert comes back as its typed `ContractError` with nothing
sent.

If you matched these cases as `ContractError`, or by viem's
`WaitForTransactionReceiptTimeoutError`, match `OutcomeUnknownError` instead.

**Positions and settling.** Core now lists what a wallet can still settle
(4mica-core #185), so a cycle id no longer has to be known in advance:

- `client.positions()` lists what the wallet still owes and is still owed:
  one entry per asset and settlement cycle, with the amount and both
  deadlines.
- `client.settle()` pays every open debit and claims every open credit, and
  returns one result per position (`"settled"`, `"skipped"`, `"failed"` or
  `"unknown"`). One that fails does not stop the others. `{ only: "pay" }` or
  `{ only: "claim" }` settles one side. A debit the wallet pays with its own
  transaction is approved first when the ClearingHouse may not pull the token
  yet, as a deposit is.
- On the low-level `Client`: `settlement.positions()`, and
  `payment.listIssued(cycleId, { limit, after })` for the guarantees the
  wallet issued in a cycle, a page at a time.
- On `RpcProxy`: `listParticipantPositions` and `listPayerGuarantees`, with
  the models `ClearingPosition`, `PayerGuaranteesPage`, `PayerGuaranteeInfo`
  and `GuaranteeStatus`.

These need a core that serves the two routes; an older one answers 404.
