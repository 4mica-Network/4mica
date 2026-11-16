import asyncio
import base64
import json
from typing import Callable, List, Optional

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
    """Answers unpaid requests with *challenge* and paid ones with *answer*."""

    def __init__(
        self,
        challenge: Callable[[], httpx.Response],
        answer: Optional[Callable[[], httpx.Response]] = None,
    ) -> None:
        self.calls: List[httpx.Request] = []
        self.challenge = challenge
        self.answer = answer or (lambda: httpx.Response(200, text="ok"))
        self.http = httpx.AsyncClient(transport=httpx.MockTransport(self._handle))

    def _handle(self, request: httpx.Request) -> httpx.Response:
        self.calls.append(request)
        return self.answer() if is_paid(request) else self.challenge()


def context(
    http: httpx.AsyncClient,
    protocols=None,
    limiter: Optional[SpendLimiter] = None,
    client: Optional[FakeClient] = None,
):
    session = fake_session(client or FakeClient())
    records: List[PaymentRecord] = []
    ctx = FetchContext(
        http=http,
        protocols=protocols or [X402],
        session_for=lambda caip2: session if caip2 == session.caip2 else None,
        limiter=limiter or SpendLimiter(),
        record=lambda response, payment: records.append(payment),
    )
    return ctx, records, session


# --- the x402 adapter ---------------------------------------------------------


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
        # What signing would refuse is not offered as payable either.
        v2_challenge([entry(payTo="0x123"), entry(asset="USDC")]),
        v2_challenge([entry(extra={"validation": {"validator": "0x1"}})]),
        httpx.Response(
            402,
            headers={"PAYMENT-REQUIRED": b64({"x402Version": 2, "accepts": [entry()]})},
        ),
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


async def test_signs_a_valid_v2_option_that_sits_beside_malformed_ones():
    client = FakeClient()
    (terms,) = X402.terms(v2_challenge([{"scheme": "4mica-credit"}, entry()]))
    async with httpx.AsyncClient() as http:
        headers = await X402.pay(terms, client, http)
    assert "PAYMENT-SIGNATURE" in headers


# --- paying fetch ---------------------------------------------------------------


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
    ctx, records, session = context(seller.http)
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


async def test_never_loops_on_a_second_402_and_does_not_count_it():
    def challenge():
        return v2_challenge([entry(amount="600000")])

    stubborn = Seller(challenge, answer=challenge)
    limiter = SpendLimiter(SpendLimits(total="1 USDC"))
    ctx, records, _ = context(stubborn.http, limiter=limiter)
    response = await paying_fetch(ctx, "GET", URL)
    assert response.status_code == 402
    assert len(stubborn.calls) == 2
    assert records == []

    # Released: a 0.6 USDC payment still fits the 1 USDC total.
    paying = Seller(challenge)
    ctx.http = paying.http
    assert (await paying_fetch(ctx, "GET", URL)).status_code == 200


def settlement(success: bool) -> dict:
    return {"PAYMENT-RESPONSE": b64({"success": success})}


def answering(answer: Callable[[], httpx.Response]) -> Seller:
    return Seller(lambda: v2_challenge([entry(amount="600000")]), answer=answer)


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
    # The seller may hold the payment, so it still counts.
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

    # A list, or one address on its own.
    for pay_to in ([SELLER.lower()], SELLER):
        allowed = SpendLimiter(SpendLimits(pay_to=pay_to))
        ctx, _, _ = context(seller.http, limiter=allowed)
        assert (await paying_fetch(ctx, "GET", URL)).status_code == 200


async def test_enforces_the_session_total_across_payments():
    seller = Seller(lambda: v2_challenge([entry(amount="600000")]))
    limiter = SpendLimiter(SpendLimits(total="1 USDC"))
    ctx, records, _ = context(seller.http, limiter=limiter)
    await paying_fetch(ctx, "GET", URL)
    with pytest.raises(SpendLimitError, match="0.6 USDC spent so far"):
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


async def test_allows_a_second_asset_when_per_payment_names_it():
    seller = Seller(lambda: v2_challenge([entry(asset=USDT, amount="2000000")]))
    limiter = SpendLimiter(SpendLimits(per_payment=["1 USDC", "5 USDT"]))
    ctx, records, _ = context(seller.http, limiter=limiter)
    await paying_fetch(ctx, "GET", URL)
    assert (records[0].asset.symbol, records[0].amount) == ("USDT", "2")


class OtherProtocol:
    """A second protocol that reads the same challenge at a tenth the price."""

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


async def test_prefers_protocols_in_the_given_order():
    seller = Seller(lambda: v2_challenge([entry()]))
    ctx, records, _ = context(seller.http, protocols=[OtherProtocol(), X402])
    await paying_fetch(ctx, "GET", URL)
    assert [r.protocol for r in records] == ["other"]
    assert seller.calls[1].headers["X-PAYMENT"] == "other"


async def test_falls_back_to_the_next_option_when_the_first_breaks_a_limit():
    # x402 asks 2 USDC, over the limit; the other protocol asks 0.2.
    seller = Seller(lambda: v2_challenge([entry(amount="2000000")]))
    ctx, records, _ = context(seller.http, protocols=[X402, OtherProtocol()])
    await paying_fetch(ctx, "GET", URL)
    assert [(r.protocol, r.amount) for r in records] == [("other", "0.2")]


def test_rejects_malformed_limits_up_front():
    for limits in (
        SpendLimits(per_payment="1"),
        SpendLimits(total="lots of USDC"),
        SpendLimits(per_payment=["1 USDC", "-2 USDT"]),
    ):
        with pytest.raises(InvalidParamsError):
            SpendLimiter(limits)
