import json

import httpx
import pytest

from fourmica_sdk.errors import RpcError
from fourmica_sdk.models import ClearingParticipantRole, ClearingSettlementAction
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
        await proxy.issue_guarantee({"claims": {}})
    assert excinfo.value.status_code == 503
    assert calls["n"] == 1


async def test_issue_guarantee_parses_cert_and_sends_bearer():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"claims": "00aa", "signature": "0xbb"})

    proxy = proxy_with(handler).with_bearer_token("token-123")
    cert = await proxy.issue_guarantee({"claims": {"version": "v1"}})
    assert seen["auth"] == "Bearer token-123"
    assert seen["body"] == {"claims": {"version": "v1"}}
    assert cert.claims == "00aa"
    assert cert.signature == "0xbb"


async def test_error_body_message_is_surfaced():
    proxy = proxy_with(
        lambda request: httpx.Response(400, json={"error": "user not registered"})
    )
    with pytest.raises(RpcError, match="user not registered"):
        await proxy.get_public_params()
