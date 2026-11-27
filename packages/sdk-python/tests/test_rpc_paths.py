import importlib.metadata
import importlib.util
import json
import sys
from types import SimpleNamespace

import httpx
import pytest

import fourmica_sdk.rpc as rpc_module
from fourmica_sdk.errors import InvalidParamsError, RpcError
from fourmica_sdk.models import ClearingParticipantRole, ClearingSettlementAction
from fourmica_sdk.rpc import (
    ADMIN_API_KEY_HEADER,
    SDK_CLIENT,
    SDK_CLIENT_HEADER,
    RpcProxy,
)
from fourmica_sdk.utils import ValidationError

BASE = "https://core.example/"
USER = "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A"
SELLER = "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
USDC = "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f"
CYCLE = "0x" + "aa" * 32

POSITION = {
    "cycle_id": CYCLE,
    "cycle_id_text": f"{USDC.lower()}:1700000000",
    "asset_address": USDC.lower(),
    "role": "NET_DEBTOR",
    "amount": "2500000",
    "gross_outgoing": "3000000",
    "gross_incoming": "500000",
    "payment_submission_deadline": 1_700_003_600,
    "payment_finality_deadline": 1_700_007_200,
    "commit_confirmed": True,
}

GUARANTEES_PAGE = {
    "cycle_id": CYCLE,
    "cycle_id_text": "text",
    "asset_address": USDC.lower(),
    "payer": USER.lower(),
    "guarantees": [
        {
            "guarantee_id": "g-1",
            "recipient": SELLER.lower(),
            "req_id": "3",
            "amount": "1000",
            "timestamp": 1_700_000_100,
            "status": "ISSUED",
        }
    ],
    "next_cursor": "cursor-2",
}


class Recorder:
    def __init__(self, *responses) -> None:
        self.responses = list(responses)
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        answer = self.responses.pop(0) if len(self.responses) > 1 else self.responses[0]
        if isinstance(answer, Exception):
            raise answer
        return answer

    @property
    def last(self) -> httpx.Request:
        return self.requests[-1]


def proxy_for(recorder: Recorder, endpoint: str = BASE) -> RpcProxy:
    return RpcProxy(endpoint, transport=httpx.MockTransport(recorder))


def ok(body) -> httpx.Response:
    return httpx.Response(200, json=body)


@pytest.fixture
def sleeps(monkeypatch) -> list[float]:
    slept: list[float] = []

    async def sleep(delay: float) -> None:
        slept.append(delay)

    monkeypatch.setattr(rpc_module, "asyncio", SimpleNamespace(sleep=sleep))
    return slept


def test_the_sdk_version_falls_back_to_unknown_when_the_package_is_not_installed(
    monkeypatch,
):
    def missing(name: str) -> str:
        raise importlib.metadata.PackageNotFoundError(name)

    monkeypatch.setattr(importlib.metadata, "version", missing)
    name = "fourmica_sdk._rpc_without_metadata"
    spec = importlib.util.spec_from_file_location(name, rpc_module.__file__)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    try:
        spec.loader.exec_module(module)
    finally:
        del sys.modules[name]
    assert module.SDK_CLIENT == "py-sdk-4mica/unknown"


def test_the_sdk_client_names_the_installed_package_version():
    installed = importlib.metadata.version("sdk-4mica")
    assert f"py-sdk-4mica/{installed}" == SDK_CLIENT


@pytest.mark.parametrize(
    "endpoint", ["https://core.example/api", "https://core.example/api/"]
)
async def test_paths_are_resolved_under_the_endpoint_with_or_without_a_slash(endpoint):
    recorder = Recorder(ok({"chain_id": 1, "tokens": []}))
    await proxy_for(recorder, endpoint).get_supported_tokens()
    assert str(recorder.last.url) == "https://core.example/api/core/tokens"


async def test_the_proxy_uses_a_twenty_second_timeout_and_closes_on_context_exit():
    recorder = Recorder(ok({"chain_id": 1, "tokens": []}))
    async with proxy_for(recorder) as proxy:
        assert proxy._client.timeout.read == 20.0
        await proxy.get_supported_tokens()
    assert proxy._client.is_closed


