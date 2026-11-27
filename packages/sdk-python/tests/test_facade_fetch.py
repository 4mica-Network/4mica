import asyncio
import base64
import io
import json
from collections.abc import Callable

import httpx
import pytest
from facade_helpers import SELLER, USDC, USDT, FakeClient, fake_session

from fourmica_sdk.amounts import Token
from fourmica_sdk.errors import InvalidParamsError, SpendLimitError, X402Error
from fourmica_sdk.facade.fetch import FetchContext, SpendLimiter, paying_fetch
from fourmica_sdk.facade.models import PaymentRecord, SpendLimits
from fourmica_sdk.facade.protocols import PaymentTerms, X402Protocol

URL = "https://api.example.com/data"
X402 = X402Protocol()


def b64(value) -> str:
    return base64.b64encode(json.dumps(value).encode()).decode()


def entry(**overrides) -> dict:
    return {
        "scheme": "4mica-credit",
        "network": "eip155:84532",
        "asset": USDC,
        "amount": "10000",
        "payTo": SELLER,
        **overrides,
    }


def v2_challenge(accepts: list) -> httpx.Response:
    required = {"x402Version": 2, "resource": {"url": URL}, "accepts": accepts}
    return httpx.Response(402, headers={"PAYMENT-REQUIRED": b64(required)}, json={})


def v1_challenge(accepts: list) -> httpx.Response:
    return httpx.Response(402, json={"x402Version": 1, "accepts": accepts})


def is_paid(request: httpx.Request) -> bool:
    return "PAYMENT-SIGNATURE" in request.headers or "X-PAYMENT" in request.headers


class Seller:
    def __init__(
        self,
        challenge: Callable[[], httpx.Response],
        answer: Callable[[], httpx.Response] | None = None,
    ) -> None:
        self.calls: list[httpx.Request] = []
        self.challenge = challenge
        self.answer = answer or (lambda: httpx.Response(200, text="ok"))
        self.http = httpx.AsyncClient(transport=httpx.MockTransport(self._handle))

    def _handle(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        return self.answer() if is_paid(request) else self.challenge()


def context(
    http: httpx.AsyncClient,
    protocols=None,
    limiter: SpendLimiter | None = None,
    client: FakeClient | None = None,
):
    session = fake_session(client or FakeClient())
    records: list[PaymentRecord] = []
    ctx = FetchContext(
        http=http,
        protocols=protocols or [X402],
        session_for=lambda caip2: session if caip2 == session.caip2 else None,
        limiter=limiter or SpendLimiter(),
        record=lambda response, payment: records.append(payment),
    )
    return ctx, records, session


def test_reads_4mica_credit_terms_from_a_v2_header_and_skips_other_schemes():
    terms = X402.terms(v2_challenge([entry(scheme="exact"), entry()]))
    assert len(terms) == 1
    assert terms[0] == PaymentTerms(
        protocol="x402",
        network="eip155:84532",
        asset=USDC,
        amount=10_000,
        pay_to=SELLER,
        offer=None,
    )


def test_reads_v1_bodies_with_either_amount_field_and_normalizes_shorthand_networks():
    v1 = entry(network="base-sepolia", maxAmountRequired="7")
    del v1["amount"]
    terms = X402.terms(v1_challenge([v1, entry(amount="9")]))
    assert [(t.amount, t.network) for t in terms] == [
        (7, "eip155:84532"),
        (9, "eip155:84532"),
    ]


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(402, text="pay up"),
        httpx.Response(402, json=["not", "an", "object"]),
        httpx.Response(402, json={"x402Version": 3, "accepts": [entry()]}),
        httpx.Response(402, json={"x402Version": True, "accepts": [entry()]}),
        httpx.Response(402, json={"x402Version": 1, "accepts": "none"}),
        httpx.Response(402, headers={"PAYMENT-REQUIRED": "%%%"}, json={}),
        v2_challenge([entry(amount="-1"), entry(payTo=None), "junk"]),
        v2_challenge([entry(payTo="0x123"), entry(asset="USDC")]),
        v2_challenge([entry(extra={"validation": {"validator": "0x1"}})]),
    ],
)
def test_ignores_responses_that_are_not_payable_x402(response):
    assert X402.terms(response) == []


