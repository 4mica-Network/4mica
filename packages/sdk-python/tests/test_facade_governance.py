import asyncio
import base64
import json
from collections.abc import Callable

import httpx
import pytest
from facade_helpers import SELLER, USDC, USER, FakeClient, fake_session

from fourmica_sdk.app.client import AppError
from fourmica_sdk.errors import (
    SpendAccountingError,
    SpendAuthorizationError,
    SpendLimitError,
)
from fourmica_sdk.facade import governance
from fourmica_sdk.facade.fetch import FetchContext, SpendLimiter, paying_fetch
from fourmica_sdk.facade.governance import SpendGovernor
from fourmica_sdk.facade.models import GovernanceOptions, PaymentRecord, SpendLimits
from fourmica_sdk.facade.protocols import X402Protocol

URL = "https://api.example.com/data"
API = "https://api.test"
X402 = X402Protocol()


def b64(value) -> str:
    return base64.b64encode(json.dumps(value).encode()).decode()


def v2_challenge(amount: str = "10000") -> httpx.Response:
    required = {
        "x402Version": 2,
        "resource": {"url": URL},
        "accepts": [
            {
                "scheme": "4mica-credit",
                "network": "eip155:84532",
                "asset": USDC,
                "amount": amount,
                "payTo": SELLER,
            }
        ],
    }
    return httpx.Response(402, headers={"PAYMENT-REQUIRED": b64(required)}, json={})


def authorization(**overrides) -> dict:
    return {
        "id": "auth_1",
        "status": "RESERVED",
        "deniedReason": None,
        "policyId": None,
        "approvalRequestId": None,
        "expiresAt": "2026-11-27T00:10:00.000Z",
        "amount": "0.01",
        "network": "BASE_SEPOLIA",
        "assetAddress": USDC.lower(),
        **overrides,
    }


def ok(body: dict, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=body)


Answer = Callable[[], httpx.Response]