async def test_builders_return_the_same_proxy_for_chaining():
    proxy = proxy_for(Recorder(ok({})))

    async def provider() -> str:
        return "t"

    assert proxy.with_admin_api_key("k") is proxy
    assert proxy.with_bearer_token("b") is proxy
    assert proxy.with_token_provider(provider) is proxy


async def test_every_request_identifies_the_sdk():
    recorder = Recorder(ok({"chain_id": 1, "tokens": []}))
    await proxy_for(recorder).get_supported_tokens()
    assert recorder.last.headers[SDK_CLIENT_HEADER] == SDK_CLIENT
    assert recorder.last.headers["user-agent"] == SDK_CLIENT


@pytest.mark.parametrize(
    ("token", "header"),
    [
        ("abc", "Bearer abc"),
        ("Bearer abc", "Bearer abc"),
        ("bearer abc", "bearer abc"),
        ("BEARER abc", "BEARER abc"),
        ("Bearerabc", "Bearer Bearerabc"),
    ],
)
async def test_a_bearer_token_is_sent_with_exactly_one_scheme(token, header):
    recorder = Recorder(ok([]))
    await proxy_for(recorder).with_bearer_token(token).list_recipient_payments(SELLER)
    assert recorder.last.headers["authorization"] == header


async def test_an_empty_bearer_token_sends_no_authorization():
    recorder = Recorder(ok([]))
    await proxy_for(recorder).with_bearer_token("").list_recipient_payments(SELLER)
    assert "authorization" not in recorder.last.headers


async def test_a_request_without_credentials_sends_no_authorization():
    recorder = Recorder(ok([]))
    await proxy_for(recorder).list_recipient_payments(SELLER)
    assert "authorization" not in recorder.last.headers


async def test_the_token_provider_wins_over_a_bearer_token_and_is_asked_per_request():
    tokens = iter(["first", "second"])
    recorder = Recorder(ok([]))

    async def provider() -> str:
        return next(tokens)

    proxy = (
        proxy_for(recorder).with_bearer_token("static").with_token_provider(provider)
    )
    await proxy.list_recipient_payments(SELLER)
    await proxy.list_recipient_payments(SELLER)
    assert [r.headers["authorization"] for r in recorder.requests] == [
        "Bearer first",
        "Bearer second",
    ]


async def test_a_provider_that_yields_no_token_sends_no_authorization():
    recorder = Recorder(ok([]))

    async def provider() -> str:
        return ""

    proxy = (
        proxy_for(recorder).with_bearer_token("static").with_token_provider(provider)
    )
    await proxy.list_recipient_payments(SELLER)
    assert "authorization" not in recorder.last.headers


async def test_a_failing_token_provider_stops_the_request_before_it_is_sent():
    recorder = Recorder(ok([]))

    async def provider() -> str:
        raise RuntimeError("login failed")

    proxy = proxy_for(recorder).with_token_provider(provider)
    with pytest.raises(RuntimeError, match="login failed"):
        await proxy.list_recipient_payments(SELLER)
    assert recorder.requests == []


async def test_suspension_posts_the_flag_with_the_admin_key_and_the_bearer_token():
    recorder = Recorder(
        ok({"user_address": USER, "suspended": True, "updated_at": 1_700_000_000})
    )
    proxy = proxy_for(recorder).with_admin_api_key("admin-key").with_bearer_token("t")
    status = await proxy.update_user_suspension(USER, suspended=True)
    assert status.user_address == USER
    assert status.suspended is True
    assert status.updated_at == 1_700_000_000
    request = recorder.last
    assert request.method == "POST"
    assert request.url.path == f"/core/users/{USER}/suspension"
    assert json.loads(request.content) == {"suspended": True}
    assert request.headers[ADMIN_API_KEY_HEADER] == "admin-key"
    assert request.headers["authorization"] == "Bearer t"


async def test_lifting_a_suspension_reads_the_camel_case_answer():
    recorder = Recorder(
        ok({"userAddress": USER, "suspended": False, "updatedAt": "1700000001"})
    )
    status = (
        await proxy_for(recorder)
        .with_admin_api_key("k")
        .update_user_suspension(USER, suspended=False)
    )
    assert json.loads(recorder.last.content) == {"suspended": False}
    assert status.suspended is False
    assert status.updated_at == 1_700_000_001


