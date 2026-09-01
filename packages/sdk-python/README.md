# 4Mica Python SDK

The official Python SDK for interacting with the 4Mica payment network.

## Overview

This SDK provides:

- **User Client**: deposit collateral, sign payments, and manage withdrawals in ETH or ERC20 tokens
- **Recipient Client**: create payment tabs, verify payment guarantees, and claim from user collateral
- **X402 Flow Helper**: generate X-PAYMENT headers for 402-protected HTTP resources via an X402-compatible service
- **Admin RPCs**: manage user suspension and admin API keys (when authorized)

## Installation

```bash
pip install sdk-4mica
```

Latest major release:

```bash
pip install "sdk-4mica>=1.0.0"
```

Install BLS support for on-chain remuneration:

```bash
pip install 'sdk-4mica[bls]'
```

Python 3.9+ is required.

## Networks

| Shorthand          | CAIP-2            | Core API URL                              |
| ------------------ | ----------------- | ----------------------------------------- |
| `base`             | `eip155:8453`     | `https://base.api.4mica.xyz/`             |
| `ethereum-sepolia` | `eip155:11155111` | `https://ethereum.sepolia.api.4mica.xyz/` |
| `base-sepolia`     | `eip155:84532`    | `https://base.sepolia.api.4mica.xyz/`     |

The default network is Ethereum Sepolia. Use `.network()` or the `4MICA_NETWORK` environment
variable to switch networks.

```python
from fourmica_sdk import NETWORKS

print(NETWORKS["base"].caip2)    # "eip155:8453"
print(NETWORKS["base"].rpc_url)  # "https://base.api.4mica.xyz/"
```

## Initialization and Configuration

The SDK requires a signing key and can use sensible defaults for the rest:

- `wallet_private_key` (**required**): private key used for on-chain gateway operations
- `evm_signer` (optional): custom signer implementing `EvmSigner` for payment/auth signing
- `network` (optional): select a network by shorthand or CAIP-2 id. Defaults to `ethereum-sepolia`.
- `rpc_url` (optional): override the core API URL directly (for self-hosted deployments).
- `ethereum_http_rpc_url` (optional): Ethereum JSON-RPC endpoint; fetched from core if omitted
- `contract_address` (optional): Core4Mica contract address; fetched from core if omitted
- `bearer_token` (optional): static bearer token for auth
- `auth_url` and `auth_refresh_margin_secs` (optional): SIWE auth config. Only used when auth is
  enabled via `enable_auth()` or when set via env (defaults to `rpc_url` and 60 seconds).

Note: `wallet_private_key` is currently required even when you supply `evm_signer`, because the
client always initializes the on-chain gateway.

### 1) Using ConfigBuilder

```python
import asyncio

from fourmica_sdk import Client, ConfigBuilder


async def main() -> None:
    cfg = (
        ConfigBuilder()
        .network("base")           # or "ethereum-sepolia" (default)
        .wallet_private_key("0x...")
        .build()
    )

    client = await Client.new(cfg)
    try:
        # use client.user, client.recipient, client.rpc
        pass
    finally:
        await client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
```

### 2) Using Environment Variables

Set environment variables (example `.env`):

```bash
4MICA_WALLET_PRIVATE_KEY="0x..."
4MICA_NETWORK="base"                     # shorthand or CAIP-2 id
# or override URL directly:
# 4MICA_RPC_URL="https://base.sepolia.api.4mica.xyz/"
4MICA_ETHEREUM_HTTP_RPC_URL="http://localhost:8545"
4MICA_CONTRACT_ADDRESS="0x..."
4MICA_BEARER_TOKEN="Bearer <access_token>"
4MICA_AUTH_URL="https://ethereum.sepolia.api.4mica.xyz/"
4MICA_AUTH_REFRESH_MARGIN_SECS="60"
```

If you want to set them inline for a single command, use `env` since most shells do not allow
variable names that start with a digit:

```bash
env 4MICA_WALLET_PRIVATE_KEY="0x..." 4MICA_NETWORK="base" python app.py
```

Then in code:

```python
from fourmica_sdk import Client, ConfigBuilder

cfg = ConfigBuilder().from_env().build()
client = await Client.new(cfg)
```

### 3) Using a Custom Signer

Provide a signer that implements `EvmSigner` (must expose `address`, `sign_typed_data`, and
`sign_message`). The private key is still required for on-chain operations.

