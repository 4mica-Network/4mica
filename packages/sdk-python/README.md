# 4Mica Python SDK (`sdk-4mica`)

Python client for the 4Mica credit layer: sign and issue payment guarantees,
verify the operator's guarantee receipts, checkpoint what a payer owes,
settle clearing cycles, and manage collateral.

This is the 2.0 line, built for the **settlement-cycle** protocol with
checkpointed guarantees, and targets core 2.0.0-alpha.4. The 1.x tab model no
longer exists on the server — see [Migrating from 1.x](#migrating-from-1x).

```bash
pip install --pre sdk-4mica          # 2.0 is in pre-release
pip install --pre "sdk-4mica[cdp]"   # with the Coinbase CDP wallet backend
```

Requires Python 3.10+.

## Connecting

```python
import asyncio
from fourmica_sdk import Client, ConfigBuilder


async def main():
    cfg = (
        ConfigBuilder()
        .network("base-sepolia")  # or .rpc_url("https://...")
        .wallet_private_key("0x...")
        .build()
    )
    async with await Client.connect(cfg) as client:
        print("signing as", client.signer_address)


asyncio.run(main())
```

`Client.connect` fetches core's public parameters (the Treasury, ClearingHouse
and GuaranteeRegistry addresses and the operator's receipt-signing address),
which is why construction is async and fallible. A core that cannot read the
payment payload version this SDK signs is refused at connect.
An Ethereum RPC endpoint is only needed for paths that read chain state or
send transactions; signing-only clients never touch the chain.

Configuration can also come from the environment via
`ConfigBuilder().from_env()`: `4MICA_NETWORK` / `4MICA_RPC_URL`,
`4MICA_WALLET_PRIVATE_KEY`, `4MICA_ETHEREUM_HTTP_RPC_URL`,
`4MICA_CONTRACT_ADDRESS`, `4MICA_FACILITATOR_URL`, `4MICA_BEARER_TOKEN`,
`4MICA_AUTH_URL`, `4MICA_AUTH_REFRESH_MARGIN_SECS`.

SIWE auth is on by default (the SDK signs in with your wallet and refreshes
tokens automatically); a `bearer_token` replaces it.

## The client

Each field is an intent-builder client: an entry captures what to do, a route
pin narrows how, and a terminal does it.

| Sub-client | What it does |
|---|---|
| `client.payment` | Sign, issue and verify payment guarantees |
| `client.settlement` | Pay a net debit / claim a net credit for a clearing cycle |
| `client.deposit` | Deposit collateral |
| `client.withdraw` | Request, cancel, finalize withdrawals |
| `client.account` | Read balances and positions |
| `client.tokens` | Supported-token metadata, ERC-20 approvals |

### Payment guarantees

The payer signs a payment; the recipient redeems it for the operator's
guarantee receipt and verifies it locally:

```python
# payer side
payload = await payer.payment.new_payment(
    "0xRecipient...",
    1_000_000,
    "0xToken...",  # omit the asset for native ETH
)
request = await payer.payment.sign_request(payload)

# recipient side
receipt = await recipient.payment.issue_guarantee(request)
guarantee = recipient.payment.verify_guarantee(receipt)
print("guaranteed", guarantee.amount, "in cycle", hex(guarantee.cycle_id))
```

`new_payment` scopes the payment to the asset's **active settlement cycle**,
which it reads from core and reuses until the cycle's period ends or core
refuses a payment signed against it. It stamps the payment by core's clock as
core last reported it, not this machine's, and draws a random `req_id` and a
random `salt`.

The payer signs an EIP-712 `PaymentAuthorization` under the ClearingHouse
domain (`4micaClearingHouse`). The recipient is bound into it through a salted
commitment, so the on-chain default path can verify the authorization without
learning who was paid. The operator signs the receipt under the
GuaranteeRegistry domain (`4micaGuaranteeRegistry`); `verify_guarantee` checks
that signature offline against the operator address core published. A
service that never builds a `Client` can run the same check with
`fourmica_sdk.verify_guarantee_receipt`.

A guarantee can be gated on an external validator by attaching a
`ValidationRequirement` (`payload.with_validation(...)`) before signing. The
requirement is part of the commitment the payer signs, and core holds the
guarantee until the named validator approves the subject.

#### Refusals

Core's coded refusals arrive as typed errors carrying the details needed to
act on them. All are `CoreRefusalError`s, which are both `PaymentError`s and
`RpcError`s; an uncoded refusal stays a plain `RpcError`.

| Error | Core code | What to do |
|---|---|---|
| `CheckpointRequiredError` | `CHECKPOINT_REQUIRED` | Checkpoint (below), then retry |
| `CycleMismatchError` | `CYCLE_MISMATCH` | Build and sign again; the stale cycle is already forgotten |
| `FutureTimestampError` | `FUTURE_TIMESTAMP` | Build and sign again; core's clock is already recorded |
| `StaleTimestampError` | `STALE_TIMESTAMP` | Build and sign again |
| `TimestampNotPastCutoffError` | `TIMESTAMP_NOT_PAST_CUTOFF` | Build and sign again; the next payment is stamped past the cutoff |

### Checkpoints

A payer may hold only so many guarantees that no checkpoint covers yet. At the
bound, core refuses the next one with `CHECKPOINT_REQUIRED` and the payer
signs a **checkpoint**: a running total of everything it has authorized in the
cycle, up to a timestamp cutoff.

```python
from fourmica_sdk import CheckpointRequiredError

try:
    receipt = await recipient.payment.issue_guarantee(request)
except CheckpointRequiredError as exc:
    await payer.payment.checkpoint_cycle(
        exc.details.asset_address, exc.details.cycle_id
    )
```

`payment.checkpoint_active_cycle(asset)` signs and submits a checkpoint for
the asset's active cycle, and returns `None` when there is nothing to cover.
`payment.checkpoint_cycle(asset, cycle_id)` checkpoints a named cycle instead.
Submitting a checkpoint that was already accepted succeeds and covers nothing,
so retrying is safe.

A payment can land while a checkpoint is in flight, and core then refuses the
checkpoint as stale. Both methods read the batch and sign once more; if core
refuses again, they raise `CheckpointMismatchError`.

The checkpoint total is what the payer can be charged on-chain if they
default, so it is built only from what the payer signed. Every payment in
core's batch, and the checkpoint it extends, must carry the payer's own
signature, be in this cycle and asset, be newer than the previous checkpoint,
and appear once. Otherwise nothing is signed and the call raises
`UntrustedCheckpointBatchError`.

A payment must be stamped strictly after the payer's latest checkpoint cutoff,
so a payment built right after a checkpoint may wait out the rest of the
current second.

### Settlement cycles

When a cycle closes, core nets all guarantees into one net debit or credit per
participant and commits a Merkle root on-chain. Each side then settles against
the ClearingHouse contract — terms always come from core's prepared action,
never from the caller:

```python
# debtor: approve the exact committed amount, then pay
await client.settlement.pay(cycle_id).self_funded().approve()
receipt = await client.settlement.pay(cycle_id).send()

# creditor: claim your committed net credit (or someone else's, paying them)
receipt = await client.settlement.claim(cycle_id).send()
receipt = await client.settlement.claim(cycle_id).creditor("0xThem...").send()

# inspect the prepared terms without sending anything
action = await client.settlement.pay(cycle_id).action()
```

`cycle_id` is core's text id (`"{asset}:{period_start}"`, returned as
`cycle_id_text` in clearing responses). Core resolves this path by text id
only; the 0x-prefixed on-chain id carried in payments and receipts is not
accepted here.

