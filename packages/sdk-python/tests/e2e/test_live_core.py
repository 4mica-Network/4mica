"""Live-stack end-to-end flow, mirroring 4mica-core's integration tests.

Skipped unless SDK_LOCAL_E2E=1. Needs a running 4mica-core stack and two
funded wallets:

    SDK_LOCAL_E2E=1 \
    E2E_RPC_URL=http://localhost:3000/ \
    E2E_PAYER_KEY=0x... E2E_RECIPIENT_KEY=0x... \
    pytest -m integration tests/e2e

This is the one check unit tests cannot replace: a guarantee issued here
proves core accepts the 2.0 request signature (verifyingContract domain,
tabId-less struct) end to end.
"""

import os
import secrets
import time

import pytest

from fourmica_sdk import Client, ConfigBuilder, PaymentGuaranteeRequestClaims

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        os.environ.get("SDK_LOCAL_E2E") != "1",
        reason="set SDK_LOCAL_E2E=1 to run against a live stack",
    ),
]


def client_config(key_env: str):
    return (
        ConfigBuilder()
        .rpc_url(os.environ.get("E2E_RPC_URL", "http://localhost:3000/"))
        .wallet_private_key(os.environ[key_env])
        .build()
    )


async def test_guarantee_flow_end_to_end():
    payer = await Client.connect(client_config("E2E_PAYER_KEY"))
    recipient = await Client.connect(client_config("E2E_RECIPIENT_KEY"))
    try:
        claims = PaymentGuaranteeRequestClaims.new(
            user_address=payer.signer_address,
            recipient_address=recipient.signer_address,
            req_id=int.from_bytes(secrets.token_bytes(32), "big"),
            amount=int(os.environ.get("E2E_AMOUNT", "1000")),
            timestamp=int(time.time()),
            erc20_token=os.environ.get("E2E_ERC20_TOKEN"),
        )
        signature = await payer.payment.sign_request(claims)

        cert = await recipient.payment.issue_guarantee(claims, signature)
        verified = recipient.payment.verify_guarantee(cert)

        assert verified.amount == claims.amount
        assert verified.user_address.lower() == payer.signer_address.lower()
        assert verified.recipient_address.lower() == recipient.signer_address.lower()
        assert verified.version == 1

        received = await recipient.payment.list_received()
        assert isinstance(received, list)
    finally:
        await payer.aclose()
        await recipient.aclose()