```python
from fourmica_sdk import Client, ConfigBuilder, LocalAccountSigner

signer = LocalAccountSigner("0x...")
cfg = ConfigBuilder().wallet_private_key("0x...").evm_signer(signer).build()
client = await Client.new(cfg)
```

For Coinbase CDP MPC wallets, install the optional dependency and pass the CDP signer as the
custom `evm_signer`:

```python
from fourmica_sdk import CdpAccountConfig, ConfigBuilder, create_cdp_account

cdp_signer = await create_cdp_account(
    CdpAccountConfig(
        api_key_id="...",
        api_key_secret="...",
        wallet_secret="...",
        name="payer-wallet",
    )
)

cfg = ConfigBuilder().wallet_private_key("0x...").evm_signer(cdp_signer).build()
```

CDP signing only covers off-chain payment/auth signatures. A local `wallet_private_key` is still
required for on-chain gateway transactions.

### SIWE Auth (Optional)

Enable automatic SIWE auth refresh, or pass a static bearer token:

```python
from fourmica_sdk import Client, ConfigBuilder

cfg = (
    ConfigBuilder()
    .wallet_private_key("0x...")
    .rpc_url("https://api.4mica.xyz/")
    .enable_auth()
    .build()
)

client = await Client.new(cfg)
await client.login()   # optional: first RPC call also triggers auth
await client.logout()  # invalidates the session and clears cached tokens
```

Or use a static token:

```python
cfg = (
    ConfigBuilder()
    .wallet_private_key("0x...")
    .bearer_token("Bearer <access_token>")
    .build()
)
```

Env vars: `4MICA_BEARER_TOKEN`, `4MICA_AUTH_URL`, `4MICA_AUTH_REFRESH_MARGIN_SECS`.

## Usage

The SDK exposes three main entry points:

- `client.user`: payer-side operations (collateral, signing, withdrawals)
- `client.recipient`: recipient-side operations (tabs, guarantees, remuneration)
- `X402Flow`: helper for 402-protected HTTP resources

Low-level admin RPCs are available under `client.rpc` (requires an admin API key):

```python
client.rpc.with_admin_api_key("ak_...")
await client.rpc.update_user_suspension("0xUser", True)
```

## Direct SDK Quick Start

This direct flow talks to 4mica core and shows the four core actions: deposit, open a tab, request
a guarantee, and settle (remunerate) it on-chain. The payer and recipient roles are separate in
production, so the SDK uses different keys. The snippets below are copied from the runnable scripts
in `examples/recipient_quickstart.py` and `examples/payer_quickstart.py`.

Key requirements:

- Payer flow uses the private key of the user `PAYER_KEY` and `RECIPIENT_ADDRESS`.

Four-step direct flow:

1. Deposit collateral (payer). For ETH, call `payer_client.user.deposit(amount)`. For ERC20,
   call `payer_client.user.approve_erc20(token, amount)` first, then
   `payer_client.user.deposit(amount, token)`. `token` is the contract address of the supported stablecoin asset.
2. Get `tab_id` and `req_id` (recipient). Call `recipient_client.recipient.create_tab(...)` which
   hits core `/core/payment-tabs`. The SDK returns `tab_id`; compute the next `req_id` by calling
   `latest = await recipient_client.recipient.get_latest_guarantee(tab_id)` and using
   `req_id = 0 if latest is None else latest.req_id + 1`.
3. Sign the guarantee (payer). Build `PaymentGuaranteeRequestClaims` for V1, or
   `PaymentGuaranteeRequestClaimsV2` for validation-gated V2 using
   `compute_validation_subject_hash(...)` and `compute_validation_request_hash(...)`, then call
   `signature = await payer_client.user.sign_payment(claims, SigningScheme.EIP712)`.
4. Settle (recipient). Call `cert = await recipient_client.recipient.issue_payment_guarantee(...)`
   with the claims + payer signature, then `await recipient_client.recipient.remunerate(cert)` to
   settle on chain.

### Recipient (resource server) quick start

Recipient is the service provider that accepts a payer's credit. Each recipient can open a tab
with a user, a configurable line of credit that enables instant, trustless fair exchange between
payer and merchant. Run this script first to open a tab, compute the next `REQ_ID`, and print the
tab's asset address plus the amount the payer should sign.

```bash
export RECIPIENT_KEY=0x..
export USER_ADDRESS=0x.. # payer address
export AMOUNT_WEI=100000000000000000
```

