---
"@4mica/sdk": minor
---

Financial governance. `AppClient` gains `authorizeSpend`,
`getSpendAuthorization`, `consumeSpendAuthorization`,
`releaseSpendAuthorization`, `createApproval` and `getApproval`, and
`resolveCustomer` accepts `approvalRequestId`.

`FourMica.connect({ governance: { apiKey } })` checks every payment
`client.fetch` makes against the organization's spending policies before
signing it: a denied payment throws `SpendAuthorizationError`, one above an
approval threshold waits for a decision, and the authorization is consumed or
released once the paid request ends. It is a cooperative check; without
`governance` nothing changes.
