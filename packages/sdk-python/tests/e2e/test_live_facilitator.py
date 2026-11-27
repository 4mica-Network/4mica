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
