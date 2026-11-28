---
"@4mica/sdk": minor
---

Governed `client.fetch` no longer swallows a failed consume or release of the
spend authorization. Network errors, 5xx and 429 answers are retried up to
three attempts with jittered backoff, stopping when the request's signal
aborts; other 4xx answers are not retried. What is left is reported through
the new `governance.onAccountingError` callback as a `SpendAccountingError`,
and `governanceOutcome(response)` returns the authorization id and whether its
accounting was `"recorded"`, `"pending"` or `"failed"`. The paid response is
always returned unchanged.