async def test_suspension_without_an_admin_key_sends_no_admin_header():
    recorder = Recorder(
        httpx.Response(
            401, json={"error": "admin key required", "code": "UNAUTHORIZED"}
        )
    )
    with pytest.raises(RpcError) as raised:
        await proxy_for(recorder).update_user_suspension(USER, suspended=True)
    assert ADMIN_API_KEY_HEADER not in recorder.last.headers
    assert raised.value.status_code == 401
    assert raised.value.code == "UNAUTHORIZED"


async def test_an_empty_admin_key_is_not_sent():
    recorder = Recorder(ok({"user_address": USER, "suspended": True, "updated_at": 1}))
    await (
        proxy_for(recorder)
        .with_admin_api_key("")
        .update_user_suspension(USER, suspended=True)
    )
    assert ADMIN_API_KEY_HEADER not in recorder.last.headers


async def test_the_admin_key_is_never_sent_on_ordinary_requests():
    recorder = Recorder(ok([]))
    proxy = proxy_for(recorder).with_admin_api_key("admin-key")
    await proxy.list_recipient_payments(SELLER)
    assert ADMIN_API_KEY_HEADER not in recorder.last.headers


async def test_a_suspension_is_not_retried_on_a_server_error(sleeps):
    recorder = Recorder(httpx.Response(503, json={"error": "draining"}))
    with pytest.raises(RpcError, match="503: draining"):
        await proxy_for(recorder).update_user_suspension(USER, suspended=True)
    assert len(recorder.requests) == 1
    assert sleeps == []


@pytest.mark.parametrize("status", [429, 500, 502, 503, 504])
async def test_a_get_gives_up_after_three_attempts_with_exponential_backoff(
    sleeps, status
):
    recorder = Recorder(httpx.Response(status, json={"error": f"busy {status}"}))
    with pytest.raises(RpcError) as raised:
        await proxy_for(recorder).get_supported_tokens()
    assert raised.value.status_code == status
    assert str(raised.value) == f"{status}: busy {status}"
    assert len(recorder.requests) == 3
    assert sleeps == [0.5, 1.0]


@pytest.mark.parametrize("status", [400, 401, 403, 404, 409, 422, 501, 505])
async def test_a_get_is_not_retried_on_a_status_outside_the_retryable_set(
    sleeps, status
):
    recorder = Recorder(httpx.Response(status, json={"error": "no"}))
    with pytest.raises(RpcError) as raised:
        await proxy_for(recorder).get_supported_tokens()
    assert raised.value.status_code == status
    assert len(recorder.requests) == 1
    assert sleeps == []


async def test_a_get_recovers_when_a_retry_succeeds_and_reports_the_last_answer(sleeps):
    recorder = Recorder(
        httpx.Response(429, text="slow down"),
        httpx.Response(502, text="bad gateway"),
        ok({"chain_id": 5, "tokens": []}),
    )
    tokens = await proxy_for(recorder).get_supported_tokens()
    assert tokens.chain_id == 5
    assert sleeps == [0.5, 1.0]


async def test_the_final_retry_error_is_the_last_answer_not_the_first(sleeps):
    recorder = Recorder(
        httpx.Response(429, text="slow down"),
        httpx.Response(500, text="crash"),
        httpx.Response(503, text="draining"),
    )
    with pytest.raises(RpcError, match="503: draining") as raised:
        await proxy_for(recorder).get_supported_tokens()
    assert raised.value.status_code == 503


async def test_a_retry_that_turns_into_a_client_error_stops_retrying(sleeps):
    recorder = Recorder(
        httpx.Response(503, text="draining"),
        httpx.Response(404, json={"error": "gone"}),
    )
    with pytest.raises(RpcError, match="404: gone"):
        await proxy_for(recorder).get_supported_tokens()
    assert len(recorder.requests) == 2
    assert sleeps == [0.5]


async def test_each_retry_asks_the_token_provider_again(sleeps):
    asked: list[int] = []
    recorder = Recorder(httpx.Response(503, text="x"), ok([]))

    async def provider() -> str:
        asked.append(1)
        return f"t{len(asked)}"

    await (
        proxy_for(recorder)
        .with_token_provider(provider)
        .list_recipient_payments(SELLER)
    )
    assert [r.headers["authorization"] for r in recorder.requests] == [
        "Bearer t1",
        "Bearer t2",
    ]


