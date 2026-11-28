---
"@4mica/sdk": minor
---

Governed `client.fetch` only releases a spend authorization when the payment
was definitively not taken: signing failed before anything was sent, or the
seller answered the signed request with a 402. A seller error, a timeout, a
network failure or an aborted request after the payment was sent is an unknown
outcome, so the authorization is consumed with the payment's `reqId` and the
amount stays counted toward the session's `total`.