```python
import asyncio
import os

from eth_account import Account
from fourmica_sdk import Client, ConfigBuilder

RECIPIENT_KEY = os.environ["RECIPIENT_KEY"]
USER_ADDRESS = os.environ["USER_ADDRESS"]
AMOUNT_WEI = int(os.getenv("AMOUNT_WEI", "100000000000000000"), 0)
GUARANTEE_VERSION = int(os.getenv("GUARANTEE_VERSION", "1"), 10)


async def main() -> None:
    recipient_cfg = ConfigBuilder().from_env().wallet_private_key(RECIPIENT_KEY).build()
    recipient_client = await Client.new(recipient_cfg)
    try:
        recipient_address = Account.from_key(RECIPIENT_KEY).address

        tab_id = await recipient_client.recipient.create_tab(
            user_address=USER_ADDRESS,
            recipient_address=recipient_address,
            erc20_token=None,
            ttl=None,
            guarantee_version=GUARANTEE_VERSION,
        )
        latest = await recipient_client.recipient.get_latest_guarantee(tab_id)
        req_id = latest.req_id + 1 if latest else 0
        tab = await recipient_client.recipient.get_tab(tab_id)
        asset_address = tab.asset_address if tab else None

        print("TAB_ID=", tab_id)
        print("REQ_ID=", req_id)
        print("AMOUNT_WEI=", AMOUNT_WEI)
        print("ASSET_ADDRESS=", asset_address)
        print(
            "ACCEPTED_GUARANTEE_VERSIONS=",
            recipient_client.params.accepted_guarantee_versions_or_default(),
        )
        print(
            "TRUSTED_VALIDATION_REGISTRIES=",
            recipient_client.params.trusted_validation_registries,
        )
        print("GUARANTEE_VERSION=", GUARANTEE_VERSION)
    finally:
        await recipient_client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
```

### Payer (client) quick start

Run this after you have a `TAB_ID` and `REQ_ID` from the recipient. It signs the guarantee and
optionally issues a certificate if you also pass `RECIPIENT_KEY`. For V2, provide the validation
policy env vars as well.

```bash
export PAYER_KEY=0x..
export RECIPIENT_ADDRESS=0x..
export TAB_ID=<tab_id>
export REQ_ID=<req_id>
export AMOUNT_WEI=100000000000000000
export ASSET_ADDRESS=0x0000000000000000000000000000000000000000
export RECIPIENT_KEY=0x.. # optional
export VALIDATION_REGISTRY_ADDRESS=0x.. # optional, enables V2 when set
export VALIDATION_CHAIN_ID=137 # optional, defaults to client.params.chain_id
export VALIDATOR_ADDRESS=0x.. # required for V2
export VALIDATOR_AGENT_ID=7 # required for V2
export MIN_VALIDATION_SCORE=80 # required for V2
export REQUIRED_VALIDATION_TAG=hard-finality # optional
```

