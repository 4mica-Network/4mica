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

- `stage: "broadcast"`: handed to the node, and its answer never came (a
  timeout, a dropped connection, a gateway's 5xx). There is no hash.
- `stage: "receipt"`: accepted by the node, as `txHash`, and its receipt was
  not seen in time.

A refusal is still a `ContractError`: a JSON-RPC error from the node, an HTTP
4xx, or a failure before the broadcast means nothing was sent.
`approveErc20` no longer follows an approval that may be out with a reset and
a second approval.

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
  `{ only: "claim" }` settles one side.
- On the low-level `Client`: `settlement.positions()`, and
  `payment.listIssued(cycleId, { limit, after })` for the guarantees the
  wallet issued in a cycle, a page at a time.
- On `RpcProxy`: `listParticipantPositions` and `listPayerGuarantees`, with
  the models `ClearingPosition`, `PayerGuaranteesPage`, `PayerGuaranteeInfo`
  and `GuaranteeStatus`.

These need a core that serves the two routes; an older one answers 404.
