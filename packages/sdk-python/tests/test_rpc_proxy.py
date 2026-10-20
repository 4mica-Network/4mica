import json

import httpx
import pytest

from fourmica_sdk.errors import RpcError
from fourmica_sdk.models import (
    CheckpointPayload,
    ClearingParticipantRole,
    ClearingSettlementAction,
    PaymentRequest,
    PaymentRequestPayload,
    SignedCheckpoint,
)
from fourmica_sdk.rpc import SDK_CLIENT, RpcProxy

BASE = "https://core.example/"

PROOF = {
    "cycle_id": "0x" + "aa" * 32,
    "cycle_id_text": "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266:1777248000",
    "asset_address": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "participant": "0x1234567890123456789012345678901234567890",
    "role": "NET_CREDITOR",
    "amount": "10",
    "net_debit": "0",
    "net_credit": "10",
    "leaf": "0x" + "bb" * 32,
    "merkle_root": "0x" + "cc" * 32,
    "proof": ["0x" + "dd" * 32],
}

ACTION = {
    "contract_address": "0x2222222222222222222222222222222222222222",
    "function_name": "payNetDebit",
    "action": "pay_net_debit",
    "cycle_id": "0x" + "aa" * 32,
    "cycle_id_text": "cycle",
    "asset_address": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    "participant": "0x1234567890123456789012345678901234567890",
    "amount": "10",
    "payable_value": "0",
    "proof": ["0x" + "dd" * 32],
}


def request() -> PaymentRequest:
    return PaymentRequest(
        payload=PaymentRequestPayload.new(
            user_address="0x1234567890123456789012345678901234567890",
            recipient_address="0x00000000000000000000000000000000000000Be",
            cycle_id="0x" + "11" * 32,
            req_id=7,
            amount=1000,
            timestamp=1_700_000_000,
            salt=b"\x22" * 32,
        ),
        signature="0x" + "ab" * 65,
    )


def proxy_with(handler) -> RpcProxy:
    return RpcProxy(BASE, transport=httpx.MockTransport(handler))


async def test_clearing_action_path_and_query():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["path"] = request.url.path
        seen["query"] = dict(request.url.params)
        seen["sdk_header"] = request.headers.get("x-4mica-sdk")
        return httpx.Response(200, json=ACTION)

    proxy = proxy_with(handler)
    action = await proxy.get_clearing_pay_net_debit_action(
        "0x" + "aa" * 32, "0x1234567890123456789012345678901234567890"
    )
    assert seen["path"] == (
        "/core/cycles/0x"
        + "aa" * 32
        + "/participants/0x1234567890123456789012345678901234567890/clearing-action"
    )
    assert seen["query"] == {"action": "pay_net_debit"}
    assert seen["sdk_header"] == SDK_CLIENT
    assert action.action == ClearingSettlementAction.PAY_NET_DEBIT
    assert action.amount == 10
    assert action.proof == ["0x" + "dd" * 32]


async def test_clearing_proof_parses_typed():
    proxy = proxy_with(lambda request: httpx.Response(200, json=PROOF))
    proof = await proxy.get_clearing_participant_proof(
        "0x" + "aa" * 32, "0x1234567890123456789012345678901234567890"
    )
    assert proof.role == ClearingParticipantRole.NET_CREDITOR
    assert proof.net_credit == 10
    assert proof.merkle_root == "0x" + "cc" * 32


async def test_null_asset_balance_is_none():
    proxy = proxy_with(
        lambda request: httpx.Response(
            200, content=b"null", headers={"content-type": "application/json"}
        )
    )
    result = await proxy.get_user_asset_balance("0xuser", "0xasset")
    assert result is None


async def test_get_retries_on_5xx_then_succeeds():
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] < 3:
            return httpx.Response(503, json={"error": "draining"})
        return httpx.Response(200, json={"chain_id": 1, "tokens": []})

    proxy = proxy_with(handler)
    tokens = await proxy.get_supported_tokens()
    assert tokens.chain_id == 1
    assert calls["n"] == 3


async def test_post_does_not_retry():
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(503, json={"error": "draining"})

    proxy = proxy_with(handler)
    with pytest.raises(RpcError) as excinfo:
        await proxy.issue_guarantee(request())
    assert excinfo.value.status_code == 503
    assert calls["n"] == 1


async def test_issue_guarantee_posts_the_request_and_parses_the_receipt():
    seen = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["auth"] = req.headers.get("authorization")
        seen["path"] = req.url.path
        seen["body"] = json.loads(req.content)
        return httpx.Response(200, json={"receipt": "0x00aa", "signature": "0xbb"})

    proxy = proxy_with(handler).with_bearer_token("token-123")
    receipt = await proxy.issue_guarantee(request())
    assert seen["auth"] == "Bearer token-123"
    assert seen["path"] == "/core/guarantees"
    assert seen["body"] == request().to_payload()
    assert receipt.receipt == "0x00aa"
    assert receipt.signature == "0xbb"


