# Spending governance: enforcement boundary

Status: accepted for the multi-tenancy release. Owner: platform.

## Decision

Spending policies, budgets and payment approvals are **advisory, cooperatively enforced controls**. 4mica does not guarantee that a payment which violates a policy cannot happen. It guarantees that:

1. a client that uses the governed payment path asks before it signs, and is refused or held for approval when a policy says so;
2. every payment a seller reports to 4mica is reconciled against those decisions, and anything spent without a matching authorization is counted against the limits and raises an `UNAUTHORIZED_SPEND` alert;
3. product copy, documentation and the API never describe these controls as a hard block.

## Why

4mica's backend (`apps/be`) is not in the payment path. A payer signs a payment request locally with its own key, the seller redeems it through a facilitator, and 4mica Core issues the guarantee. `apps/be` learns of a payment only when the seller reports it to `POST /v1/payments`. Core (outside this repository) is the only 4mica-operated service that sees every payment before it exists.

## Payment paths and their coverage

| Path | Who signs | Checks a 4mica policy before signing | Reconciled after the fact |
|---|---|---|---|
| TypeScript SDK `payingFetch` with `governance` configured | payer process | yes (`POST /v1/spend/authorize`) | yes, by `reqId` |
| TypeScript SDK without `governance`, older TypeScript SDK versions | payer process | no | yes, when the seller reports |
| Python SDK `FourMica.fetch` with `governance` configured | payer process | yes (`POST /v1/spend/authorize`) | yes, by `reqId` |
| Python SDK without `governance`, older Python SDK versions | payer process | no | yes, when the seller reports |
| Rust SDK, integrator calls `AppClient::authorize_spend` before signing (no paying client to do it) | payer process | yes, only where the integrator calls it | yes, by `reqId` |
| Rust SDK without those explicit calls | payer process | no | yes, when the seller reports |
| Direct Core / protocol integrations (custom code, CLI `cycles pay`) | payer key holder | no | yes, when the seller reports |
| Payments the seller never reports to 4mica | — | no | no (invisible to 4mica) |

A wallet linked to an organization is evidence of control (SIWE), not custody. Anyone holding the private key can sign outside every path above.

## What "governed" means per field

An authorization is bound to the payer, recipient, network, asset and amount it was granted for, and to the project, environment and API key (or service account) that requested it. Reconciliation only consumes it for a reported payment with the same `reqId`, payer, recipient, network and asset and an amount no larger than the authorized amount; the authorization is then cut down to the paid amount so the remainder is released. A mismatch never consumes it and raises an `UNAUTHORIZED_SPEND` alert.

## Authorized, settled and committed amounts

An authorization carries three amounts:

- `authorizedAmount` is what was granted. It is written once, when the authorization is created, and a trigger refuses any later change.
- `settledAmount` is what the reported payment that consumed it actually paid. It is written once, when reconciliation links the payment, and is null until then.
- `amount` is what currently counts against budgets: the authorized amount until a payment settles it, then the settled amount. Partial settlement therefore releases the remainder without losing what was granted.

Rows created before migration `20261202121000_preserve_spend_authorized_amount` were backfilled without inventing history: `authorizedAmount` is the stored `amount` only where reconciliation never cut it (no linked payment, not consumed, or a linked payment whose amount differs from it), otherwise the amount recorded in the payment's approval request, otherwise null. `settledAmount` is backfilled only where the linked payment's amount equals the stored amount.

## Payment identity and `reqId` uniqueness

A payment is identified by its organization, network, asset (or the native currency) and `reqId`. At most one authorization per identity may be RESERVED, PENDING_APPROVAL or CONSUMED; DENIED, RELEASED and EXPIRED ones give the `reqId` back, so a payer may retry under the same `reqId` after a release. The rule is a partial unique index on `spend_authorizations` (`spend_authorizations_live_req_id_key`), and authorizing and consuming both take the same per-organization, network and asset advisory lock before checking it, so a lost race is answered with 409 `req_id_in_use` rather than a database error. The same `reqId` on another network or asset is a different payment.

Rows that held a duplicate before the index existed were resolved by migration `20261202120000_enforce_spend_req_id_uniqueness`: in each identity the earliest CONSUMED authorization (or, failing that, the earliest live one) keeps the `reqId`; every other one is marked `req_id_conflict = 'duplicate_req_id'`, and the live ones among them are RELEASED (cancelling a pending approval). Consumed duplicates stay CONSUMED, so recorded spend is unchanged, and nothing is deleted.

## What hard enforcement would require

Hard enforcement is possible only at a boundary every payment must cross:

- **Core, at guarantee issue time.** Core would consult the payer organization's policy (or a signed authorization from `apps/be`) and refuse to issue a guarantee without one. This needs a Core change and a decision on which payer wallets are "governed".
- **4mica's hosted facilitator, before `issuer.issue`.** Covers only sellers who settle through it; sellers using their own facilitator would bypass it.

Until one of these exists, governed wallets should be treated as monitored, and customers who need hard limits should keep custody-level controls (separate wallets with limited collateral per agent).
