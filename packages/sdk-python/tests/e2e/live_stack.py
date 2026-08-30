"""Shared plumbing for the live-stack e2e suite.

Runs against a local 4mica-core dev stack (``make dev-up`` in the 4mica-core
repo). Skipped entirely unless SDK_LOCAL_E2E=1.

Environment:
    SDK_LOCAL_E2E=1        enable the suite
    E2E_RPC_URL            core API           (default http://127.0.0.1:3000/)
    E2E_ETH_RPC_URL        Ethereum RPC       (default http://127.0.0.1:8545/)
    E2E_PAYER_KEY          funded wallet, pays and deposits
    E2E_RECIPIENT_KEY      funded wallet, issues guarantees
    E2E_AMOUNT             guarantee amount   (default 1000 wei)
    E2E_CYCLE_SECS         SETTLEMENT_CYCLE_SECS of the running stack (default 600)
    E2E_CLEARING=1         also run the slow clearing-settlement test
    E2E_CLEARING_TIMEOUT   seconds to wait for the scheduler (default 1500)

The recipient wallet needs the ``guarantee:issue`` scope in core's DB:

    docker exec -i 4mica-pg psql -U postgres -d core <<'SQL'
    INSERT INTO "WalletRole" (address, role, scopes, status) VALUES
      ('0x<recipient-lowercase>', 'user',
       '["payment:read","guarantee:issue"]'::jsonb, 'active')
    ON CONFLICT (address) DO UPDATE
      SET role = EXCLUDED.role, scopes = EXCLUDED.scopes, status = EXCLUDED.status;
    SQL
"""

import asyncio
import os
import secrets
import sys
import time
from pathlib import Path
from typing import Optional

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fourmica_sdk import (  # noqa: E402
    Client,
    ConfigBuilder,
    PaymentGuaranteeRequestClaims,
    RpcError,
)

requires_live_stack = pytest.mark.skipif(
    os.environ.get("SDK_LOCAL_E2E") != "1",
    reason="set SDK_LOCAL_E2E=1 to run against a live stack",
)

ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

_MINT_ABI = [
    {
        "type": "function",
        "name": "mint",
        "inputs": [
            {"name": "to", "type": "address"},
            {"name": "amount", "type": "uint256"},
        ],
        "outputs": [],
        "stateMutability": "nonpayable",
    }
]


def guarantee_amount() -> int:
    return int(os.environ.get("E2E_AMOUNT", "1000"))


def client_config(key_env: str):
    builder = (
        ConfigBuilder()
        .rpc_url(os.environ.get("E2E_RPC_URL", "http://127.0.0.1:3000/"))
        .wallet_private_key(os.environ[key_env])
    )
    if os.environ.get("E2E_ETH_RPC_URL"):
        builder = builder.ethereum_http_rpc_url(os.environ["E2E_ETH_RPC_URL"])
    return builder.build()


async def poll(fn, timeout: float = 30, interval: float = 1):
    """Await ``fn()`` until it returns non-None, or return None on timeout."""
    deadline = time.monotonic() + timeout
    while time.monotonic() <= deadline:
        value = await fn()
        if value is not None:
            return value
        await asyncio.sleep(interval)
    return None


async def credited_balance(client: Client, asset: Optional[str], minimum: int = 1):
    async def check():
        balance = await client.account.asset_balance(asset)
        if balance is not None and balance.total >= minimum:
            return balance
        return None

    return await poll(check, timeout=45)


async def ensure_collateral(client: Client, asset: Optional[str], minimum: int) -> None:
    """Deposit only when the API balance is below *minimum* — reruns against a
    warm stack then skip both the transaction and the observer wait."""
    balance = await client.account.asset_balance(asset)
    if balance is not None and balance.total >= minimum:
        return
    deposit = client.deposit.of(asset, minimum)
    if asset:
        await deposit.self_funded().approve()
    await deposit.send()
    assert await credited_balance(client, asset, minimum) is not None, (
        "core never credited the deposit; is the chain observer running?"
    )


async def mint_mock_erc20(client: Client, token: str, to: str, amount: int) -> None:
    """The dev stack's MockERC20 exposes a public mint — reach through the
    gateway's web3 handle to fund a wallet. Test-only internals access."""
    gateway = await client._ctx.gateway()
    contract = gateway.w3.eth.contract(
        address=gateway.w3.to_checksum_address(token), abi=_MINT_ABI
    )
    await gateway._send(contract.functions.mint(to, amount))


def build_claims(
    payer_client: Client,
    recipient_client: Client,
    amount: Optional[int] = None,
    erc20_token: Optional[str] = None,
) -> PaymentGuaranteeRequestClaims:
    return PaymentGuaranteeRequestClaims.new(
        user_address=payer_client.signer_address,
        recipient_address=recipient_client.signer_address,
        req_id=int.from_bytes(secrets.token_bytes(32), "big"),
        amount=amount if amount is not None else guarantee_amount(),
        timestamp=int(time.time()),
        erc20_token=erc20_token,
    )


def cycle_text_ids(asset: Optional[str], issued_at: int) -> list:
    """Candidate text ids (``{asset}:{period_start}``) for the cycle open at
    *issued_at* — the current window plus its neighbours, in case issuance
    landed at a boundary."""
    cycle_secs = int(os.environ.get("E2E_CYCLE_SECS", "600"))
    address = (asset or ZERO_ADDRESS).lower()
    start = issued_at - issued_at % cycle_secs
    return [f"{address}:{start}", f"{address}:{start + cycle_secs}"]


def is_pending_cycle_error(exc: RpcError) -> bool:
    """Errors expected while the scheduler has not yet netted and committed the
    cycle: not found, still open/frozen, or netting not written yet."""
    return exc.status_code in (400, 404)


async def wait_for_onchain_cycle(client: Client, action, timeout: float = 300):
    """Core can serve a prepared clearing action before the scheduler's
    ``commitCycle`` transaction lands, and until it does every settlement call
    reverts ``CycleNotFound``. Poll the ClearingHouse itself — the equivalent
    of 4mica-core's ``wait_for_payment_window`` test helper, minus its DB
    access. Test-only internals access."""
    gateway = await client._ctx.gateway()
    contract = gateway._clearing_house(action.contract_address)
    cycle_id = bytes.fromhex(action.cycle_id.removeprefix("0x"))

    async def check():
        try:
            return await contract.functions.getCycle(cycle_id).call()
        except Exception:
            return None

    return await poll(check, timeout=timeout, interval=5)