def test_reads_a_version_sent_as_a_string():
    required = {"x402Version": "2", "resource": {"url": URL}, "accepts": [entry()]}
    v2 = httpx.Response(402, headers={"PAYMENT-REQUIRED": b64(required)})
    assert len(X402.terms(v2)) == 1
    v1 = httpx.Response(402, json={"x402Version": "1", "accepts": [entry()]})
    assert len(X402.terms(v1)) == 1


def test_reads_a_header_sent_without_base64_padding():
    required = {"x402Version": 2, "resource": {"url": URL}, "accepts": [entry()]}
    header = b64(required).rstrip("=")
    response = httpx.Response(402, headers={"PAYMENT-REQUIRED": header})
    assert len(X402.terms(response)) == 1


async def test_pays_v2_in_payment_signature_and_v1_in_x_payment():
    client = FakeClient()
    async with httpx.AsyncClient() as http:
        (v2,) = X402.terms(v2_challenge([entry()]))
        headers = await X402.pay(v2, client, http)
        assert list(headers) == ["PAYMENT-SIGNATURE"]
        envelope = json.loads(base64.b64decode(headers["PAYMENT-SIGNATURE"]))
        assert envelope["x402Version"] == 2
        assert envelope["accepted"]["payTo"] == SELLER
        assert envelope["resource"] == {"url": URL}

        (v1,) = X402.terms(v1_challenge([entry()]))
        headers = await X402.pay(v1, client, http)
        assert list(headers) == ["X-PAYMENT"]
        assert json.loads(base64.b64decode(headers["X-PAYMENT"]))["x402Version"] == 1
    recipient, amount, asset = client.new_payment.await_args.args
    assert (recipient, amount, asset.address) == (SELLER, 10_000, USDC)


async def test_echoes_extra_as_the_seller_advertised_it():
    client = FakeClient()

    async def accepted(option: dict) -> dict:
        (terms,) = X402.terms(v2_challenge([option]))
        async with httpx.AsyncClient() as http:
            headers = await X402.pay(terms, client, http)
        return json.loads(base64.b64decode(headers["PAYMENT-SIGNATURE"]))["accepted"]

    assert (await accepted(entry(extra={})))["extra"] == {}
    assert "extra" not in await accepted(entry())
    kept = entry(extra={"rpcUrl": "https://core.example"}, maxTimeoutSeconds=300)
    assert await accepted(kept) == kept


async def test_signs_a_challenge_that_names_no_resource():
    required = {"x402Version": 2, "accepts": [entry()]}
    (terms,) = X402.terms(
        httpx.Response(402, headers={"PAYMENT-REQUIRED": b64(required)})
    )
    async with httpx.AsyncClient() as http:
        headers = await X402.pay(terms, FakeClient(), http)
    envelope = json.loads(base64.b64decode(headers["PAYMENT-SIGNATURE"]))
    assert envelope["resource"] == {"url": ""}


async def test_signs_a_valid_v2_option_that_sits_beside_malformed_ones():
    client = FakeClient()
    (terms,) = X402.terms(v2_challenge([{"scheme": "4mica-credit"}, entry()]))
    async with httpx.AsyncClient() as http:
        headers = await X402.pay(terms, client, http)
    assert "PAYMENT-SIGNATURE" in headers


async def test_passes_non_402_responses_through_without_paying():
    seller = Seller(lambda: httpx.Response(200, text="free"))
    ctx, records, session = context(seller.http)
    response = await paying_fetch(ctx, "GET", URL)
    assert response.text == "free"
    assert len(seller.calls) == 1
    assert records == []
    session.client.sign_payment.assert_not_awaited()