```python
import asyncio
import json
import os
import time

from eth_account import Account
from fourmica_sdk import (
    AssetBalanceInfo,
    Client,
    ConfigBuilder,
    PaymentGuaranteeRequestClaims,
    PaymentGuaranteeRequestClaimsV2,
    SigningScheme,
    compute_validation_request_hash,
    compute_validation_subject_hash,
)

PAYER_KEY = os.environ["PAYER_KEY"]
RECIPIENT_ADDRESS = os.environ["RECIPIENT_ADDRESS"]
TAB_ID = int(os.environ["TAB_ID"], 0)
REQ_ID = int(os.environ["REQ_ID"], 0)
DEFAULT_ASSET_ADDRESS = "0x0000000000000000000000000000000000000000"
REQUESTED_AMOUNT_WEI = int(os.getenv("AMOUNT_WEI", "100000000000000000"), 0)
ASSET_ADDRESS = os.getenv("ASSET_ADDRESS") or DEFAULT_ASSET_ADDRESS
RECIPIENT_KEY = os.getenv("RECIPIENT_KEY")
VALIDATION_REGISTRY_ADDRESS = os.getenv("VALIDATION_REGISTRY_ADDRESS")
VALIDATION_CHAIN_ID = os.getenv("VALIDATION_CHAIN_ID")
VALIDATOR_ADDRESS = os.getenv("VALIDATOR_ADDRESS")
VALIDATOR_AGENT_ID = os.getenv("VALIDATOR_AGENT_ID")
MIN_VALIDATION_SCORE = os.getenv("MIN_VALIDATION_SCORE")
REQUIRED_VALIDATION_TAG = os.getenv("REQUIRED_VALIDATION_TAG", "")
JOB_HASH = os.getenv("JOB_HASH")


def build_claims(
    payer_client: Client,
    user_address: str,
    amount_wei: int,
    timestamp: int,
) -> PaymentGuaranteeRequestClaims | PaymentGuaranteeRequestClaimsV2:
    base_claims = PaymentGuaranteeRequestClaims.new(
        user_address=user_address,
        recipient_address=RECIPIENT_ADDRESS,
        tab_id=TAB_ID,
        req_id=REQ_ID,
        amount=amount_wei,
        timestamp=timestamp,
        erc20_token=ASSET_ADDRESS,
    )

    wants_v2 = any(
        value is not None
        for value in (
            VALIDATION_REGISTRY_ADDRESS,
            VALIDATION_CHAIN_ID,
            VALIDATOR_ADDRESS,
            VALIDATOR_AGENT_ID,
            MIN_VALIDATION_SCORE,
            JOB_HASH,
        )
    )
    if not wants_v2:
        return base_claims

    validation_chain_id = (
        int(VALIDATION_CHAIN_ID, 0)
        if VALIDATION_CHAIN_ID is not None
        else int(payer_client.params.chain_id)
    )
    validation_subject_hash = compute_validation_subject_hash(base_claims)
    partial_claims = PaymentGuaranteeRequestClaimsV2.new(
        user_address=base_claims.user_address,
        recipient_address=base_claims.recipient_address,
        tab_id=base_claims.tab_id,
        req_id=base_claims.req_id,
        amount=base_claims.amount,
        timestamp=base_claims.timestamp,
        erc20_token=base_claims.asset_address,
        validation_registry_address=VALIDATION_REGISTRY_ADDRESS,
        validation_request_hash="0x" + "00" * 32,
        validation_chain_id=validation_chain_id,
        validator_address=VALIDATOR_ADDRESS,
        validator_agent_id=int(VALIDATOR_AGENT_ID, 0),
        min_validation_score=int(MIN_VALIDATION_SCORE, 0),
        validation_subject_hash=validation_subject_hash,
        required_validation_tag=REQUIRED_VALIDATION_TAG,
        job_hash=JOB_HASH,
    )
    return PaymentGuaranteeRequestClaimsV2.new(
        user_address=partial_claims.user_address,
        recipient_address=partial_claims.recipient_address,
        tab_id=partial_claims.tab_id,
        req_id=partial_claims.req_id,
        amount=partial_claims.amount,
        timestamp=partial_claims.timestamp,
        erc20_token=partial_claims.asset_address,
        validation_registry_address=partial_claims.validation_registry_address,
        validation_request_hash=compute_validation_request_hash(partial_claims),
        validation_chain_id=partial_claims.validation_chain_id,
        validator_address=partial_claims.validator_address,
        validator_agent_id=partial_claims.validator_agent_id,
        min_validation_score=partial_claims.min_validation_score,
        validation_subject_hash=partial_claims.validation_subject_hash,
        required_validation_tag=partial_claims.required_validation_tag,
        job_hash=partial_claims.job_hash,
    )


async def main() -> None:
    payer_cfg = ConfigBuilder().from_env().wallet_private_key(PAYER_KEY).build()
    payer_client = await Client.new(payer_cfg)
    recipient_client = None
    try:
        user_address = Account.from_key(PAYER_KEY).address
        amount_wei = REQUESTED_AMOUNT_WEI

        balance_raw = await payer_client.rpc.get_user_asset_balance(
            user_address, ASSET_ADDRESS
        )
        if balance_raw:
            balance = AssetBalanceInfo.from_rpc(balance_raw)
            available = max(balance.total - balance.locked, 0)
            print("COLLATERAL_TOTAL=", balance.total)
            print("COLLATERAL_LOCKED=", balance.locked)
            print("COLLATERAL_AVAILABLE=", available)
            if available <= 0:
                raise SystemExit("No available collateral for this asset.")
            if amount_wei > available:
                amount_wei = available
            if amount_wei <= 0:
                raise SystemExit("Requested amount exceeds available collateral.")
        else:
            print("COLLATERAL_TOTAL= <unknown>")
            print("COLLATERAL_LOCKED= <unknown>")
            print("COLLATERAL_AVAILABLE= <unknown>")
        print("AMOUNT_WEI=", amount_wei)

        claims = build_claims(
            payer_client, user_address, amount_wei, timestamp=int(time.time())
        )
        signature = await payer_client.user.sign_payment(claims, SigningScheme.EIP712)

        print("PAYER_SIGNATURE=", signature.signature)
        print("CLAIMS_JSON=", json.dumps(claims.__dict__))
        if RECIPIENT_KEY:
            recipient_cfg = (
                ConfigBuilder().from_env().wallet_private_key(RECIPIENT_KEY).build()
            )
            recipient_client = await Client.new(recipient_cfg)
            cert = await recipient_client.recipient.issue_payment_guarantee(
                claims, signature.signature, SigningScheme.EIP712
            )
            print("CERT_CLAIMS=", cert.claims)
            print("CERT_SIGNATURE=", cert.signature)
    finally:
        if recipient_client is not None:
            await recipient_client.aclose()
        await payer_client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
```

