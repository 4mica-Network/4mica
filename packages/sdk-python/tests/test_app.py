import base64
import json
from types import SimpleNamespace

import httpx
import pytest

from fourmica_sdk.app import (
    AppClient,
    AppError,
    from_app_network,
    parse_settlement,
    payment_from_header,
    to_app_network,
)
from fourmica_sdk.errors import ConfigError, InvalidParamsError, X402Error
from fourmica_sdk.networks import to_caip2
from fourmica_sdk.rpc import SDK_CLIENT

PAYER = "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A"
SELLER = "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
SIGNED = {
    "payload": {"req_id": "7", "user_address": PAYER, "amount": "2500000"},
    "signature": "0x" + "11" * 65,
}
RECEIPT = {"receipt": "0xclaims", "signature": "0xsig"}


def app_with(handler) -> AppClient:
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return AppClient(" key-123 ", base_url="https://app.example/", http_client=http)


@pytest.mark.parametrize(
    ("name", "app", "shorthand", "caip2"),
    [
        ("base", "BASE", "base", "eip155:8453"),
        ("BASE_SEPOLIA", "BASE_SEPOLIA", "base-sepolia", "eip155:84532"),
        (" base-sepolia ", "BASE_SEPOLIA", "base-sepolia", "eip155:84532"),
        ("eip155:84532", "BASE_SEPOLIA", "base-sepolia", "eip155:84532"),
    ],
)
def test_names_a_network_in_every_form(name, app, shorthand, caip2):
    assert to_app_network(name) == app
    assert from_app_network(name) == shorthand
    assert to_caip2(name) == caip2


def test_an_unknown_network_is_refused_in_every_form():
    for convert in (to_app_network, from_app_network, to_caip2):
        with pytest.raises(InvalidParamsError, match="unknown network: mars"):
            convert("mars")


def test_reads_the_payment_in_an_x_payment_header():
    envelope = {"x402Version": 2, "payload": SIGNED}
    header = base64.b64encode(json.dumps(envelope).encode()).decode()
    payment = payment_from_header(header, decimals=6)
    assert (payment.req_id, payment.payer_address) == ("7", PAYER)
    assert (payment.amount_raw, payment.amount) == (2_500_000, "2.5")


@pytest.mark.parametrize("header", ["", "not base64!", base64.b64encode(b"{").decode()])
def test_an_unreadable_header_is_an_x402_error(header):
    with pytest.raises(X402Error):
        payment_from_header(header)


def test_reads_a_settlement_from_the_x402_hook_context():
    context = SimpleNamespace(
        payment_payload=SimpleNamespace(payload=SIGNED),
        result=SimpleNamespace(extra={"receipt": RECEIPT}),
    )
    settled = parse_settlement(context)
    assert (settled.req_id, settled.payer_address, settled.amount) == (
        "7",
        PAYER,
        "2500000",
    )
    assert (settled.guarantee_claims, settled.guarantee_signature) == (
        "0xclaims",
        "0xsig",
    )


def test_reads_a_settlement_given_as_plain_json_with_no_receipt():
    payload = {
        "payload": {"reqId": "0x08", "userAddress": PAYER, "amount": "007"},
    }
    settled = parse_settlement(
        {"paymentPayload": {"payload": payload}, "result": {"extra": None}}
    )
    assert (settled.req_id, settled.amount) == ("0x08", "7")
    assert settled.guarantee_claims is None
    assert settled.guarantee_signature is None


@pytest.mark.parametrize("amount", [None, "lots", True, 1.5])
def test_a_payment_without_a_whole_amount_is_refused(amount):
    signed = {"payload": {**SIGNED["payload"], "amount": amount}}
    with pytest.raises(InvalidParamsError, match="missing req_id"):
        parse_settlement({"payment_payload": {"payload": signed}, "result": {}})


def test_an_api_key_is_required():
    with pytest.raises(ConfigError):
        AppClient("  ")


async def test_reads_the_resource_with_the_key_and_sdk_headers():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(
            method=request.method,
            url=str(request.url),
            auth=request.headers["authorization"],
            sdk=request.headers["x-4mica-sdk"],
        )
        return httpx.Response(200, json={"kind": "listing", "faqs": []})

    async with app_with(handler) as app:
        assert (await app.resource())["kind"] == "listing"
    assert seen == {
        "method": "GET",
        "url": "https://app.example/v1/resource",
        "auth": "Bearer key-123",
        "sdk": SDK_CLIENT,
    }


