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

An authorization is bound to the payer, recipient, network, asset and amount it was granted for, and to the project, environment and API key (or service account) that requested it.

## Payment matching

One rule, in `apps/be/src/controllers/spend/matching.ts`, decides whether a reported payment settles an authorization: same `reqId`, network, asset, payer and recipient, an amount no larger than the authorized amount, a payment that is not FAILED, and an authorization not already settled by a different payment. Receipt verification happens before a payment is stored: when core is configured, `POST /v1/payments` refuses a non-FAILED report whose guarantee receipt does not verify, so the payment table holds no unverified non-failed rows and records no separate verification flag. `paymentMismatch()` is the TypeScript form and `paymentMatchSql()` the SQL form; an integration test runs a table of authorization/payment pairs through both, and through usage, reconciliation and every finance view, against real PostgreSQL and requires them to agree.

The association is persisted only by `linkPayment()`, which sets `paymentId`, `settledAmount` and `matchedAt` together (a check constraint requires all three or none) and only while `paymentId` is null; a trigger refuses any later change. Consuming an authorization links a payment reported earlier, and reconciling a payment links an authorization consumed earlier, both through that function, so the order of the two events does not matter. A mismatch never links and, for an organization with an enforcing policy, raises an `UNAUTHORIZED_SPEND` alert.

Everything downstream reads the persisted association rather than re-matching on `reqId`:

- Finance reconciliation counts a sent payment as matched only if an authorization of the organization has its `paymentId`; usage attribution by project, agent or key comes from that authorization alone. A payment that only shares a `reqId` with an authorization is unmatched.
- A project-limited viewer does not see a sent payment that settled an authorization in a project they cannot access, nor an unmatched one that claims the payment identity (`reqId`, network, asset and payer) of such an authorization, since that would disclose the restricted project's activity. Every other unmatched payment stays visible.
- Spend limits count a reported payment unless a counted authorization covers it: it matches under the same rule, or it already settled another report of the same payment identity (two sellers reporting one payment are counted once). `coversPayment()` and `coversPaymentSql()` are the twins for this and are part of the differential test. Payments are counted once per identity (payer and `reqId`, within the network and asset being checked).

Consumption, release, reconciliation and unmatched reconciliation are mandatory audit events (`spend.consumed`, `spend.released`, `spend.reconciled`, `spend.reconciliation_unmatched`), written in the transaction that makes the change.

Migration `20261202123000_verify_spend_payment_links` re-checked every association stored before the rule existed: links that satisfy it keep their payment and are settled at its amount; the others, including links the old consume path made on `reqId` and payer alone, are cleared. No authorization or payment row is deleted.

## Authorized, settled and committed amounts

An authorization carries three amounts:

- `authorizedAmount` is what was granted. It is written once, when the authorization is created, and a trigger refuses any later change.
- `settledAmount` is what the reported payment that consumed it actually paid. It is written once, when reconciliation links the payment, and is null until then.
- `amount` is what currently counts against budgets: the authorized amount until a payment settles it, then the settled amount. Partial settlement therefore releases the remainder without losing what was granted.

Rows created before migration `20261202121000_preserve_spend_authorized_amount` were backfilled without inventing history: `authorizedAmount` is the stored `amount` only where reconciliation never cut it (no linked payment, not consumed, or a linked payment whose amount differs from it), otherwise the amount recorded in the payment's approval request, otherwise null. `settledAmount` is backfilled only where the linked payment's amount equals the stored amount.

## Durable reconciliation

Reconciliation work is recorded on the payment itself, so it cannot be lost between storing a payment and reconciling it: a new payment is stored with `reconciliation_state = PENDING`, and a report that changes its status sets it back to PENDING in the same update. `POST /v1/payments` reconciles inline right after storing; the transaction that links or flags the payment for every organization owning the payer wallet also sets the payment RECONCILED, and it first locks the payment row, so a payment reconciled by one caller is skipped by any other. When that transaction fails, the attempt is counted, the error kept in `reconcile_error`, and the next attempt scheduled with exponential backoff (30 seconds doubling, at most an hour); after 8 failed attempts the payment becomes UNRESOLVED, a dead letter that is no longer retried until a new report changes its status.

The retries are run by the `payment-reconciliation` BullMQ job (`apps/be/src/jobs/reconciliation`), which sweeps every minute for PENDING payments whose next attempt is due, including any whose inline attempt never ran because the process stopped after storing them. It needs `VALKEY_URL`; without it a failed reconciliation waits for the next report of that payment. Each sweep logs a `payment_reconciliation_backlog` metric line (pending and unresolved counts and the age of the oldest of each, at warn level while anything is unresolved), and `GET /me/finance/reconciliation` returns the organization's own `backlog`.

Migration `20261202124000_durable_payment_reconciliation` marks FAILED payments and payments older than seven days as reconciled and leaves the last seven days PENDING, so the first sweep re-checks recent payments; reconciliation is idempotent, alerts are deduplicated per payment, and an association is never written twice.

## Who asked

An authorization records, when it is created, the key that asked for it (`issuedByKeyId`, a plain id with no foreign key, and `issuedByKeyPrefix`) and the key's service account (`serviceAccountId`). `apiKeyId` still points at the live key and becomes null when that key is deleted; the issuer fields do not. Only the issuer can read, consume or release an authorization: any key of the same service account (so rotation and deleting the old key do not strand a reservation), otherwise the issuing key itself, and in both cases only from the same project, environment and, for agent keys, agent. Migration `20261202122000_record_spend_authorization_issuer` backfilled the issuer from the key where it still existed, otherwise from the approval request or the audit trail; rows with no surviving evidence keep a null issuer.

## Payment identity and `reqId` uniqueness

A payment is identified by its organization, network, asset (or the native currency) and `reqId`. At most one authorization per identity may be RESERVED, PENDING_APPROVAL or CONSUMED; DENIED, RELEASED and EXPIRED ones give the `reqId` back, so a payer may retry under the same `reqId` after a release. The rule is a partial unique index on `spend_authorizations` (`spend_authorizations_live_req_id_key`), and authorizing and consuming both take the same per-organization, network and asset advisory lock before checking it, so a lost race is answered with 409 `req_id_in_use` rather than a database error. The same `reqId` on another network or asset is a different payment.

Rows that held a duplicate before the index existed were resolved by migration `20261202120000_enforce_spend_req_id_uniqueness`: in each identity the earliest CONSUMED authorization (or, failing that, the earliest live one) keeps the `reqId`; every other one is marked `req_id_conflict = 'duplicate_req_id'`, and the live ones among them are RELEASED (cancelling a pending approval). Consumed duplicates stay CONSUMED, so recorded spend is unchanged, and nothing is deleted.

## What hard enforcement would require

Hard enforcement is possible only at a boundary every payment must cross:

- **Core, at guarantee issue time.** Core would consult the payer organization's policy (or a signed authorization from `apps/be`) and refuse to issue a guarantee without one. This needs a Core change and a decision on which payer wallets are "governed".
- **4mica's hosted facilitator, before `issuer.issue`.** Covers only sellers who settle through it; sellers using their own facilitator would bypass it.

Until one of these exists, governed wallets should be treated as monitored, and customers who need hard limits should keep custody-level controls (separate wallets with limited collateral per agent).