For V2 x402 flows, include the following fields under `paymentRequirements.extra`:
`validationRegistryAddress`, `validatorAddress`, `validatorAgentId`,
`minValidationScore`, `jobHash`, and optional `requiredValidationTag`.
`validationChainId` is optional; when omitted, the SDK derives the expected chain id from the
CAIP-2 `network` value (for example, `eip155:1`).

## X402 Flow (HTTP 402)

The X402 helper turns `paymentRequirements` from a `402 Payment Required` response into an
X-PAYMENT header (and optional `/settle` call) that the facilitator will accept.

### What the SDK expects from `paymentRequirements`

At minimum you need:

- `scheme` and `network` (scheme must include `4mica`, e.g. `4mica-credit`)
- `extra.tabEndpoint` for tab resolution

`X402Flow` will refresh the tab by calling `extra.tabEndpoint` before signing.

### X402 Version 1

Version 1 returns payment requirements in the JSON response body:

```python
import asyncio

from fourmica_sdk import Client, ConfigBuilder, X402Flow
from fourmica_sdk import PaymentRequirementsV1


async def main() -> None:
    cfg = ConfigBuilder().wallet_private_key("0x...").build()
    client = await Client.new(cfg)
    flow = X402Flow.from_client(client)

    # 1) GET the protected endpoint and parse JSON body
    res = fetch_resource_somehow()
    requirements = PaymentRequirementsV1.from_raw(res["accepts"][0])

    # 2) Build the X-PAYMENT header with the SDK
    payment = await flow.sign_payment(requirements, "0xUser")

    # 3) Call the protected resource with the header
    headers = {"X-PAYMENT": payment.header}
    await call_resource_somehow(headers)

    await client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
```

### X402 Version 2

Version 2 uses the `payment-required` header (base64-encoded) instead of a JSON response body:

```python
import asyncio
import base64
import json

from fourmica_sdk import Client, ConfigBuilder, X402Flow
from fourmica_sdk import X402PaymentRequired, PaymentRequirementsV2


async def main() -> None:
    cfg = ConfigBuilder().wallet_private_key("0x...").build()
    client = await Client.new(cfg)
    flow = X402Flow.from_client(client)

    # 1) GET the protected endpoint and extract payment-required header
    res = fetch_resource_somehow()
    header = res.headers.get("payment-required")
    if not header:
        raise RuntimeError("Missing payment-required header")

    # 2) Decode the header
    decoded = base64.b64decode(header).decode("utf8")
    payment_required = X402PaymentRequired.from_raw(json.loads(decoded))

    # 3) Select a payment option
    accepted = payment_required.accepts[0]

    # 4) Build the PAYMENT-SIGNATURE header with the SDK
    signed = await flow.sign_payment_v2(payment_required, accepted, "0xUser")

    # 5) Call the protected resource with the header
    headers = {"PAYMENT-SIGNATURE": signed.header}
    await call_resource_somehow(headers)

    await client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
```

### Resource server / facilitator side

If your resource server proxies to the facilitator, you can reuse the SDK to settle after
verifying:

