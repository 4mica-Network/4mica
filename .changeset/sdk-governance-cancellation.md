---
"@4mica/sdk": minor
---

Governed `client.fetch` now honours the request's `signal` and absolute
deadlines through spend authorization. Before the payment is sent, aborting
stops the `authorize` request, the wait between approval polls and a poll
request at once, releases any pending approval or granted reservation, and
rejects with the signal's reason. `approvalTimeoutMs` now starts before the
first `authorize` request and also cuts short a poll request that would outlast
it. Every 4mica API call is bounded by the new `requestTimeoutMs` option
(default 10 s).

After the payment is sent, the consume (or the release after a 402) no longer
follows the request's `signal`: it runs to completion under the new
`accountingTimeoutMs` option (default 30 s for all attempts together), because
the seller may still redeem the payment. `accounting: "pending"` now means that
deadline passed, rather than that the request was aborted mid-retry.

`AppClient`'s `authorizeSpend`, `getSpendAuthorization`,
`consumeSpendAuthorization` and `releaseSpendAuthorization` accept an optional
last `{ signal }` argument.