@pytest.mark.parametrize(
    "error",
    [
        httpx.ConnectError("refused"),
        httpx.ReadTimeout("read timed out"),
        httpx.ConnectTimeout("connect timed out"),
        httpx.RemoteProtocolError("peer closed"),
    ],
    ids=["connect", "read-timeout", "connect-timeout", "protocol"],
)
async def test_a_transport_failure_on_a_get_is_raised_at_once_without_retry(
    sleeps, error
):
    recorder = Recorder(error)
    with pytest.raises(RpcError, match="request to /core/tokens failed") as raised:
        await proxy_for(recorder).get_supported_tokens()
    assert raised.value.status_code is None
    assert raised.value.__cause__ is error
    assert len(recorder.requests) == 1
    assert sleeps == []


async def test_invalid_json_in_a_success_is_raised_without_status_or_retry(sleeps):
    recorder = Recorder(httpx.Response(200, text="<html>"))
    with pytest.raises(
        RpcError, match=r"invalid JSON response from https://core.example/core/tokens"
    ) as raised:
        await proxy_for(recorder).get_supported_tokens()
    assert raised.value.status_code is None
    assert len(recorder.requests) == 1


@pytest.mark.parametrize(
    ("response", "message", "code", "details"),
    [
        (
            httpx.Response(
                409,
                json={"error": "e", "message": "m", "code": "C", "details": {"x": 1}},
            ),
            "409: e",
            "C",
            {"x": 1},
        ),
        (
            httpx.Response(400, json={"message": "only message"}),
            "400: only message",
            None,
            None,
        ),
        (
            httpx.Response(400, json={"error": "", "message": "fallback"}),
            "400: fallback",
            None,
            None,
        ),
        (
            httpx.Response(400, json={"code": 7, "details": [1]}),
            "400: {'code': 7, 'details': [1]}",
            None,
            [1],
        ),
        (httpx.Response(400, json=["a"]), "400: unknown error", None, None),
        (
            httpx.Response(400, json="plain json string"),
            "400: plain json string",
            None,
            None,
        ),
        (httpx.Response(400, text="  spaced  "), "400: spaced", None, None),
        (httpx.Response(400, text=""), "400: unknown error", None, None),
        (httpx.Response(400, json=None), "400: unknown error", None, None),
    ],
    ids=[
        "error-wins",
        "message",
        "empty-error",
        "non-string-code",
        "list",
        "json-string",
        "text",
        "empty",
        "no-body",
    ],
)
async def test_a_failure_maps_to_an_rpc_error_with_message_code_and_details(
    response, message, code, details
):
    recorder = Recorder(response)
    with pytest.raises(RpcError) as raised:
        await proxy_for(recorder).get_public_params()
    assert str(raised.value) == message
    assert raised.value.status_code == response.status_code
    assert raised.value.code == code
    assert raised.value.details == details


async def test_a_post_transport_failure_names_the_path():
    recorder = Recorder(httpx.ConnectError("refused"))
    with pytest.raises(
        RpcError, match=f"request to /core/users/{USER}/suspension failed"
    ):
        await proxy_for(recorder).update_user_suspension(USER, suspended=True)


async def test_health_returns_a_healthy_report_without_credentials():
    recorder = Recorder(ok({"status": "ok"}))

    async def provider() -> str:
        raise AssertionError("health must not log in")

    proxy = proxy_for(recorder).with_token_provider(provider).with_admin_api_key("k")
    assert await proxy.health() == {"status": "ok"}
    assert recorder.last.url.path == "/core/health"
    assert "authorization" not in recorder.last.headers
    assert ADMIN_API_KEY_HEADER not in recorder.last.headers
    assert recorder.last.headers[SDK_CLIENT_HEADER] == SDK_CLIENT


async def test_health_returns_an_unhealthy_report_instead_of_raising(sleeps):
    report = {"status": "unhealthy", "checks": {"db": "down"}}
    recorder = Recorder(httpx.Response(503, json=report))
    assert await proxy_for(recorder).health() == report
    assert len(recorder.requests) == 1
    assert sleeps == []