```python
from fourmica_sdk import Client, ConfigBuilder, X402Flow
from fourmica_sdk import PaymentRequirementsV1, X402SignedPayment


async def settle(
    facilitator_url: str,
    payment_requirements: PaymentRequirementsV1,
    payment: X402SignedPayment,
) -> None:
    core = await Client.new(
        ConfigBuilder().wallet_private_key("0x...").build()
    )
    flow = X402Flow.from_client(core)

    settled = await flow.settle_payment(payment, payment_requirements, facilitator_url)
    print("settlement result:", settled.settlement)

    await core.aclose()
```

Notes:

- `sign_payment` and `sign_payment_v2` always use EIP-712 signing and will error if the scheme is not 4mica.
- `UserClient.sign_payment` supports `SigningScheme.EIP712` (default) and `SigningScheme.EIP191`.
- `settle_payment` only hits `/settle`; resource servers should still call `/verify` first when enforcing access.

## Concepts

- Tabs are per `(user, recipient, asset, guarantee_version)` credit ledgers. Core reuses an existing active tab for that exact identity if it is still valid; otherwise it creates a new opaque `tab_id`.
- Tab lifecycle: tabs start `Pending`; the first valid guarantee opens the tab and sets `start_timestamp` to the claim timestamp. Guarantees must be within `[start_timestamp, start_timestamp + ttl]` and are rejected if the tab is closed or expired.
- Request ids: `req_id` is per-tab and strictly sequential. The first guarantee uses `req_id = 0`; each new guarantee must be `last_req_id + 1`. The facilitator returns `nextReqId` in `/tabs`.
- Guarantee request claims (v1) are the signed payload: `{ user_address, recipient_address, tab_id, req_id, amount, asset_address, timestamp }`. `asset_address` is the zero address for ETH if omitted. `timestamp` is seconds since epoch and is validated by core.
- Guarantee request claims (v2) extend V1 with validation policy fields: `validation_registry_address`, `validation_request_hash`, `validation_chain_id`, `validator_address`, `validator_agent_id`, `min_validation_score`, `validation_subject_hash`, and `required_validation_tag`.
- Guarantee certificates are BLS signatures over `PaymentGuaranteeClaims` (core adds `domain`, `total_amount` which is the running sum for the tab, and `version`). The SDK models this as `BLSCert { claims, signature }`, where `claims` is ABI-encoded hex.

## X-PAYMENT header schema

`X-PAYMENT` is a base64-encoded JSON envelope:

```json
{
  "x402Version": 1,
  "scheme": "4mica-credit",
  "network": "polygon-amoy",
  "payload": {
    "claims": {
      "user_address": "<0x-prefixed checksum string>",
      "recipient_address": "<0x-prefixed checksum string>",
      "tab_id": "<decimal or 0x value>",
      "req_id": "<decimal or 0x value>",
      "amount": "<decimal or 0x value>",
      "asset_address": "<0x-prefixed checksum string>",
      "timestamp": 1716500000,
      "version": "v1"
    },
    "signature": "<0x-prefixed wallet signature>",
    "scheme": "eip712"
  }
}
```

Facilitators enforce that `scheme` / `network` match `/supported`, `payTo` matches
`recipient_address` in the claims, and `asset` / `maxAmountRequired` equal the signed `amount`.
For V2, `payload.claims.version` is `"v2"` and the validation policy fields are included in the
same `claims` object. The signed `validation_chain_id` is derived from `paymentRequirements.network`
(`eip155:<chainId>`) and must match any optional `extra.validationChainId` value if provided.

## Testing

By default, `pytest` runs unit tests only:

```bash
./venv/bin/pytest -q
```

Integration tests are marked with `@pytest.mark.integration` and require a live core/auth service.
Run them explicitly when the environment is available:

```bash
./venv/bin/pytest -q -m integration
```

## End-to-end credit flow (x402)

1. Resource sends `402 Payment Required` with `(scheme, network)` and a tab endpoint.
2. Client calls the tab endpoint with `{ userAddress, erc20Token?, ttlSeconds?, x402Version? }`; the recipient calls `/tabs` and returns tab metadata.
3. Client signs a guarantee with the SDK and wraps it into `X-PAYMENT`.
4. Client retries the protected call with `X-PAYMENT: <base64>`.
5. Recipient optionally calls `/verify` with `{ x402Version, paymentHeader, paymentRequirements }`.
6. Recipient calls `/settle` to obtain the certificate, then relays repayment details to the payer.

## API Methods Summary

### Client Methods

