# 4Mica Python SDK (`sdk-4mica`)

Python client for the 4Mica credit layer: sign and issue payment guarantees,
verify BLS certificates, settle clearing cycles, and manage collateral.

This is the 2.0 line, built for the **settlement-cycle** protocol. The 1.x tab
model no longer exists on the server — see [Migrating from 1.x](#migrating-from-1x).

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

`Client.connect` fetches core's public parameters (operator BLS key, contract
address, guarantee domains), which is why construction is async and fallible.
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

The payer signs a request; the recipient redeems it for a BLS certificate and
verifies it locally:

```python
from fourmica_sdk import PaymentGuaranteeRequestClaims
import time, secrets

# payer side
claims = PaymentGuaranteeRequestClaims.new(
    user_address=payer.signer_address,
    recipient_address="0xRecipient...",
    req_id=int.from_bytes(secrets.token_bytes(32), "big"),
    amount=1_000_000,
    timestamp=int(time.time()),
    erc20_token="0xToken...",  # omit for native ETH
)
signature = await payer.payment.sign_request(claims)

# recipient side
cert = await recipient.payment.issue_guarantee(claims, signature)
verified = recipient.payment.verify_guarantee(cert)
print("guaranteed", verified.amount, "in cycle", verified.cycle_id)
```

`cycle_id` is assigned by core: every guarantee binds to the settlement cycle
open for its asset at issuance.

A guarantee can be gated on an external validator by attaching a
`ValidationRequirement` (`claims.with_validation(...)`) — core then holds it
until the named validator approves the subject.

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

`cycle_id` is either core's text id (`"{asset}:{period_start}"`) or the
0x-prefixed on-chain id — both appear in verified guarantee claims and
clearing responses.

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

The SDK implements the `4mica-credit` x402 scheme, versions 1 and 2. There is
no tab step: a signed claim carries a random `req_id` and the facilitator's
`/settle` turns it into a BLS certificate.

```python
from fourmica_sdk import X402Flow, PaymentRequirementsV1

flow = X402Flow.from_client(client)
requirements = PaymentRequirementsV1.from_raw(reqs_from_402_response)

payment = await flow.sign_payment(requirements, client.signer_address)
# retry the request with the header:  {"X-PAYMENT": payment.header}
# (v2 uses sign_payment_v2 and the PAYMENT-SIGNATURE header)

# or settle directly against a facilitator:
settled = await flow.settle_payment(payment, requirements, "https://x402.4mica.xyz")
print(settled.settlement.success, settled.settlement.certificate)
```

## Errors

Everything derives from `FourMicaError`. Contract reverts decode to typed
exceptions (`InsufficientAvailableError`, `GracePeriodNotElapsedError`, …);
missing allowances surface as `Erc20AllowanceRequiredError` *before* gas is
spent; facilitator rejections carry their `errorCode` verbatim on
`FacilitatorRejectedError`, so callers can branch on codes this SDK predates.

## Development

This package lives in the 4mica monorepo at `packages/sdk-python` and has no
pnpm/turbo wiring — it is a plain Python project:

```bash
cd packages/sdk-python
pip install -e ".[dev,cdp]"
ruff check . && pytest -q
```

Contract ABIs under `fourmica_sdk/contract/abi/` are vendored from the
`4mica-core` repo's forge artifacts (`scripts/refresh_abis.sh`). Wire-format
parity with the Rust SDK and the contracts is pinned by two fixtures:
`tests/fixtures/guarantee_vectors.json` (shared with the Rust and Solidity
suites) and `tests/fixtures/digest_vectors.json` (regenerate with
`cargo run --example digest_vectors` in `packages/sdk-rust`).

## Migrating from 1.x

The 1.x SDK targeted the tab-based protocol, which was removed from the 4Mica
core service; most 1.x calls fail against current servers regardless of SDK
version. Headlines:

- Tabs are gone: no `create_tab` / `pay_tab` / tab queries / `remunerate`.
  Guarantees bind to settlement cycles; settlement happens via
  `client.settlement`.
- `Client.new(cfg)` → `await Client.connect(cfg)`; `client.user` /
  `client.recipient` → the capability sub-clients above.
- Claims lost `tab_id` and `total_amount`, gained a server-assigned
  `cycle_id`; request signing changed (the EIP-712 domain now names the
  verifying contract), so 1.x signatures do not verify.
- x402: exact scheme `4mica-credit`, no `tabEndpoint`, and `/settle` takes the
  envelope object as `paymentPayload` instead of a `paymentHeader` string.

See `CHANGELOG.md` for the complete list.
