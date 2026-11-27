import asyncio
import os
import sys
import time
from pathlib import Path

import httpx
import pytest
from web3.exceptions import Web3Exception

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fourmica_sdk import (  # noqa: E402
    Client,
    ConfigBuilder,
    PaymentRequest,
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
    deadline = time.monotonic() + timeout
    while time.monotonic() <= deadline:
        value = await fn()
        if value is not None:
            return value
        await asyncio.sleep(interval)
    return None


async def mine_blocks(blocks: int = 1) -> None:
    url = os.environ.get("E2E_ETH_RPC_URL")
    if not url:
        return
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            await client.post(
                url,
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "anvil_mine",
                    "params": [blocks],
                },
            )
    except httpx.HTTPError:
        return


async def credited_balance(client: Client, asset: str | None, minimum: int = 1):
    async def check():
        await mine_blocks(1)
        balance = await client.account.asset_balance(asset)
        if balance is not None and balance.total >= minimum:
            return balance
        return None

    return await poll(check, timeout=45)


async def ensure_collateral(client: Client, asset: str | None, minimum: int) -> None:
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
    gateway = await client._ctx.gateway()
    contract = gateway.w3.eth.contract(
        address=gateway.w3.to_checksum_address(token), abi=_MINT_ABI
    )
    await gateway._send(contract.functions.mint(to, amount))


async def signed_payment(
    payer_client: Client,
    recipient_client: Client,
    amount: int | None = None,
    erc20_token: str | None = None,
) -> PaymentRequest:
    payload = await payer_client.payment.new_payment(
        recipient_client.signer_address,
        amount if amount is not None else guarantee_amount(),
        erc20_token,
    )
    return await payer_client.payment.sign_request(payload)


def cycle_text_ids(asset: str | None, issued_at: int) -> list:
    cycle_secs = int(os.environ.get("E2E_CYCLE_SECS", "600"))
    address = (asset or ZERO_ADDRESS).lower()
    start = issued_at - issued_at % cycle_secs
    return [f"{address}:{start}", f"{address}:{start + cycle_secs}"]


def is_pending_cycle_error(exc: RpcError) -> bool:
    return exc.status_code in (400, 404)


async def wait_for_onchain_cycle(client: Client, action, timeout: float = 300):
    gateway = await client._ctx.gateway()
    contract = gateway._clearing_house(action.contract_address)
    cycle_id = bytes.fromhex(action.cycle_id.removeprefix("0x"))

    async def check():
        await mine_blocks(1)
        try:
            return await contract.functions.getCycle(cycle_id).call()
        except Web3Exception:
            return None

    return await poll(check, timeout=timeout, interval=5)