### Collateral

```python
from fourmica_sdk import Asset

await client.deposit.of(None, 10**18).send()  # native ETH
await client.deposit.of("0xToken...", 5_000_000).self_funded().approve()
await client.deposit.of("0xToken...", 5_000_000).send()

await client.withdraw.request("0xToken...", 1_000_000).send()
await client.withdraw.finalize("0xToken...").send()  # after the grace period

positions = await client.account.assets()
balance = await client.account.asset_balance("0xToken...")
```

### Gasless routes

With a facilitator configured (`.facilitator_url(...)` or
`4MICA_FACILITATOR_URL`), token-moving operations can run without the signer
paying gas: the payer signs an authorization and the facilitator submits it.
Unpinned `send()` prefers gasless and falls back to self-funding when nothing
will sponsor it; a pin makes the route explicit:

```python
await (
    client.deposit.of("0xToken...", 5_000_000).gasless().send()
)  # EIP-3009, then Permit2
await client.withdraw.request(None, 10**17).gasless().send()  # works for ETH too
await client.settlement.pay(cycle_id).permit2().sponsor_approval().send()
await client.settlement.claim(cycle_id).gasless().send()  # nothing to sign at all

auth = (
    await client.deposit.of("0xToken...", 5_000_000).eip3009().sign()
)  # sign offline...
await (
    client.deposit.of("0xToken...", 5_000_000).eip3009().authorization(auth).send()
)  # ...redeem anywhere
```