async def test_coded_errors_carry_their_code_and_details():
    body = {
        "error": "payer must submit a checkpoint",
        "code": "CHECKPOINT_REQUIRED",
        "details": {"uncheckpointed": 64},
    }
    proxy = proxy_with(lambda req: httpx.Response(409, json=body))
    with pytest.raises(RpcError) as excinfo:
        await proxy.issue_guarantee(request())
    assert excinfo.value.status_code == 409
    assert excinfo.value.code == "CHECKPOINT_REQUIRED"
    assert excinfo.value.details == {"uncheckpointed": 64}
    assert "payer must submit a checkpoint" in str(excinfo.value)


async def test_an_uncoded_error_has_no_code():
    proxy = proxy_with(lambda req: httpx.Response(502, text="bad gateway"))
    with pytest.raises(RpcError) as excinfo:
        await proxy.issue_guarantee(request())
    assert excinfo.value.code is None
    assert excinfo.value.details is None
    assert "bad gateway" in str(excinfo.value)


async def test_active_cycle_names_the_asset():
    seen = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen["url"] = req.url
        return httpx.Response(
            200,
            json={
                "cycle_id": "0x" + "11" * 32,
                "cycle_id_text": "t",
                "asset_address": "0x0000000000000000000000000000000000000000",
                "period_start": 1,
                "period_end": 2,
                "server_time": 3,
                "max_uncheckpointed": 64,
            },
        )

    cycle = await proxy_with(handler).get_active_cycle(
        "0x0000000000000000000000000000000000000000"
    )
    assert seen["url"].path == "/core/cycles/active"
    assert seen["url"].params["asset"] == "0x0000000000000000000000000000000000000000"
    assert cycle.server_time == 3
    assert cycle.max_uncheckpointed == 64


@pytest.mark.parametrize("cycle_id", [None, "0x" + "AB" * 32])
async def test_checkpoint_batch_names_payer_asset_and_cycle(cycle_id):
    seen = {}
    payer = "0x1234567890123456789012345678901234567890"

    def handler(req: httpx.Request) -> httpx.Response:
        seen["url"] = req.url
        return httpx.Response(
            200,
            json={
                "cycle_id": "0x" + "ab" * 32,
                "cycle_id_text": "t",
                "asset_address": "0x0000000000000000000000000000000000000000",
                "payer": payer,
                "previous": None,
                "authorizations": [],
                "max_uncheckpointed": 64,
            },
        )

    await proxy_with(handler).get_checkpoint_batch(
        payer, "0x0000000000000000000000000000000000000000", cycle_id
    )
    assert seen["url"].path == f"/core/payers/{payer}/checkpoint-batch"
    assert seen["url"].params["asset"] == "0x0000000000000000000000000000000000000000"
    if cycle_id is None:
        assert "cycle_id" not in seen["url"].params
    else:
        assert seen["url"].params["cycle_id"] == "0x" + "ab" * 32


async def test_submit_checkpoint_posts_the_signed_checkpoint():
    seen = {}
    signed = SignedCheckpoint(
        payload=CheckpointPayload(
            payer="0x1234567890123456789012345678901234567890",
            cycle_id="0x" + "11" * 32,
            asset_address="0x0000000000000000000000000000000000000000",
            cumulative_gross=120,
            timestamp_cutoff=99,
        ),
        signature="0xcc",
    )

    def handler(req: httpx.Request) -> httpx.Response:
        seen["path"] = req.url.path
        seen["body"] = json.loads(req.content)
        return httpx.Response(
            200,
            json={
                "cycle_id": "0x" + "11" * 32,
                "cycle_id_text": "t",
                "asset_address": "0x0000000000000000000000000000000000000000",
                "payer": "0x1234567890123456789012345678901234567890",
                "cumulative_gross": "120",
                "timestamp_cutoff": 99,
                "covered": 1,
            },
        )

    accepted = await proxy_with(handler).submit_checkpoint(signed)
    assert seen["path"] == "/core/checkpoints"
    assert seen["body"] == {
        "payload": {
            "payer": "0x1234567890123456789012345678901234567890",
            "cycle_id": "0x" + "11" * 32,
            "asset_address": "0x0000000000000000000000000000000000000000",
            "cumulative_gross": "0x78",
            "timestamp_cutoff": 99,
        },
        "signature": "0xcc",
    }
    assert accepted.cumulative_gross == 120
    assert accepted.covered == 1


async def test_error_body_message_is_surfaced():
    proxy = proxy_with(
        lambda request: httpx.Response(400, json={"error": "user not registered"})
    )
    with pytest.raises(RpcError, match="user not registered"):
        await proxy.get_public_params()


async def test_public_endpoints_never_consult_the_token_provider():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers.get("authorization")
        return httpx.Response(200, json={"chain_id": 1, "tokens": []})

    async def provider() -> str:
        raise AssertionError("public endpoint triggered a login")

    proxy = proxy_with(handler).with_token_provider(provider)
    await proxy.get_supported_tokens()
    assert seen["auth"] is None


async def test_transport_errors_become_rpc_errors():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("connection refused", request=request)

    proxy = proxy_with(handler)
    with pytest.raises(RpcError, match="request to /core/tokens failed"):
        await proxy.get_supported_tokens()
    with pytest.raises(RpcError, match="request to /core/guarantees failed"):
        await proxy.issue_guarantee(request())
