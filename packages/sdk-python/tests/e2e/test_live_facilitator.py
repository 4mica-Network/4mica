"""Sponsored flows against a live facilitator, mirroring 4mica-core's
``facilitator_gasless_deposit`` integration test.

Runs only when a facilitator URL is provided on top of the usual live-stack
gate. The facilitator's SIWE wallet needs the ``facilitator`` role in core's
DB (see live_stack.py); its relayer wallet pays the gas these tests avoid
spending.

    SDK_LOCAL_E2E=1 E2E_FACILITATOR_URL=http://127.0.0.1:8080/ \
    E2E_RPC_URL=http://127.0.0.1:3000/ E2E_ETH_RPC_URL=http://127.0.0.1:8545/ \
    E2E_PAYER_KEY=0x... E2E_RECIPIENT_KEY=0x... \
    pytest -m integration tests/e2e/test_live_facilitator.py
"""

import os

import pytest
from live_stack import (
    Client,
    client_config,
    credited_balance,
    mint_mock_erc20,
    requires_live_stack,
)

from fourmica_sdk.client.model import TokenRoute

pytestmark = [
    pytest.mark.integration,
    requires_live_stack,
    pytest.mark.skipif(
        not os.environ.get("E2E_FACILITATOR_URL"),
        reason="set E2E_FACILITATOR_URL to run against a live facilitator",
    ),
]

DEPOSIT = 10**6


@pytest.fixture
async def sponsored_payer():
    cfg = client_config("E2E_PAYER_KEY")
    cfg.facilitator_url = os.environ["E2E_FACILITATOR_URL"]
    client = await Client.connect(cfg)
    yield client
    await client.aclose()


async def test_gasless_deposit_is_paid_by_the_facilitator(sponsored_payer):
    """The payer signs an EIP-3009 authorization; the facilitator submits it
    and pays gas. The dev stack's mock USDC implements EIP-3009 and core
    relays its domain separator, so the whole flow needs no chain access from
    the payer beyond the mint that funds the wallet."""
    payer = sponsored_payer
    tokens = await payer.tokens.supported()
    token = next(t.address for t in tokens.tokens if t.domain_separator)

    await mint_mock_erc20(payer, token, payer.signer_address, DEPOSIT)

    receipt = await payer.deposit.of(token, DEPOSIT).gasless().send()

    assert receipt.route in (TokenRoute.EIP3009, TokenRoute.SPONSORED_PERMIT2)
    assert receipt.account == payer.signer_address
    assert receipt.tx_hash.startswith("0x")
    assert await credited_balance(payer, token) is not None


async def test_gasless_withdrawal_roundtrip(sponsored_payer):
    """Request and cancel a withdrawal without the user transacting —
    Core4Mica verifies the authorization signatures itself, so this works for
    any asset, native included."""
    payer = sponsored_payer
    positions = {p.asset.lower(): p for p in await payer.account.assets()}
    native = positions.get("0x0000000000000000000000000000000000000000")
    if native is None or native.collateral == 0:
        pytest.skip("payer holds no native collateral; run the core e2e first")

    amount = max(native.collateral // 10, 1)
    request_receipt = await payer.withdraw.request(None, amount).gasless().send()
    assert request_receipt.route.value == "gasless"

    cancel_receipt = await payer.withdraw.cancel(None).gasless().send()
    assert cancel_receipt.route.value == "gasless"
