import base64
import json
from types import SimpleNamespace

import pytest

from fourmica_sdk.app import parse_payment_header, parse_settlement, payment_from_header
from fourmica_sdk.errors import InvalidParamsError, X402Error

PAYER = "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A"


def header_for(value) -> str:
    return base64.b64encode(json.dumps(value).encode()).decode()


def test_an_amount_sent_as_a_json_number_is_read_as_is():
    header = header_for(
        {"payload": {"payload": {"req_id": "1", "user_address": PAYER, "amount": 1500}}}
    )
    payment = payment_from_header(header, decimals=3)
    assert payment.amount_raw == 1500
    assert payment.amount == "1.5"


@pytest.mark.parametrize(
    ("amount", "raw"),
    [("0x10", 16), ("0X10", 16), (" 42 ", 42), ("0", 0)],
)
def test_an_amount_sent_as_a_string_is_read_as_decimal_or_hex(amount, raw):
    header = header_for(
        {
            "payload": {
                "payload": {"req_id": "1", "user_address": PAYER, "amount": amount}
            }
        }
    )
    assert payment_from_header(header, decimals=0).amount_raw == raw


@pytest.mark.parametrize("amount", ["", "   ", "0xzz", None, [1], {"value": 1}, False])
def test_an_amount_that_is_not_a_whole_number_is_refused(amount):
    header = header_for(
        {
            "payload": {
                "payload": {"req_id": "1", "user_address": PAYER, "amount": amount}
            }
        }
    )
    with pytest.raises(
        InvalidParamsError, match="missing req_id, user_address or amount"
    ):
        payment_from_header(header)


@pytest.mark.parametrize(
    "payload",
    [
        {"req_id": 1, "user_address": PAYER, "amount": "1"},
        {"req_id": "1", "user_address": None, "amount": "1"},
        {"amount": "1"},
    ],
)
def test_a_payment_with_a_req_id_or_payer_that_is_not_a_string_is_refused(payload):
    with pytest.raises(InvalidParamsError):
        payment_from_header(header_for({"payload": {"payload": payload}}))


@pytest.mark.parametrize("envelope", [{}, {"payload": None}, [], "text", 5])
def test_a_header_without_a_payment_is_refused(envelope):
    with pytest.raises(InvalidParamsError, match="missing req_id"):
        payment_from_header(header_for(envelope))


@pytest.mark.parametrize("header", [None, "", 123])
def test_a_missing_or_non_string_header_is_an_x402_error(header):
    with pytest.raises(X402Error, match="missing payment header"):
        parse_payment_header(header)


def test_a_header_that_decodes_to_bytes_that_are_not_utf8_is_an_x402_error():
    with pytest.raises(X402Error, match="invalid payment header"):
        parse_payment_header(base64.b64encode(b"\xff\xfe").decode())


def test_a_settlement_read_from_objects_falls_back_to_the_camel_case_attribute():
    context = SimpleNamespace(
        paymentPayload=SimpleNamespace(
            payload=SimpleNamespace(
                payload=SimpleNamespace(reqId="9", userAddress=PAYER, amount=7)
            )
        ),
        result=SimpleNamespace(
            extra=SimpleNamespace(
                receipt=SimpleNamespace(receipt="0xc", signature=b"\x01")
            )
        ),
    )
    settled = parse_settlement(context)
    assert (settled.req_id, settled.payer_address, settled.amount) == ("9", PAYER, "7")
    assert settled.guarantee_claims == "0xc"
    assert settled.guarantee_signature is None


def test_a_settlement_context_with_no_result_has_no_receipt():
    context = SimpleNamespace(
        payment_payload={
            "payload": {
                "payload": {"req_id": "3", "user_address": PAYER, "amount": "5"}
            }
        }
    )
    settled = parse_settlement(context)
    assert settled.amount == "5"
    assert settled.guarantee_claims is None
    assert settled.guarantee_signature is None


def test_a_settlement_context_without_a_payment_is_refused():
    with pytest.raises(InvalidParamsError, match="missing req_id"):
        parse_settlement(SimpleNamespace(result=None))