@pytest.mark.parametrize(
    ("response", "message"),
    [
        (httpx.Response(503, text="maintenance"), "503: maintenance"),
        (httpx.Response(503, json=["down"]), "503: unknown error"),
        (httpx.Response(503, text=""), "503: unknown error"),
        (httpx.Response(500, json={"status": "broken"}), "500: {'status': 'broken'}"),
        (
            httpx.Response(404, json={"error": "no health route"}),
            "404: no health route",
        ),
    ],
    ids=["503-text", "503-list", "503-empty", "500-object", "404"],
)
async def test_health_raises_for_anything_but_a_report_from_an_unavailable_core(
    sleeps, response, message
):
    recorder = Recorder(response)
    with pytest.raises(RpcError) as raised:
        await proxy_for(recorder).health()
    assert str(raised.value) == message
    assert raised.value.status_code == response.status_code
    assert len(recorder.requests) == 1


async def test_health_reports_a_transport_failure():
    recorder = Recorder(httpx.ReadTimeout("slow"))
    with pytest.raises(RpcError, match="request to /core/health failed: slow"):
        await proxy_for(recorder).health()


async def test_health_returns_whatever_json_a_healthy_core_sends():
    recorder = Recorder(ok(["ok"]))
    assert await proxy_for(recorder).health() == ["ok"]


async def test_positions_are_listed_in_core_order_from_snake_and_camel_case():
    camel = {
        "cycleId": "0x" + "bb" * 32,
        "cycleIdText": "t2",
        "assetAddress": USDC.lower(),
        "role": "NET_CREDITOR",
        "amount": "7",
        "grossOutgoing": "0",
        "grossIncoming": "7",
        "paymentSubmissionDeadline": "1700000500",
        "paymentFinalityDeadline": "1700000900",
        "commitConfirmed": False,
    }
    recorder = Recorder(ok({"positions": [POSITION, camel]}))
    positions = await proxy_for(recorder).list_participant_positions(USER)
    assert recorder.last.url.path == f"/core/participants/{USER}/positions"
    assert [p.role for p in positions] == [
        ClearingParticipantRole.NET_DEBTOR,
        ClearingParticipantRole.NET_CREDITOR,
    ]
    assert positions[0].amount == 2_500_000
    assert positions[0].asset_address == USDC
    assert positions[1].cycle_id == "0x" + "bb" * 32
    assert positions[1].payment_finality_deadline == 1_700_000_900
    assert positions[1].commit_confirmed is False


@pytest.mark.parametrize(
    "body",
    [{}, {"positions": None}, {"positions": {"a": POSITION}}, [POSITION], None, "x"],
    ids=["no-key", "null", "object", "bare-list", "null-body", "string"],
)
async def test_positions_in_an_unexpected_shape_read_as_none(body):
    recorder = Recorder(httpx.Response(200, content=json.dumps(body).encode()))
    assert await proxy_for(recorder).list_participant_positions(USER) == []


async def test_a_malformed_position_is_refused_not_skipped():
    recorder = Recorder(
        ok({"positions": [POSITION, {**POSITION, "role": "BYSTANDER"}]})
    )
    with pytest.raises(InvalidParamsError, match="unknown role BYSTANDER"):
        await proxy_for(recorder).list_participant_positions(USER)


async def test_payer_guarantees_send_a_normalized_cycle_and_no_optional_params():
    recorder = Recorder(ok(GUARANTEES_PAGE))
    page = await proxy_for(recorder).list_payer_guarantees(USER, "0X" + "AA" * 32)
    assert recorder.last.url.path == f"/core/payers/{USER}/guarantees"
    assert dict(recorder.last.url.params) == {"cycle_id": CYCLE}
    assert page.payer == USER
    assert page.next_cursor == "cursor-2"
    assert [(g.req_id, g.amount, g.recipient) for g in page.guarantees] == [
        (3, 1000, SELLER)
    ]


@pytest.mark.parametrize(
    ("limit", "after", "expected"),
    [
        (0, None, {"limit": "0"}),
        (500, "", {"limit": "500", "after": ""}),
        (None, "cursor-2", {"after": "cursor-2"}),
    ],
)
async def test_payer_guarantees_forward_limit_and_cursor_when_given(
    limit, after, expected
):
    recorder = Recorder(ok({**GUARANTEES_PAGE, "next_cursor": None}))
    page = await proxy_for(recorder).list_payer_guarantees(
        USER, CYCLE, limit=limit, after=after
    )
    assert dict(recorder.last.url.params) == {"cycle_id": CYCLE, **expected}
    assert page.next_cursor is None