- `login()` → `AuthTokens` — trigger SIWE auth and cache tokens (requires `enable_auth()` or `auth_url`)
- `logout()` — invalidate the auth session and clear cached tokens
- `aclose()` — close all underlying connections (HTTP client, gateway, auth session)

### UserClient Methods (`client.user`)

All methods that send on-chain transactions accept an optional `wait_options: TxReceiptWaitOptions`
argument (defaults to 60 s timeout, 2 s poll interval).

- `approve_erc20(token, amount, wait_options=None)` — approve the Core4Mica contract to spend an ERC20 token; skips if allowance is already sufficient
- `deposit(amount, erc20_token=None, wait_options=None)` — deposit ETH or ERC20 collateral
- `get_user(block_number=None)` → `List[UserInfo]` — collateral balances for all assets at an optional block
- `get_tab_payment_status(tab_id)` → `TabPaymentStatus`
- `sign_payment(claims, scheme=SigningScheme.EIP712)` → `PaymentSignature`
- `list_tabs(settlement_statuses=None)` → `List[TabInfo]` — list tabs for the authenticated user, optionally filtered by settlement status
- `pay_tab(tab_id, req_id=None, amount=None, recipient_address=None, erc20_token=None, wait_options=None)` — pay a tab on-chain; when `req_id`, `amount`, or `recipient_address` are omitted the SDK fetches the latest guarantee automatically
- `request_withdrawal(amount, erc20_token=None, wait_options=None)`
- `cancel_withdrawal(erc20_token=None, wait_options=None)`
- `finalize_withdrawal(erc20_token=None, wait_options=None)`

### RecipientClient Methods (`client.recipient`)

- `create_tab(user_address, recipient_address, erc20_token, ttl, guarantee_version=1)` → `(tab_id, asset_address, next_req_id)`
- `get_tab_payment_status(tab_id)` → `TabPaymentStatus`
- `issue_payment_guarantee(claims, signature, scheme)` → `BLSCert`
- `verify_payment_guarantee(cert)` → `PaymentGuaranteeClaims`
- `remunerate(cert, wait_options=None)` — settle a guarantee on-chain
- `list_settled_tabs()` → `List[TabInfo]`
- `list_pending_remunerations()` → `List[PendingRemunerationInfo]`
- `get_tab(tab_id)` → `Optional[TabInfo]`
- `list_recipient_tabs(settlement_statuses=None)` → `List[TabInfo]`
- `get_tab_guarantees(tab_id)` → `List[GuaranteeInfo]`
- `get_latest_guarantee(tab_id)` → `Optional[GuaranteeInfo]`
- `get_guarantee(tab_id, req_id)` → `Optional[GuaranteeInfo]`
- `list_recipient_payments()` → `List[RecipientPaymentInfo]`
- `get_collateral_events_for_tab(tab_id)` → `List[CollateralEventInfo]`
- `get_user_asset_balance(user_address, asset_address)` → `Optional[AssetBalanceInfo]`

### RPC Methods (`client.rpc`)

Public methods available without an admin key:

- `get_supported_tokens()` → `SupportedTokensResponse` — returns `chain_id` and the list of `SupportedTokenInfo` (symbol, address, decimals) accepted by the network

Admin methods (requires `client.rpc.with_admin_api_key("ak_...")`):

- `update_user_suspension(user_address, suspended)`
- `create_admin_api_key({"name": ..., "scopes": [...]})`
- `list_admin_api_keys()`
- `revoke_admin_api_key(key_id)`

### TxReceiptWaitOptions

Controls how long the SDK waits for on-chain confirmation after broadcasting a transaction:

```python
from fourmica_sdk import TxReceiptWaitOptions

opts = TxReceiptWaitOptions(timeout_secs=120, poll_latency_secs=3)
await client.user.deposit(amount, wait_options=opts)
```

Defaults: `timeout_secs=60`, `poll_latency_secs=2`.

## Error Handling

All SDK errors extend `FourMicaError`. Common error types include `ConfigError`, `RpcError`,
`ClientInitializationError`, `ContractError`, `SigningError`, `VerificationError`, `X402Error`, and
`AuthError`.

## Notes

- All methods are `async`; use `asyncio.run` or your event loop of choice.
- Remuneration requires `py-ecc` (`pip install 'sdk-4mica[bls]'`) to expand BLS signatures into the on-chain format.
- Numeric values accept `int` or hex/decimal strings and are serialized to `0x`-prefixed hex when sent to the facilitator.

## License

MIT