class Api:
    def __init__(
        self,
        authorize: Answer | None = None,
        poll: Answer | None = None,
        consume: Answer | None = None,
        release: Answer | None = None,
    ) -> None:
        self.calls: list[tuple[str, str, object]] = []
        self.answers = {
            "authorize": authorize or (lambda: ok(authorization())),
            "poll": poll or (lambda: ok(authorization())),
            "consume": consume or (lambda: ok(authorization(status="CONSUMED"))),
            "release": release or (lambda: ok(authorization(status="RELEASED"))),
        }
        self.http = httpx.AsyncClient(transport=httpx.MockTransport(self._handle))

    def _handle(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        body = json.loads(request.content) if request.content else None
        self.calls.append((request.method, path, body))
        assert request.headers["authorization"] == "Bearer 4mica_sk_test"
        if path == "/v1/spend/authorize":
            return self.answers["authorize"]()
        if request.method == "GET":
            return self.answers["poll"]()
        if path.endswith("/consume"):
            return self.answers["consume"]()
        return self.answers["release"]()

    def paths(self) -> list[str]:
        return [f"{method} {path}" for method, path, _ in self.calls]

    def count(self, suffix: str) -> int:
        return sum(path.endswith(suffix) for path in self.paths())


def is_paid(request: httpx.Request) -> bool:
    return "PAYMENT-SIGNATURE" in request.headers


class Seller:
    def __init__(self, answer: Answer | None = None) -> None:
        self.calls: list[httpx.Request] = []
        self.answer = answer or (lambda: httpx.Response(200, text="ok"))
        self.http = httpx.AsyncClient(transport=httpx.MockTransport(self._handle))

    def _handle(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        return self.answer() if is_paid(request) else v2_challenge()

    def signed_req_id(self) -> str:
        envelope = json.loads(
            base64.b64decode(self.calls[1].headers["PAYMENT-SIGNATURE"])
        )
        return envelope["payload"]["payload"]["req_id"]


def governor(api: Api, **options) -> SpendGovernor:
    return SpendGovernor(
        GovernanceOptions(
            api_key="4mica_sk_test",
            base_url=API,
            poll_interval_secs=0.001,
            **options,
        ),
        api.http,
    )


def context(
    http: httpx.AsyncClient,
    spend_governor: SpendGovernor | None,
    limiter: SpendLimiter | None = None,
    protocols=None,
):
    session = fake_session(FakeClient())
    records: list[PaymentRecord] = []
    ctx = FetchContext(
        http=http,
        protocols=protocols or [X402],
        session_for=lambda caip2: session if caip2 == session.caip2 else None,
        limiter=limiter or SpendLimiter(),
        record=lambda response, payment: records.append(payment),
        governor=spend_governor,
    )
    return ctx, records


def capped() -> SpendLimiter:
    return SpendLimiter(SpendLimits(total="0.01 USDC"))


async def assert_total_still_counted(limiter: SpendLimiter) -> None:
    again, _ = context(Seller().http, None, limiter)
    with pytest.raises(SpendLimitError) as raised:
        await paying_fetch(again, "GET", URL)
    assert raised.value.limit == "total"


async def assert_total_freed(limiter: SpendLimiter) -> None:
    again, _ = context(Seller().http, None, limiter)
    assert (await paying_fetch(again, "GET", URL)).status_code == 200


@pytest.fixture
def delays(monkeypatch) -> list[float]:
    slept: list[float] = []

    async def sleep(delay: float) -> None:
        slept.append(delay)

    monkeypatch.setattr(governance, "_sleep", sleep)
    return slept


async def test_asks_before_signing_and_consumes_with_the_signed_req_id():
    api = Api()
    seller = Seller()
    spend_governor = governor(api, agent_id="agent_1")
    ctx, records = context(seller.http, spend_governor)

    response = await paying_fetch(ctx, "GET", URL)

    assert response.text == "ok"
    assert len(records) == 1
    assert api.paths() == [
        "POST /v1/spend/authorize",
        "POST /v1/spend/authorizations/auth_1/consume",
    ]
    assert api.calls[0][2] == {
        "network": "BASE_SEPOLIA",
        "assetAddress": USDC.lower(),
        "amount": "0.01",
        "payerAddress": USER,
        "recipientAddress": SELLER,
        "agentId": "agent_1",
    }
    assert api.calls[1][2] == {"reqId": seller.signed_req_id()}
    outcome = spend_governor.outcome(response)
    assert (outcome.authorization_id, outcome.accounting) == ("auth_1", "recorded")


async def test_refuses_a_denied_payment_without_signing_and_frees_the_session_limit():
    api = Api(
        authorize=lambda: ok(authorization(status="DENIED", deniedReason="daily_limit"))
    )
    seller = Seller()
    limiter = capped()
    ctx, records = context(seller.http, governor(api), limiter)

    with pytest.raises(SpendAuthorizationError) as raised:
        await paying_fetch(ctx, "GET", URL)

    assert raised.value.reason == "denied"
    assert raised.value.denied_reason == "daily_limit"
    assert raised.value.authorization_id == "auth_1"
    assert "daily_limit" in str(raised.value)
    assert len(seller.calls) == 1
    assert records == []
    await assert_total_freed(limiter)


async def test_names_the_status_when_a_refusal_gives_no_reason():
    api = Api(authorize=lambda: ok(authorization(status="EXPIRED")))
    ctx, _ = context(Seller().http, governor(api))

    with pytest.raises(SpendAuthorizationError) as raised:
        await paying_fetch(ctx, "GET", URL)

    assert raised.value.denied_reason == "expired"


async def test_waits_for_an_approval_and_pays_once_it_is_reserved():
    polls = 0

    def poll() -> httpx.Response:
        nonlocal polls
        polls += 1
        status = "PENDING_APPROVAL" if polls < 3 else "RESERVED"
        return ok(authorization(status=status, approvalRequestId="apr_1"))

    api = Api(
        authorize=lambda: ok(
            authorization(status="PENDING_APPROVAL", approvalRequestId="apr_1")
        ),
        poll=poll,
    )
    ctx, records = context(Seller().http, governor(api))

    await paying_fetch(ctx, "GET", URL)

    assert polls == 3
    assert len(records) == 1
    assert api.paths()[1] == "GET /v1/spend/authorizations/auth_1"
    assert api.paths()[-1] == "POST /v1/spend/authorizations/auth_1/consume"


async def test_reports_a_rejected_approval_as_denied():
    api = Api(
        authorize=lambda: ok(authorization(status="PENDING_APPROVAL")),
        poll=lambda: ok(
            authorization(status="DENIED", deniedReason="approval_rejected")
        ),
    )
    ctx, _ = context(Seller().http, governor(api))

    with pytest.raises(SpendAuthorizationError) as raised:
        await paying_fetch(ctx, "GET", URL)

    assert raised.value.reason == "denied"
    assert raised.value.denied_reason == "approval_rejected"


@pytest.mark.parametrize("approval_request_id", ["apr_1", None])
async def test_releases_and_gives_up_when_the_approval_does_not_come_in_time(
    approval_request_id,
):
    def pending() -> httpx.Response:
        return ok(
            authorization(
                status="PENDING_APPROVAL", approvalRequestId=approval_request_id
            )
        )

    api = Api(authorize=pending, poll=pending)
    seller = Seller()
    ctx, _ = context(seller.http, governor(api, approval_timeout_secs=0.005))

    with pytest.raises(SpendAuthorizationError) as raised:
        await paying_fetch(ctx, "GET", URL)

    assert raised.value.reason == "approval_timeout"
    assert raised.value.approval_request_id == approval_request_id
    assert str(raised.value).endswith(
        "approval apr_1" if approval_request_id else "approval"
    )
    assert api.paths()[-1] == "POST /v1/spend/authorizations/auth_1/release"
    assert len(seller.calls) == 1


@pytest.mark.parametrize("status", [500, 502, 503, 400, 409])
async def test_consumes_and_keeps_the_amount_counted_when_the_seller_answers_status(
    status,
):
    api = Api()
    seller = Seller(lambda: httpx.Response(status, text="boom"))
    limiter = capped()
    ctx, records = context(seller.http, governor(api), limiter)

    response = await paying_fetch(ctx, "GET", URL)

    assert response.status_code == status
    assert records == []
    assert api.paths() == [
        "POST /v1/spend/authorize",
        "POST /v1/spend/authorizations/auth_1/consume",
    ]
    assert api.calls[1][2] == {"reqId": seller.signed_req_id()}
    await assert_total_still_counted(limiter)


async def test_consumes_when_the_seller_says_it_did_not_settle_but_does_not_402():
    api = Api()
    seller = Seller(
        lambda: httpx.Response(
            200, text="ok", headers={"PAYMENT-RESPONSE": b64({"success": False})}
        )
    )
    ctx, records = context(seller.http, governor(api))

    await paying_fetch(ctx, "GET", URL)

    assert records == []
    assert api.paths()[-1] == "POST /v1/spend/authorizations/auth_1/consume"


async def test_releases_when_the_seller_answers_402_to_the_payment():
    api = Api()
    spend_governor = governor(api)
    ctx, records = context(Seller(v2_challenge).http, spend_governor)

    response = await paying_fetch(ctx, "GET", URL)

    assert response.status_code == 402
    assert records == []
    assert api.paths() == [
        "POST /v1/spend/authorize",
        "POST /v1/spend/authorizations/auth_1/release",
    ]
    assert spend_governor.outcome(response).accounting == "recorded"


async def test_one_authorization_covers_a_payment_paid_again_after_a_checkpoint():
    refusal = {
        "success": False,
        "errorReason": "invalid_4mica_credit_checkpoint_required",
    }
    answers = [
        httpx.Response(402, headers={"PAYMENT-RESPONSE": b64(refusal)}, json={}),
        httpx.Response(200, text="ok"),
    ]
    api = Api()
    seller = Seller(lambda: answers.pop(0))
    ctx, records = context(seller.http, governor(api))

    response = await paying_fetch(ctx, "GET", URL)

    assert response.status_code == 200
    assert len(records) == 1
    assert [is_paid(call) for call in seller.calls] == [False, True, True]
    assert api.paths() == [
        "POST /v1/spend/authorize",
        "POST /v1/spend/authorizations/auth_1/consume",
    ]
    assert api.calls[1][2] == {"reqId": seller.signed_req_id()}


async def test_releases_and_frees_the_session_limit_when_signing_fails():
    api = Api()
    seller = Seller()
    limiter = capped()
    ctx, _ = context(seller.http, governor(api), limiter)
    session = ctx.session_for("eip155:84532")
    session.client.sign_payment.side_effect = RuntimeError("signer offline")

    with pytest.raises(Exception, match="signer offline"):
        await paying_fetch(ctx, "GET", URL)

    assert len(seller.calls) == 1
    assert api.paths()[-1] == "POST /v1/spend/authorizations/auth_1/release"
    await assert_total_freed(limiter)


@pytest.mark.parametrize(
    "failure",
    [
        httpx.ReadTimeout("timed out"),
        httpx.ConnectError("network down"),
        asyncio.CancelledError(),
    ],
)
async def test_consumes_with_the_signed_req_id_when_the_paid_request_fails(failure):
    def fail() -> httpx.Response:
        raise failure

    api = Api()
    seller = Seller(fail)
    limiter = capped()
    ctx, _ = context(seller.http, governor(api), limiter)

    with pytest.raises(type(failure)):
        await paying_fetch(ctx, "GET", URL)

    assert api.paths() == [
        "POST /v1/spend/authorize",
        "POST /v1/spend/authorizations/auth_1/consume",
    ]
    assert api.calls[1][2] == {"reqId": seller.signed_req_id()}
    await assert_total_still_counted(limiter)


async def test_fails_closed_when_the_api_refuses_the_request():
    api = Api(
        authorize=lambda: ok(
            {"error": "payer_not_owned", "message": "not your wallet"}, 403
        )
    )
    seller = Seller()
    limiter = capped()
    ctx, _ = context(seller.http, governor(api), limiter)

    with pytest.raises(AppError) as raised:
        await paying_fetch(ctx, "GET", URL)

    assert (raised.value.status, raised.value.code) == (403, "payer_not_owned")
    assert len(seller.calls) == 1
    await assert_total_freed(limiter)


async def test_keeps_the_session_limits_ahead_of_the_api():
    api = Api()
    limiter = SpendLimiter(SpendLimits(per_payment="0.001 USDC"))
    ctx, _ = context(Seller().http, governor(api), limiter)

    with pytest.raises(SpendLimitError):
        await paying_fetch(ctx, "GET", URL)

    assert api.calls == []


async def test_asks_for_the_native_asset_without_an_address():
    api = Api()
    spend_governor = governor(api)
    session = fake_session(FakeClient())
    native = await session.token(session.native_symbol)
    (terms,) = X402.terms(v2_challenge())

    await spend_governor.authorize(
        terms=terms, asset=native, payer_address=USER, url=URL
    )

    assert api.calls[0][2]["assetAddress"] is None
    assert api.calls[0][2]["amount"] == "0.00000000000001"
    assert "agentId" not in api.calls[0][2]


def test_reads_no_req_id_from_headers_without_a_readable_payment():
    assert X402.req_id({}) is None
    assert X402.req_id({"X-PAYMENT": "not base64"}) is None


async def test_reports_the_consume_as_recorded_when_it_succeeds_first_time():
    api = Api()
    errors: list[SpendAccountingError] = []
    spend_governor = governor(api, on_accounting_error=errors.append)
    ctx, _ = context(Seller().http, spend_governor)

    response = await paying_fetch(ctx, "GET", URL)

    assert spend_governor.outcome(response).accounting == "recorded"
    assert api.count("/consume") == 1
    assert errors == []


def network_error() -> httpx.Response:
    raise httpx.ConnectError("fetch failed")


@pytest.mark.parametrize(
    "failure",
    [
        lambda: ok({"error": "unavailable"}, 503),
        lambda: ok({"error": "rate_limited"}, 429),
        network_error,
    ],
)
async def test_retries_the_consume_with_jittered_backoff_and_records_it(
    failure, delays
):
    attempts = 0

    def consume() -> httpx.Response:
        nonlocal attempts
        attempts += 1
        return failure() if attempts < 3 else ok(authorization(status="CONSUMED"))

    api = Api(consume=consume)
    errors: list[SpendAccountingError] = []
    spend_governor = governor(api, on_accounting_error=errors.append)
    ctx, records = context(Seller().http, spend_governor)

    response = await paying_fetch(ctx, "GET", URL)

    assert attempts == 3
    bodies = [body for _, path, body in api.calls if path.endswith("/consume")]
    assert len({json.dumps(body) for body in bodies}) == 1
    assert spend_governor.outcome(response).accounting == "recorded"
    assert len(records) == 1
    assert errors == []
    assert len(delays) == 2
    assert 0.125 <= delays[0] <= 0.25
    assert 0.25 <= delays[1] <= 0.5


async def test_gives_up_after_three_transient_failures_and_reports_it(delays):
    api = Api(consume=lambda: ok({"error": "unavailable"}, 503))
    errors: list[SpendAccountingError] = []
    spend_governor = governor(api, on_accounting_error=errors.append)
    ctx, _ = context(Seller().http, spend_governor)

    response = await paying_fetch(ctx, "GET", URL)

    assert api.count("/consume") == 3
    assert response.text == "ok"
    assert spend_governor.outcome(response).accounting == "failed"
    (error,) = errors
    assert (error.transition, error.authorization_id, error.accounting) == (
        "consume",
        "auth_1",
        "failed",
    )
    assert error.__cause__.status == 503
    assert str(error).startswith("could not consume spend authorization auth_1: ")


async def test_records_a_failed_consume_without_an_accounting_callback():
    api = Api(consume=lambda: ok({"error": "conflict"}, 409))
    spend_governor = governor(api)
    ctx, _ = context(Seller().http, spend_governor)

    response = await paying_fetch(ctx, "GET", URL)

    assert response.text == "ok"
    assert spend_governor.outcome(response).accounting == "failed"


async def test_returns_the_paid_response_even_when_the_accounting_callback_raises():
    def callback(error: SpendAccountingError) -> None:
        raise RuntimeError("callback bug")

    api = Api(consume=lambda: ok({"error": "conflict"}, 409))
    paid = httpx.Response(200, text="ok")
    spend_governor = governor(api, on_accounting_error=callback)
    ctx, _ = context(Seller(lambda: paid).http, spend_governor)

    response = await paying_fetch(ctx, "GET", URL)

    assert response is paid
    assert spend_governor.outcome(response).accounting == "failed"


@pytest.mark.parametrize("status", [400, 404, 409])
async def test_does_not_retry_a_client_error_and_still_returns_the_paid_response(
    status,
):
    api = Api(consume=lambda: ok({"error": "conflict"}, status))
    errors: list[SpendAccountingError] = []
    paid = httpx.Response(200, text="ok")
    seller = Seller(lambda: paid)
    spend_governor = governor(api, on_accounting_error=errors.append)
    ctx, records = context(seller.http, spend_governor)

    response = await paying_fetch(ctx, "GET", URL)

    assert response is paid
    assert len(records) == 1
    assert api.count("/consume") == 1
    assert spend_governor.outcome(response).accounting == "failed"
    (error,) = errors
    assert error.accounting == "failed"
    assert error.req_id == seller.signed_req_id()


async def test_stops_retrying_once_cancelled_and_reports_the_consume_as_pending(
    monkeypatch,
):
    async def cancelled(delay: float) -> None:
        raise asyncio.CancelledError

    monkeypatch.setattr(governance, "_sleep", cancelled)
    api = Api(consume=lambda: ok({"error": "unavailable"}, 503))
    errors: list[SpendAccountingError] = []
    ctx, _ = context(Seller().http, governor(api, on_accounting_error=errors.append))

    with pytest.raises(asyncio.CancelledError):
        await paying_fetch(ctx, "GET", URL)

    assert api.count("/consume") == 1
    (error,) = errors
    assert error.accounting == "pending"
    assert "before the request was cancelled" in str(error)


async def test_reports_a_consume_cancelled_in_flight_as_pending():
    def cancel() -> httpx.Response:
        raise asyncio.CancelledError

    api = Api(consume=cancel)
    errors: list[SpendAccountingError] = []
    ctx, _ = context(Seller().http, governor(api, on_accounting_error=errors.append))

    with pytest.raises(asyncio.CancelledError):
        await paying_fetch(ctx, "GET", URL)

    (error,) = errors
    assert (error.transition, error.accounting) == ("consume", "pending")


async def test_reports_a_failed_consume_when_the_paid_request_itself_raises():
    api = Api(consume=lambda: ok({"error": "forbidden"}, 403))
    errors: list[SpendAccountingError] = []
    ctx, _ = context(
        Seller(network_error).http, governor(api, on_accounting_error=errors.append)
    )

    with pytest.raises(httpx.ConnectError):
        await paying_fetch(ctx, "GET", URL)

    (error,) = errors
    assert (error.transition, error.accounting) == ("consume", "failed")


async def test_reports_a_release_that_keeps_failing_after_a_402(delays):
    api = Api(release=lambda: ok({"error": "unavailable"}, 502))
    errors: list[SpendAccountingError] = []
    spend_governor = governor(api, on_accounting_error=errors.append)
    ctx, _ = context(Seller(v2_challenge).http, spend_governor)

    response = await paying_fetch(ctx, "GET", URL)

    assert response.status_code == 402
    assert api.count("/release") == 3
    assert spend_governor.outcome(response).accounting == "failed"
    (error,) = errors
    assert (error.transition, error.accounting, error.req_id) == (
        "release",
        "failed",
        None,
    )


async def test_records_no_outcome_without_governance():
    api = Api()
    spend_governor = governor(api)
    ctx, records = context(Seller().http, None)

    response = await paying_fetch(ctx, "GET", URL)

    assert len(records) == 1
    assert spend_governor.outcome(response) is None
    assert api.calls == []