@pytest.mark.parametrize(
    "challenge",
    [
        lambda: httpx.Response(402, text="pay up"),
        lambda: v2_challenge([entry(scheme="exact")]),
        lambda: v2_challenge([entry(network="eip155:8453")]),
    ],
)
async def test_passes_a_402_it_cannot_pay_through_untouched(challenge):
    seller = Seller(challenge)
    ctx, _records, session = context(seller.http)
    response = await paying_fetch(ctx, "GET", URL)
    assert response.status_code == 402
    assert len(seller.calls) == 1
    session.client.sign_payment.assert_not_awaited()


async def test_pays_once_retries_once_with_the_same_request_and_records_it():
    seller = Seller(lambda: v2_challenge([entry()]))
    ctx, records, _ = context(seller.http)
    response = await paying_fetch(
        ctx, "POST", URL, headers={"x-app": "1"}, content=b"payload"
    )
    assert response.text == "ok"
    assert len(seller.calls) == 2
    retry = seller.calls[1]
    assert retry.method == "POST"
    assert retry.headers["x-app"] == "1"
    assert retry.content == b"payload"
    assert records == [
        PaymentRecord(
            protocol="x402",
            network="eip155:84532",
            asset=Token("USDC", USDC, 6),
            amount="0.01",
            amount_raw=10_000,
            pay_to=SELLER,
        )
    ]


async def test_pays_the_valid_option_beside_one_it_could_not_sign():
    unsignable = entry(extra={"validation": {"validator": "0x1"}})
    seller = Seller(lambda: v2_challenge([unsignable, entry()]))
    ctx, records, _ = context(seller.http)
    assert (await paying_fetch(ctx, "GET", URL)).status_code == 200
    assert len(records) == 1


async def test_the_retry_carries_the_same_bytes_for_a_body_that_can_be_read_once():
    async def chunks():
        yield b"first "
        yield b"second"

    seller = Seller(lambda: v2_challenge([entry()]))
    ctx, _, _ = context(seller.http)
    await paying_fetch(ctx, "POST", URL, content=chunks())
    assert [call.content for call in seller.calls] == [b"first second"] * 2

    upload = io.BytesIO(b"file contents")
    seller = Seller(lambda: v2_challenge([entry()]))
    ctx, _, _ = context(seller.http)
    await paying_fetch(ctx, "POST", URL, files={"report": ("r.txt", upload)})
    unpaid, paid = seller.calls
    assert b"file contents" in paid.content
    assert paid.content == unpaid.content
    assert paid.headers["content-type"] == unpaid.headers["content-type"]


async def test_the_retry_of_a_streamed_body_is_framed_by_its_length_alone():
    async def chunks():
        yield b"first "
        yield b"second"

    seller = Seller(lambda: v2_challenge([entry()]))
    ctx, _, _ = context(seller.http)
    await paying_fetch(ctx, "POST", URL, content=chunks())
    unpaid, paid = seller.calls
    assert unpaid.headers["transfer-encoding"] == "chunked"
    assert "transfer-encoding" not in paid.headers
    assert paid.headers["content-length"] == "12"