async def test_resolves_a_customer_in_the_apis_own_names():
    sent = {}

    def handler(request: httpx.Request) -> httpx.Response:
        sent.update(path=request.url.path, body=json.loads(request.content))
        return httpx.Response(200, json={"allowed": True, "payable": "1"})

    async with app_with(handler) as app:
        answer = await app.resolve_customer(
            payer_address=PAYER, network="base-sepolia", amount="1"
        )
    assert answer["allowed"] is True
    assert sent == {
        "path": "/v1/customers/resolve",
        "body": {"payerAddress": PAYER, "network": "BASE_SEPOLIA", "amount": "1"},
    }


@pytest.mark.parametrize(("status", "created"), [(201, True), (200, False)])
async def test_a_reported_payment_says_whether_it_is_new(status, created):
    sent = {}

    def handler(request: httpx.Request) -> httpx.Response:
        sent.update(json.loads(request.content))
        return httpx.Response(status, json={"id": "p-1", "reqId": "7"})

    async with app_with(handler) as app:
        reported = await app.report_payment(
            req_id="7",
            payer_address=PAYER,
            recipient_address=SELLER,
            network="eip155:8453",
            amount="2500000",
            guarantee_claims="0xclaims",
        )
    assert reported == {"payment": {"id": "p-1", "reqId": "7"}, "created": created}
    assert sent == {
        "reqId": "7",
        "payerAddress": PAYER,
        "recipientAddress": SELLER,
        "network": "BASE",
        "amount": "2500000",
        "guaranteeClaims": "0xclaims",
    }


async def test_a_refusal_carries_the_apis_code_and_issues():
    body = {
        "error": "validation_failed",
        "message": "amount is not a number",
        "issues": [{"path": "amount", "message": "expected digits"}, {"path": 1}],
    }
    async with app_with(lambda r: httpx.Response(422, json=body)) as app:
        with pytest.raises(AppError, match="amount is not a number") as raised:
            await app.resource()
    assert raised.value.status == 422
    assert raised.value.code == "validation_failed"
    assert raised.value.issues == [{"path": "amount", "message": "expected digits"}]
    assert raised.value.body == body


async def test_a_refusal_with_no_message_names_the_status():
    async with app_with(lambda r: httpx.Response(503)) as app:
        with pytest.raises(AppError, match="failed with 503") as raised:
            await app.resource()
    assert raised.value.code is None


async def test_an_answer_that_is_not_json_is_an_app_error():
    async with app_with(lambda r: httpx.Response(200, text="<html>")) as app:
        with pytest.raises(AppError, match="invalid JSON") as raised:
            await app.resource()
    assert raised.value.body == "<html>"


async def test_an_unreachable_api_is_an_app_error():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    async with app_with(handler) as app:
        with pytest.raises(AppError, match="request to /v1/resource failed"):
            await app.resource()


async def test_closes_its_own_http_client_but_not_one_it_was_given():
    given = httpx.AsyncClient()
    async with AppClient("k", http_client=given):
        pass
    assert not given.is_closed
    await given.aclose()

    own = AppClient("k")
    await own.aclose()
    assert own._http.is_closed


async def test_spend_authorizations_use_the_apis_own_names_and_escape_the_id():
    calls = []
    answer = {"id": "auth/1", "status": "RESERVED"}

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(
            (
                request.method,
                request.url.raw_path.decode(),
                json.loads(request.content) if request.content else None,
            )
        )
        return httpx.Response(200, json=answer)

    async with app_with(handler) as app:
        assert (
            await app.authorize_spend(
                network="base-sepolia",
                amount="0.01",
                payer_address=PAYER,
                recipient_address=SELLER,
                req_id="0x7",
            )
            == answer
        )
        await app.get_spend_authorization("auth/1")
        await app.consume_spend_authorization("auth/1", tx_hash="0xabc")
        await app.release_spend_authorization("auth/1")

    assert calls == [
        (
            "POST",
            "/v1/spend/authorize",
            {
                "network": "BASE_SEPOLIA",
                "amount": "0.01",
                "payerAddress": PAYER,
                "recipientAddress": SELLER,
                "reqId": "0x7",
                "assetAddress": None,
            },
        ),
        ("GET", "/v1/spend/authorizations/auth%2F1", None),
        ("POST", "/v1/spend/authorizations/auth%2F1/consume", {"txHash": "0xabc"}),
        ("POST", "/v1/spend/authorizations/auth%2F1/release", {}),
    ]
