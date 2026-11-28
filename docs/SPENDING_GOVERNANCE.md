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
| Rust SDK | payer process | no | yes, when the seller reports |
| Direct Core / protocol integrations (custom code, CLI `cycles pay`) | payer key holder | no | yes, when the seller reports |
| Payments the seller never reports to 4mica | — | no | no (invisible to 4mica) |

A wallet linked to an organization is evidence of control (SIWE), not custody. Anyone holding the private key can sign outside every path above.

## What "governed" means per field

An authorization is bound to the payer, recipient, network, asset and amount it was granted for, and to the project, environment and API key (or service account) that requested it. Reconciliation only consumes it for a reported payment with the same `reqId`, payer, recipient, network and asset and an amount no larger than the authorized amount; the authorization is then cut down to the paid amount so the remainder is released. A mismatch never consumes it and raises an `UNAUTHORIZED_SPEND` alert.

## What hard enforcement would require

Hard enforcement is possible only at a boundary every payment must cross:

- **Core, at guarantee issue time.** Core would consult the payer organization's policy (or a signed authorization from `apps/be`) and refuse to issue a guarantee without one. This needs a Core change and a decision on which payer wallets are "governed".
- **4mica's hosted facilitator, before `issuer.issue`.** Covers only sellers who settle through it; sellers using their own facilitator would bypass it.

Until one of these exists, governed wallets should be treated as monitored, and customers who need hard limits should keep custody-level controls (separate wallets with limited collateral per agent).