class Site:
    def __init__(self, routes: dict) -> None:
        self.calls: list[httpx.Request] = []
        self.routes = routes
        self.http = httpx.AsyncClient(transport=httpx.MockTransport(self._handle))

    def _handle(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        route = self.routes.get(f"{request.method} {request.url}")
        return route(request) if route else httpx.Response(404)

    @property
    def seen(self) -> list[str]:
        return [f"{call.method} {call.url}" for call in self.calls]


def redirect(status: int, location: str):
    return lambda request: httpx.Response(status, headers={"location": location})


def paywall(request: httpx.Request) -> httpx.Response:
    return (
        httpx.Response(200, text="ok") if is_paid(request) else v2_challenge([entry()])
    )


async def test_does_not_pay_a_402_a_redirect_reached_on_another_origin():
    elsewhere = "https://elsewhere.example/data"
    site = Site({f"GET {URL}": redirect(302, elsewhere), f"GET {elsewhere}": paywall})
    ctx, records, session = context(site.http)
    response = await paying_fetch(ctx, "GET", URL, follow_redirects=True)
    assert response.status_code == 402
    assert str(response.url) == elsewhere
    assert site.seen == [f"GET {URL}", f"GET {elsewhere}"]
    assert records == []
    session.client.sign_payment.assert_not_awaited()


@pytest.mark.parametrize(
    "elsewhere",
    [
        "http://api.example.com/data",
        "https://api.example.com:8443/data",
        "https://api.example.com.evil.example/data",
    ],
)
async def test_another_scheme_or_port_or_host_is_another_origin(elsewhere):
    site = Site({f"GET {URL}": redirect(302, elsewhere), f"GET {elsewhere}": paywall})
    ctx, _, session = context(site.http)
    response = await paying_fetch(ctx, "GET", URL, follow_redirects=True)
    assert response.status_code == 402
    session.client.sign_payment.assert_not_awaited()


async def test_pays_the_same_host_when_redirected_from_http_to_https():
    plain = "http://api.example.com/data"
    site = Site({f"GET {plain}": redirect(301, URL), f"GET {URL}": paywall})
    ctx, records, _ = context(site.http)
    response = await paying_fetch(ctx, "GET", plain, follow_redirects=True)
    assert response.status_code == 200
    assert [is_paid(call) for call in site.calls] == [False, False, True]
    assert site.seen == [f"GET {plain}", f"GET {URL}", f"GET {URL}"]
    assert len(records) == 1


async def test_after_a_303_pays_the_get_that_was_challenged_not_the_post():
    submit, result = "https://api.example.com/submit", "https://api.example.com/result"
    site = Site({f"POST {submit}": redirect(303, result), f"GET {result}": paywall})
    ctx, records, _ = context(site.http)
    response = await paying_fetch(
        ctx, "POST", submit, content=b"order", follow_redirects=True
    )
    assert response.status_code == 200
    assert site.seen == [f"POST {submit}", f"GET {result}", f"GET {result}"]
    paid = site.calls[2]
    assert is_paid(paid)
    assert paid.content == b""
    assert "content-length" not in paid.headers
    assert len(records) == 1


async def test_after_a_307_the_paid_retry_keeps_the_method_and_the_body():
    old, new = "https://api.example.com/v1", "https://api.example.com/v2"
    site = Site({f"POST {old}": redirect(307, new), f"POST {new}": paywall})
    ctx, _, _ = context(site.http)
    response = await paying_fetch(
        ctx, "POST", old, content=b"order", follow_redirects=True
    )
    assert response.status_code == 200
    assert site.seen == [f"POST {old}", f"POST {new}", f"POST {new}"]
    assert site.calls[2].content == b"order"


async def test_the_paid_retry_follows_no_redirect_so_the_payment_goes_no_further():
    elsewhere = "https://elsewhere.example/collect"

    def handle(request: httpx.Request) -> httpx.Response:
        if is_paid(request):
            return httpx.Response(302, headers={"location": elsewhere})
        return v2_challenge([entry(amount="600000")])

    site = Site({f"GET {URL}": handle})
    limiter = SpendLimiter(SpendLimits(total="1 USDC"))
    site.http.follow_redirects = True
    ctx, records, _ = context(site.http, limiter=limiter)
    response = await paying_fetch(ctx, "GET", URL)
    assert response.status_code == 302
    assert site.seen == [f"GET {URL}", f"GET {URL}"]
    assert records == []
    with pytest.raises(SpendLimitError) as raised:
        await paying_fetch(ctx, "GET", URL)
    assert raised.value.limit == "total"


async def test_a_refusal_names_the_url_that_asked_for_the_payment():
    moved = "https://api.example.com/moved"
    site = Site(
        {
            f"GET {URL}": redirect(302, moved),
            f"GET {moved}": lambda request: v2_challenge([entry(amount="2000000")]),
        }
    )
    ctx, _, _ = context(site.http)
    with pytest.raises(SpendLimitError) as raised:
        await paying_fetch(ctx, "GET", URL, follow_redirects=True)
    assert raised.value.url == moved


async def test_the_retry_keeps_the_query_and_the_clients_own_headers():
    calls = []

    def handle(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200) if is_paid(request) else v2_challenge([entry()])

    http = httpx.AsyncClient(
        transport=httpx.MockTransport(handle),
        base_url="https://api.example.com",
        headers={"x-client": "agent"},
    )
    ctx, records, _ = context(http)
    await paying_fetch(ctx, "GET", "/data", params={"q": "1"}, timeout=5)
    assert [str(call.url) for call in calls] == [URL + "?q=1"] * 2
    assert calls[1].headers["x-client"] == "agent"
    assert calls[1].extensions["timeout"] == calls[0].extensions["timeout"]
    assert len(records) == 1


async def test_never_loops_on_a_second_402_and_keeps_the_amount_reserved():
    def challenge():
        return v2_challenge([entry(amount="600000")])

    stubborn = Seller(challenge, answer=challenge)
    limiter = SpendLimiter(SpendLimits(total="1 USDC"))
    ctx, records, _ = context(stubborn.http, limiter=limiter)
    response = await paying_fetch(ctx, "GET", URL)
    assert response.status_code == 402
    assert len(stubborn.calls) == 2
    assert records == []

    ctx.http = Seller(challenge).http
    with pytest.raises(SpendLimitError) as raised:
        await paying_fetch(ctx, "GET", URL)
    assert raised.value.limit == "total"


def settlement(success: bool) -> dict:
    return {"PAYMENT-RESPONSE": b64({"success": success})}


def answering(answer: Callable[[], httpx.Response]) -> Seller:
    return Seller(lambda: v2_challenge([entry(amount="600000")]), answer=answer)


CYCLE = "0x" + "22" * 32


def checkpoint_required(details: dict | None = None, header="PAYMENT-RESPONSE"):
    refusal = {
        "success": False,
        "errorReason": "invalid_4mica_credit_checkpoint_required",
        "network": "eip155:84532",
    }
    if details is not None:
        refusal["extra"] = {"retryable": False, "details": details}
    return httpx.Response(402, headers={header: b64(refusal)}, json={})


def refused_then(*answers: httpx.Response) -> Seller:
    queue = list(answers)
    return answering(lambda: queue.pop(0) if len(queue) > 1 else queue[0])


async def test_checkpoints_the_cycle_core_names_and_pays_once_more():
    details = {
        "cycle_id": CYCLE,
        "cycle_id_text": "7",
        "asset_address": USDC,
        "payer": "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A",
        "uncheckpointed": 64,
        "max_uncheckpointed": 64,
    }
    seller = refused_then(checkpoint_required(details), httpx.Response(200))
    client = FakeClient()
    limiter = SpendLimiter(SpendLimits(total="1.2 USDC"))
    ctx, records, _ = context(seller.http, limiter=limiter, client=client)

    response = await paying_fetch(ctx, "GET", URL)

    assert response.status_code == 200
    client.payment.checkpoint_cycle.assert_awaited_once_with(USDC, CYCLE)
    client.payment.checkpoint_active_cycle.assert_not_awaited()
    assert [is_paid(call) for call in seller.calls] == [False, True, True]
    assert client.sign_payment.await_count == 2
    assert len(records) == 1
    # The refused payment stays counted: the seller still holds it.
    ctx.http = Seller(lambda: v2_challenge([entry(amount="600000")])).http
    with pytest.raises(SpendLimitError) as raised:
        await paying_fetch(ctx, "GET", URL)
    assert raised.value.limit == "total"


@pytest.mark.parametrize(
    "refused",
    [
        checkpoint_required(),
        checkpoint_required({"cycle_id": CYCLE}),
        checkpoint_required(header="X-PAYMENT-RESPONSE"),
    ],
)
async def test_checkpoints_the_active_cycle_when_the_refusal_names_none(refused):
    seller = refused_then(refused, httpx.Response(200))
    client = FakeClient()
    ctx, records, _ = context(seller.http, client=client)
    assert (await paying_fetch(ctx, "GET", URL)).status_code == 200
    client.payment.checkpoint_active_cycle.assert_awaited_once_with(USDC)
    assert len(records) == 1


async def test_checkpoints_once_and_returns_a_second_refusal():
    seller = refused_then(checkpoint_required())
    client = FakeClient()
    ctx, records, _ = context(seller.http, client=client)
    assert (await paying_fetch(ctx, "GET", URL)).status_code == 402
    assert client.payment.checkpoint_active_cycle.await_count == 1
    assert len(seller.calls) == 3
    assert records == []


async def test_a_refusal_a_checkpoint_does_not_fix_is_returned_as_is():
    refusal = {"success": False, "errorReason": "insufficient_funds"}
    seller = refused_then(
        httpx.Response(402, headers={"PAYMENT-RESPONSE": b64(refusal)})
    )
    client = FakeClient()
    ctx, _, _ = context(seller.http, client=client)
    assert (await paying_fetch(ctx, "GET", URL)).status_code == 402
    client.payment.checkpoint_active_cycle.assert_not_awaited()
    assert len(seller.calls) == 2


async def test_does_not_record_a_seller_error_and_keeps_the_amount_reserved():
    seller = answering(lambda: httpx.Response(500, text="boom"))
    limiter = SpendLimiter(SpendLimits(total="1 USDC"))
    ctx, records, _ = context(seller.http, limiter=limiter)
    assert (await paying_fetch(ctx, "GET", URL)).status_code == 500
    assert records == []
    with pytest.raises(SpendLimitError) as raised:
        await paying_fetch(ctx, "GET", URL)
    assert raised.value.limit == "total"


async def test_records_a_seller_error_that_says_it_settled():
    seller = answering(lambda: httpx.Response(500, headers=settlement(True)))
    ctx, records, _ = context(seller.http)
    await paying_fetch(ctx, "GET", URL)
    assert len(records) == 1


async def test_does_not_record_a_success_that_says_it_did_not_settle():
    seller = answering(lambda: httpx.Response(200, headers=settlement(False)))
    ctx, records, _ = context(seller.http)
    assert (await paying_fetch(ctx, "GET", URL)).status_code == 200
    assert records == []


async def test_reads_the_v1_header_too_and_ignores_one_it_cannot_parse():
    v1 = {"X-PAYMENT-RESPONSE": b64({"success": False})}
    seller = answering(lambda: httpx.Response(200, headers=v1))
    ctx, records, _ = context(seller.http)
    await paying_fetch(ctx, "GET", URL)
    assert records == []

    garbled = answering(lambda: httpx.Response(200, headers={"PAYMENT-RESPONSE": "%"}))
    ctx, records, _ = context(garbled.http)
    await paying_fetch(ctx, "GET", URL)
    assert len(records) == 1


async def test_releases_the_reservation_when_signing_fails():
    client = FakeClient()
    client.sign_payment.side_effect = RuntimeError("wallet locked")
    seller = Seller(lambda: v2_challenge([entry(amount="600000")]))
    limiter = SpendLimiter(SpendLimits(total="1 USDC"))
    ctx, _, _ = context(seller.http, limiter=limiter, client=client)
    with pytest.raises(X402Error, match="wallet locked"):
        await paying_fetch(ctx, "GET", URL)

    client.sign_payment.side_effect = client._sign_payment
    assert (await paying_fetch(ctx, "GET", URL)).status_code == 200


async def test_keeps_the_reservation_when_the_paid_request_fails_in_transit():
    def handle(request: httpx.Request) -> httpx.Response:
        if is_paid(request):
            raise httpx.ConnectError("connection reset")
        return v2_challenge([entry(amount="600000")])

    http = httpx.AsyncClient(transport=httpx.MockTransport(handle))
    limiter = SpendLimiter(SpendLimits(total="1 USDC"))
    ctx, records, _ = context(http, limiter=limiter)
    with pytest.raises(httpx.ConnectError):
        await paying_fetch(ctx, "GET", URL)
    assert records == []
    with pytest.raises(SpendLimitError) as raised:
        await paying_fetch(ctx, "GET", URL)
    assert raised.value.limit == "total"


async def test_refuses_over_the_default_1_usdc_per_payment_signing_nothing():
    seller = Seller(lambda: v2_challenge([entry(amount="1000001")]))
    ctx, _, session = context(seller.http)
    with pytest.raises(SpendLimitError) as raised:
        await paying_fetch(ctx, "GET", URL)
    error = raised.value
    assert (error.limit, error.url) == ("per_payment", URL)
    assert "1.000001 USDC, over the 1 USDC per-payment limit" in str(error)
    assert len(seller.calls) == 1
    session.client.sign_payment.assert_not_awaited()


async def test_refuses_assets_no_limit_names_and_payees_not_allowed():
    unnamed = Seller(lambda: v2_challenge([entry(asset=USDT)]))
    ctx, _, _ = context(unnamed.http)
    with pytest.raises(SpendLimitError) as raised:
        await paying_fetch(ctx, "GET", URL)
    assert raised.value.limit == "assets"

    unlisted = Seller(lambda: v2_challenge([entry(asset="0x" + "99" * 20)]))
    ctx, _, _ = context(unlisted.http)
    with pytest.raises(SpendLimitError, match="not an asset 4Mica accepts"):
        await paying_fetch(ctx, "GET", URL)

    seller = Seller(lambda: v2_challenge([entry()]))
    limiter = SpendLimiter(SpendLimits(pay_to=["0x" + "77" * 20]))
    ctx, _, _ = context(seller.http, limiter=limiter)
    with pytest.raises(SpendLimitError) as raised:
        await paying_fetch(ctx, "GET", URL)
    assert raised.value.limit == "pay_to"

    for pay_to in ([SELLER.lower()], SELLER):
        allowed = SpendLimiter(SpendLimits(pay_to=pay_to))
        ctx, _, _ = context(seller.http, limiter=allowed)
        assert (await paying_fetch(ctx, "GET", URL)).status_code == 200


async def test_enforces_the_session_total_across_payments():
    seller = Seller(lambda: v2_challenge([entry(amount="600000")]))
    limiter = SpendLimiter(SpendLimits(total="1 USDC"))
    ctx, records, _ = context(seller.http, limiter=limiter)
    await paying_fetch(ctx, "GET", URL)
    with pytest.raises(SpendLimitError, match=r"0\.6 USDC spent so far"):
        await paying_fetch(ctx, "GET", URL)
    assert len(records) == 1


async def test_holds_the_session_total_when_payments_run_concurrently():
    seller = Seller(lambda: v2_challenge([entry(amount="400000")]))
    limiter = SpendLimiter(SpendLimits(total="1 USDC"))
    ctx, records, _ = context(seller.http, limiter=limiter)
    outcomes = await asyncio.gather(
        *(paying_fetch(ctx, "GET", URL) for _ in range(5)), return_exceptions=True
    )
    refused = [o for o in outcomes if isinstance(o, SpendLimitError)]
    assert len(refused) == 3
    assert len(records) == 2


async def test_one_total_is_one_budget_across_networks():
    other_usdc = "0x" + "c5" * 20
    here = fake_session(FakeClient())
    there = fake_session(
        FakeClient(chain_id=8453, tokens=[Token("USDC", other_usdc, 18)]), name="base"
    )
    sessions = {here.caip2: here, there.caip2: there}
    offers = [
        entry(amount="600000"),
        entry(network=there.caip2, asset=other_usdc, amount=str(6 * 10**17)),
    ]
    seller = Seller(lambda: v2_challenge([offers[0]]))
    records: list[PaymentRecord] = []
    ctx = FetchContext(
        http=seller.http,
        protocols=[X402],
        session_for=sessions.get,
        limiter=SpendLimiter(SpendLimits(total="1 USDC")),
        record=lambda response, payment: records.append(payment),
    )
    await paying_fetch(ctx, "GET", URL)

    seller.challenge = lambda: v2_challenge([offers[1]])
    with pytest.raises(SpendLimitError) as raised:
        await paying_fetch(ctx, "GET", URL)
    assert raised.value.limit == "total"
    assert "0.6 USDC spent so far" in str(raised.value)
    assert [r.network for r in records] == [here.caip2]
    there.client.sign_payment.assert_not_awaited()

    seller.challenge = lambda: v2_challenge([{**offers[1], "amount": str(4 * 10**17)}])
    assert (await paying_fetch(ctx, "GET", URL)).status_code == 200
    assert [r.network for r in records] == [here.caip2, there.caip2]


@pytest.mark.parametrize("total", ["5 USDC", "5 USCD", ["5 USDC", "5 USTD"]])
async def test_a_total_refuses_an_asset_none_of_its_entries_names(total):
    seller = Seller(lambda: v2_challenge([entry(asset=USDT)]))
    limiter = SpendLimiter(SpendLimits(per_payment=["1 USDC", "1 USDT"], total=total))
    ctx, _records, session = context(seller.http, limiter=limiter)
    with pytest.raises(SpendLimitError) as raised:
        await paying_fetch(ctx, "GET", URL)
    assert raised.value.limit == "assets"
    assert "USDT, which no total limit names" in str(raised.value)
    assert len(seller.calls) == 1
    session.client.sign_payment.assert_not_awaited()


async def test_a_total_naming_each_asset_caps_each_on_its_own():
    limits = SpendLimits(per_payment=["1 USDC", "1 USDT"], total=["1 USDC", "1 USDT"])
    seller = Seller(lambda: v2_challenge([entry(amount="600000")]))
    ctx, records, _ = context(seller.http, limiter=SpendLimiter(limits))
    await paying_fetch(ctx, "GET", URL)
    seller.challenge = lambda: v2_challenge([entry(asset=USDT, amount="600000")])
    await paying_fetch(ctx, "GET", URL)
    assert [r.asset.symbol for r in records] == ["USDC", "USDT"]
    with pytest.raises(SpendLimitError, match=r"0\.6 USDT spent so far"):
        await paying_fetch(ctx, "GET", URL)


async def test_allows_a_second_asset_when_per_payment_names_it():
    seller = Seller(lambda: v2_challenge([entry(asset=USDT, amount="2000000")]))
    limiter = SpendLimiter(SpendLimits(per_payment=["1 USDC", "5 USDT"]))
    ctx, records, _ = context(seller.http, limiter=limiter)
    await paying_fetch(ctx, "GET", URL)
    assert (records[0].asset.symbol, records[0].amount) == ("USDT", "2")


class OtherProtocol:
    name = "other"

    def terms(self, response):
        return [
            PaymentTerms("other", t.network, t.asset, t.amount // 10, t.pay_to, None)
            for t in X402.terms(response)
        ]

    async def pay(self, terms, client, http):
        return {"X-PAYMENT": "other"}

    def settled(self, response):
        return None

    async def recover(self, refused, terms, client):
        return False


async def test_prefers_protocols_in_the_given_order():
    seller = Seller(lambda: v2_challenge([entry()]))
    ctx, records, _ = context(seller.http, protocols=[OtherProtocol(), X402])
    await paying_fetch(ctx, "GET", URL)
    assert [r.protocol for r in records] == ["other"]
    assert seller.calls[1].headers["X-PAYMENT"] == "other"


async def test_falls_back_to_the_next_option_when_the_first_breaks_a_limit():
    seller = Seller(lambda: v2_challenge([entry(amount="2000000")]))
    ctx, records, _ = context(seller.http, protocols=[X402, OtherProtocol()])
    await paying_fetch(ctx, "GET", URL)
    assert [(r.protocol, r.amount) for r in records] == [("other", "0.2")]


def test_rejects_malformed_limits_up_front():
    for limits in (
        SpendLimits(per_payment="1"),
        SpendLimits(total="lots of USDC"),
        SpendLimits(per_payment=["1 USDC", "-2 USDT"]),
        SpendLimits(per_payment=1),
    ):
        with pytest.raises(InvalidParamsError):
            SpendLimiter(limits)