Read the receipt's `route` to see which one actually ran. Rejections that
name the request itself (`SIGNATURE_MISMATCH`, `INSUFFICIENT_BALANCE`, …)
are surfaced, not retried — your own transaction would fail the same way —
and an `OutcomeUnknownError` means the facilitator may already have
submitted: check the chain before resending.

## x402

The SDK implements the `4mica-credit` x402 scheme, versions 1 and 2. A
payment is built with `new_payment` (so it is scoped to the live cycle and
stamped by core's clock) and the facilitator's `/settle` redeems it for the
operator's guarantee receipt.

```python
from fourmica_sdk import X402Flow, PaymentRequirementsV1

flow = X402Flow.from_client(client)
requirements = PaymentRequirementsV1.from_raw(reqs_from_402_response)

payment = await flow.sign_payment(requirements)
# retry the request with the header:  {"X-PAYMENT": payment.header}
# (v2 uses sign_payment_v2 and the PAYMENT-SIGNATURE header)

# or settle directly against a facilitator:
settled = await flow.settle_payment(payment, requirements, "https://x402.4mica.xyz")
print(settled.settlement.success, settled.settlement.receipt)
```

## Errors

Everything derives from `FourMicaError`. Contract reverts decode to typed
exceptions (`InsufficientAvailableError`, `GracePeriodNotElapsedError`, …);
missing allowances surface as `Erc20AllowanceRequiredError` *before* gas is
spent; facilitator rejections carry their `errorCode` verbatim on
`FacilitatorRejectedError`, so callers can branch on codes this SDK predates.
Core's own coded refusals carry `code` and `details` on `RpcError`, and the
payment ones arrive typed (see [Refusals](#refusals)).

## Development

This package lives in the 4mica monorepo at `packages/sdk-python` and has no
pnpm/turbo wiring — it is a plain Python project:

```bash
cd packages/sdk-python
pip install -e ".[dev,cdp]"
ruff check . && pytest -q
```

Contract ABIs under `fourmica_sdk/contract/abi/` are copies of the monorepo's
`contracts/abi/*.json`, vendored from the `4mica-core` repo's forge artifacts
by `scripts/refresh-abis.sh` at the repo root (which refreshes every SDK at
once; `scripts/refresh_abis.sh` here just forwards to it). The Python SDK
reads `treasury.json`. `contracts/abi/Core4Mica.json` is the pre-rename
contract, frozen (the script no longer refreshes it) until the TypeScript SDK
moves to the Treasury.

Wire-format parity with core, the contracts and the Rust SDK is pinned by
three fixtures in `tests/fixtures/`:

- `checkpoint_vectors.json` and `guarantee_vectors.json` are copied from
  4mica-core's `contracts/test/fixtures/`, which the ClearingHouse and
  GuaranteeRegistry Solidity suites verify. Regenerate them in core with
  `REGEN_CHECKPOINT_VECTORS=1` / `REGEN_GUARANTEE_VECTORS=1`.
- `digest_vectors.json` is the Rust SDK's serialization and digests;
  regenerate with `cargo run --example digest_vectors` in `packages/sdk-rust`.

## Migrating from 1.x

The 1.x SDK targeted the tab-based protocol, which was removed from the 4Mica
core service; most 1.x calls fail against current servers regardless of SDK
version. Headlines:

- Tabs are gone: no `create_tab` / `pay_tab` / tab queries / `remunerate`.
  Guarantees bind to settlement cycles; settlement happens via
  `client.settlement`.
- `Client.new(cfg)` → `await Client.connect(cfg)`; `client.user` /
  `client.recipient` → the capability sub-clients above.
- Claims and BLS certificates are gone. A payer builds a
  `PaymentRequestPayload` with `payment.new_payment`, scoped to the active
  cycle, and signs it under the ClearingHouse domain; the recipient gets back
  an ECDSA `GuaranteeReceipt`. 1.x signatures do not verify.
- x402: exact scheme `4mica-credit`, no `tabEndpoint`, and `/settle` takes the
  envelope object as `paymentPayload` instead of a `paymentHeader` string.

See `CHANGELOG.md` for the complete list.