@pytest.mark.parametrize("cycle_id", ["", "0x1234", "0x" + "zz" * 32, "cycle:1"])
async def test_payer_guarantees_refuse_a_cycle_that_is_not_bytes32_before_calling(
    cycle_id,
):
    recorder = Recorder(ok(GUARANTEES_PAGE))
    with pytest.raises(ValidationError, match="invalid bytes32"):
        await proxy_for(recorder).list_payer_guarantees(USER, cycle_id)
    assert recorder.requests == []


async def test_a_checkpoint_batch_refuses_a_malformed_cycle_before_calling():
    recorder = Recorder(ok({}))
    with pytest.raises(ValidationError, match="invalid bytes32"):
        await proxy_for(recorder).get_checkpoint_batch(USER, USDC, cycle_id="0x12")
    assert recorder.requests == []


@pytest.mark.parametrize("body", [b"null", b"[]"])
async def test_recipient_payments_read_null_or_empty_as_no_payments(body):
    recorder = Recorder(httpx.Response(200, content=body))
    assert await proxy_for(recorder).list_recipient_payments(SELLER) == []
    assert recorder.last.url.path == f"/core/recipients/{SELLER}/payments"


async def test_recipient_payments_read_snake_and_camel_case_items():
    snake = {
        "user_address": USER,
        "recipient_address": SELLER,
        "tx_hash": "0x" + "cd" * 32,
        "amount": "0x10",
        "verified": True,
        "finalized": False,
        "failed": False,
        "created_at": 5,
    }
    camel = {
        "userAddress": USER,
        "recipientAddress": SELLER,
        "txHash": "0x" + "ef" * 32,
        "amount": 2**256 - 1,
        "verified": 0,
        "finalized": 1,
        "failed": 1,
        "createdAt": "6",
    }
    payments = await proxy_for(Recorder(ok([snake, camel]))).list_recipient_payments(
        SELLER
    )
    assert [
        (p.tx_hash, p.amount, p.verified, p.finalized, p.failed, p.created_at)
        for p in payments
    ] == [
        ("0x" + "cd" * 32, 16, True, False, False, 5),
        ("0x" + "ef" * 32, 2**256 - 1, False, True, True, 6),
    ]


async def test_an_asset_balance_reads_camel_case_and_u256_strings():
    recorder = Recorder(
        ok(
            {
                "userAddress": USER,
                "assetAddress": USDC,
                "total": "1000000",
                "locked": "250000",
                "version": 3,
                "updatedAt": 1_700_000_000,
            }
        )
    )
    balance = await proxy_for(recorder).get_user_asset_balance(USER, USDC)
    assert recorder.last.url.path == f"/core/users/{USER}/assets/{USDC}"
    assert (balance.total, balance.locked, balance.version) == (1_000_000, 250_000, 3)
    assert balance.updated_at == 1_700_000_000


@pytest.mark.parametrize(
    ("call", "action"),
    [
        (lambda p: p.get_clearing_pay_net_debit_action(CYCLE, USER), "pay_net_debit"),
        (
            lambda p: p.get_clearing_claim_net_credit_action(CYCLE, USER),
            "claim_net_credit",
        ),
        (
            lambda p: p.get_clearing_settlement_action(CYCLE, USER, "claim_net_credit"),
            "claim_net_credit",
        ),
    ],
    ids=["pay", "claim", "string-action"],
)
async def test_clearing_actions_name_the_action_in_the_query(call, action):
    recorder = Recorder(httpx.Response(404, json={"error": "no action"}))
    with pytest.raises(RpcError, match="404: no action"):
        await call(proxy_for(recorder))
    assert recorder.last.url.path == (
        f"/core/cycles/{CYCLE}/participants/{USER}/clearing-action"
    )
    assert dict(recorder.last.url.params) == {"action": action}


async def test_an_unknown_clearing_action_is_refused_before_calling():
    recorder = Recorder(ok({}))
    with pytest.raises(ValueError, match="withdraw"):
        await proxy_for(recorder).get_clearing_settlement_action(
            CYCLE, USER, "withdraw"
        )
    assert recorder.requests == []
    assert (
        ClearingSettlementAction("pay_net_debit")
        is ClearingSettlementAction.PAY_NET_DEBIT
    )
