import base64
import json
from enum import Enum

import httpx
import pytest

from fourmica_sdk.errors import X402Error
from fourmica_sdk.models import PaymentRequest, PaymentRequestPayload
from fourmica_sdk.x402 import (
    PaymentRequirementsExtra,
    PaymentRequirementsV1,
    PaymentRequirementsV2,
    SettlementReceipt,
    X402Flow,
    X402PaymentRequired,
    X402ResourceInfo,
)

USER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
PAY_TO = "0x00000000000000000000000000000000000000Be"
ASSET = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
CYCLE = "0x" + "11" * 32
SUBJECT = "0x" + "22" * 32
VALIDATOR = "https://validator.example/check"


class Flavor(Enum):
    MINT = "mint"


class FlowSigner:
    def __init__(self, build_error=None, sign_error=None) -> None:
        self.build_error = build_error
        self.sign_error = sign_error
        self.signed = []

    async def new_payment(self, recipient, amount, asset):
        if self.build_error is not None:
            raise self.build_error
        return PaymentRequestPayload.new(
            user_address=USER,
            recipient_address=recipient,
            cycle_id=CYCLE,
            req_id=7,
            amount=amount,
            timestamp=1_700_000_000,
            erc20_token=asset.erc20_token,
        )

    async def sign_payment(self, payload):
        if self.sign_error is not None:
            raise self.sign_error
        self.signed.append(payload)
        return PaymentRequest(payload=payload, signature="0x" + "ab" * 65)


def v1_raw(**overrides) -> dict:
    raw = {
        "scheme": "4mica-credit",
        "network": "eip155:84532",
        "maxAmountRequired": "1000",
        "payTo": PAY_TO,
        "asset": ASSET,
    }
    raw.update(overrides)
    return raw


def v2_raw(**overrides) -> dict:
    raw = {
        "scheme": "4mica-credit",
        "network": "eip155:84532",
        "amount": "1000",
        "payTo": PAY_TO,
        "asset": ASSET,
    }
    raw.update(overrides)
    return raw


def required(version=2, **extra) -> X402PaymentRequired:
    raw = {
        "x402Version": version,
        "resource": {"url": "https://api.example/r"},
        "accepts": [v2_raw()],
    }
    raw.update(extra)
    return X402PaymentRequired.from_raw(raw)


def flow_with(handler, signer=None) -> X402Flow:
    return X402Flow(
        signer or FlowSigner(),
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )


def decode(header: str) -> dict:
    return json.loads(base64.b64decode(header))


async def signed_v1(flow: X402Flow):
    return await flow.sign_payment(PaymentRequirementsV1.from_raw(v1_raw()))


async def test_a_v2_signature_is_refused_for_a_challenge_of_another_version():
    flow = X402Flow(FlowSigner())
    with pytest.raises(X402Error, match="expected x402 version 2"):
        await flow.sign_payment_v2(
            required(version=1), PaymentRequirementsV2.from_raw(v2_raw())
        )


async def test_a_v2_signature_without_extensions_omits_them_from_the_envelope():
    flow = X402Flow(FlowSigner())
    signed = await flow.sign_payment_v2(
        required(), PaymentRequirementsV2.from_raw(v2_raw())
    )
    assert "extensions" not in signed.envelope
    assert decode(signed.header) == signed.envelope
    assert signed.x402_version == 2


async def test_enum_values_in_extensions_are_written_as_their_values():
    payment_required = required()
    payment_required.extensions = {"flavor": Flavor.MINT}
    signed = await X402Flow(FlowSigner()).sign_payment_v2(
        payment_required, PaymentRequirementsV2.from_raw(v2_raw())
    )
    assert decode(signed.header)["extensions"] == {"flavor": "mint"}


async def test_an_extension_that_cannot_be_written_as_json_is_a_type_error():
    payment_required = required()
    payment_required.extensions = {"opaque": object()}
    with pytest.raises(
        TypeError, match="Object of type object is not JSON serializable"
    ):
        await X402Flow(FlowSigner()).sign_payment_v2(
            payment_required, PaymentRequirementsV2.from_raw(v2_raw())
        )


@pytest.mark.parametrize("url", ["not a url", "/settle", "https://"])
async def test_settling_with_an_invalid_facilitator_url_is_refused_before_sending(url):
    sent = []
    flow = flow_with(lambda r: sent.append(r) or httpx.Response(200, json={}))
    payment = await signed_v1(flow)
    with pytest.raises(X402Error, match="invalid facilitator url"):
        await flow.settle_payment(
            payment, PaymentRequirementsV1.from_raw(v1_raw()), url
        )
    assert sent == []


@pytest.mark.parametrize(
    ("base", "expected"),
    [
        ("https://f.example", "https://f.example/settle"),
        ("https://f.example/", "https://f.example/settle"),
        ("https://f.example/api", "https://f.example/api/settle"),
        ("https://f.example/api/", "https://f.example/api/settle"),
    ],
)
async def test_settle_is_posted_under_the_facilitators_path(base, expected):
    seen = []

    def handler(request):
        seen.append(str(request.url))
        return httpx.Response(200, json={"success": True, "transaction": "0xab"})

    flow = flow_with(handler)
    payment = await signed_v1(flow)
    settled = await flow.settle_payment(
        payment, PaymentRequirementsV1.from_raw(v1_raw()), base
    )
    assert seen == [expected]
    assert settled.settlement.success is True
    assert settled.settlement.transaction == "0xab"
    assert settled.payment is payment


async def test_a_facilitator_that_cannot_be_reached_is_an_x402_error():
    def handler(request):
        raise httpx.ConnectError("connection refused", request=request)

    flow = flow_with(handler)
    payment = await signed_v1(flow)
    with pytest.raises(X402Error, match="connection refused") as raised:
        await flow.settle_payment(
            payment, PaymentRequirementsV1.from_raw(v1_raw()), "https://f.example"
        )
    assert isinstance(raised.value.__cause__, httpx.ConnectError)


@pytest.mark.parametrize("status", [400, 404, 500, 503])
async def test_a_failed_settlement_status_carries_the_status_and_body(status):
    flow = flow_with(lambda r: httpx.Response(status, text="nope"))
    payment = await signed_v1(flow)
    with pytest.raises(
        X402Error, match=f"settlement failed with status {status}: nope"
    ):
        await flow.settle_payment(
            payment, PaymentRequirementsV1.from_raw(v1_raw()), "https://f.example"
        )


async def test_a_settlement_that_is_not_json_is_an_x402_error():
    flow = flow_with(lambda r: httpx.Response(200, content=b"<html>"))
    payment = await signed_v1(flow)
    with pytest.raises(X402Error, match="settlement response invalid JSON"):
        await flow.settle_payment(
            payment, PaymentRequirementsV1.from_raw(v1_raw()), "https://f.example"
        )


async def test_a_settlement_body_that_is_not_an_object_reads_as_a_failure():
    flow = flow_with(lambda r: httpx.Response(200, json=["success"]))
    payment = await signed_v1(flow)
    settled = await flow.settle_payment(
        payment, PaymentRequirementsV1.from_raw(v1_raw()), "https://f.example"
    )
    assert settled.settlement.success is False
    assert settled.settlement.raw == {}
    assert settled.settlement.retryable is False


async def test_a_v2_payment_is_not_settled_against_v1_requirements():
    flow = X402Flow(FlowSigner())
    payment = await flow.sign_payment_v2(
        required(), PaymentRequirementsV2.from_raw(v2_raw())
    )
    with pytest.raises(
        X402Error, match="payment is x402 v2, but requirements are x402 v1"
    ):
        await flow.settle_payment(
            payment, PaymentRequirementsV1.from_raw(v1_raw()), "https://f.example"
        )


async def test_an_x402_error_from_the_signer_passes_through_unwrapped():
    error = X402Error("declined by policy")
    flow = X402Flow(FlowSigner(sign_error=error))
    with pytest.raises(X402Error) as raised:
        await signed_v1(flow)
    assert raised.value is error


async def test_any_other_signer_failure_is_wrapped_as_an_x402_error():
    flow = X402Flow(FlowSigner(sign_error=RuntimeError("hsm offline")))
    with pytest.raises(X402Error, match="failed to sign payment: hsm offline"):
        await signed_v1(flow)


async def test_an_x402_error_while_building_the_payment_passes_through_unwrapped():
    error = X402Error("no active cycle")
    flow = X402Flow(FlowSigner(build_error=error))
    with pytest.raises(X402Error) as raised:
        await signed_v1(flow)
    assert raised.value is error


async def test_any_other_failure_while_building_the_payment_is_wrapped():
    signer = FlowSigner(build_error=ConnectionError("core down"))
    flow = X402Flow(signer)
    with pytest.raises(X402Error, match="failed to build payment: core down"):
        await signed_v1(flow)
    assert signer.signed == []


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("maxAmountRequired", "-1"),
        ("maxAmountRequired", "ten"),
        ("maxAmountRequired", "0xzz"),
        ("payTo", "0x1234"),
        ("asset", "not-an-address"),
    ],
)
async def test_unusable_requirements_are_refused_before_building(field, value):
    signer = FlowSigner(build_error=AssertionError("must not build"))
    with pytest.raises(X402Error, match="invalid payment requirements"):
        await X402Flow(signer).sign_payment(
            PaymentRequirementsV1.from_raw(v1_raw(**{field: value}))
        )


async def test_validation_params_of_odd_length_are_refused_as_invalid_validation():
    extra = {
        "validation": {"validator": VALIDATOR, "subject": SUBJECT, "params": "0x123"}
    }
    flow = X402Flow(FlowSigner())
    with pytest.raises(X402Error, match=r"invalid extra\.validation"):
        await flow.sign_payment(PaymentRequirementsV1.from_raw(v1_raw(extra=extra)))


async def test_validation_params_that_are_not_hex_are_refused_as_invalid_validation():
    extra = {
        "validation": {"validator": VALIDATOR, "subject": SUBJECT, "params": "0xzz"}
    }
    flow = X402Flow(FlowSigner())
    with pytest.raises(X402Error, match=r"invalid extra\.validation"):
        await flow.sign_payment(PaymentRequirementsV1.from_raw(v1_raw(extra=extra)))


async def test_a_validation_with_a_deadline_and_params_is_signed_into_the_payment():
    extra = {
        "validation": {
            "validator": VALIDATOR,
            "subject": SUBJECT.upper().replace("0X", "0x"),
            "deadline": "1700000600",
            "params": "0xABCD",
        }
    }
    signer = FlowSigner()
    signed = await X402Flow(signer).sign_payment(
        PaymentRequirementsV1.from_raw(v1_raw(extra=extra))
    )
    validation = signer.signed[0].validation
    assert validation.subject == SUBJECT
    assert validation.deadline == 1_700_000_600
    assert validation.params == "0xabcd"
    assert signed.envelope["payload"]["payload"]["validation"] == {
        "validator": VALIDATOR,
        "subject": SUBJECT,
        "deadline": 1_700_000_600,
        "params": "0xabcd",
    }


def test_extra_that_is_not_an_object_is_refused():
    with pytest.raises(X402Error, match=r"invalid paymentRequirements\.extra$"):
        PaymentRequirementsExtra.from_raw(["validation"])


@pytest.mark.parametrize("raw", [None, {}, []])
def test_empty_extra_has_no_validation(raw):
    assert PaymentRequirementsExtra.from_raw(raw).validation is None


@pytest.mark.parametrize("validation", ["0xabc", ["validator"], 7])
def test_a_validation_that_is_not_an_object_is_refused(validation):
    with pytest.raises(
        X402Error, match=r"invalid paymentRequirements\.extra\.validation"
    ):
        PaymentRequirementsExtra.from_raw({"validation": validation})


@pytest.mark.parametrize(
    "validation",
    [
        {"subject": SUBJECT},
        {"validator": VALIDATOR},
        {"validator": "", "subject": SUBJECT},
        {"validator": VALIDATOR, "subject": ""},
        {"validator": None, "subject": SUBJECT},
    ],
)
def test_a_validation_needs_both_validator_and_subject(validation):
    with pytest.raises(X402Error, match="requires validator and subject"):
        PaymentRequirementsExtra.from_raw({"validation": validation})


@pytest.mark.parametrize("subject", ["0x1234", "0x" + "zz" * 32, "0x" + "22" * 33])
def test_a_validation_subject_that_is_not_bytes32_is_refused(subject):
    with pytest.raises(X402Error, match="invalid validation subject"):
        PaymentRequirementsExtra.from_raw(
            {"validation": {"validator": VALIDATOR, "subject": subject}}
        )


def test_a_validation_without_deadline_or_params_leaves_them_unset():
    extra = PaymentRequirementsExtra.from_raw(
        {"validation": {"validator": VALIDATOR, "subject": "22" * 32, "params": None}}
    )
    assert extra.validation.deadline is None
    assert extra.validation.params is None
    assert extra.validation.subject == SUBJECT


@pytest.mark.parametrize(
    ("missing", "named"),
    [
        ("scheme", "scheme"),
        ("network", "network"),
        ("maxAmountRequired", "maxAmountRequired"),
        ("payTo", "payTo"),
        ("asset", "asset"),
    ],
)
def test_v1_requirements_name_each_missing_field(missing, named):
    raw = v1_raw()
    del raw[missing]
    with pytest.raises(
        X402Error, match=f"payment requirements missing fields: {named}$"
    ):
        PaymentRequirementsV1.from_raw(raw)


def test_v1_requirements_treat_null_and_empty_fields_as_missing_and_list_them_all():
    raw = v1_raw(scheme=None, payTo="", asset=None)
    with pytest.raises(X402Error, match=r"missing fields: scheme, payTo, asset$"):
        PaymentRequirementsV1.from_raw(raw)


def test_v1_requirements_round_trip_every_optional_field():
    raw = v1_raw(
        maxAmountRequired=1000,
        extra={"name": "USDC"},
        resource="https://api.example/r",
        description="weather",
        mimeType="application/json",
        outputSchema={"type": "object"},
        maxTimeoutSeconds=60,
    )
    requirements = PaymentRequirementsV1.from_raw(raw)
    assert requirements.amount == "1000"
    assert requirements.to_payload() == dict(raw, maxAmountRequired="1000")


def test_v1_requirements_omit_unset_optional_fields_and_empty_extra():
    requirements = PaymentRequirementsV1.from_raw(v1_raw(extra=None, description=None))
    assert requirements.extra == {}
    assert requirements.to_payload() == v1_raw()


def test_v1_requirements_ignore_snake_case_spellings():
    raw = v1_raw()
    raw["max_amount_required"] = raw.pop("maxAmountRequired")
    with pytest.raises(X402Error, match="maxAmountRequired"):
        PaymentRequirementsV1.from_raw(raw)


@pytest.mark.parametrize("missing", ["scheme", "network", "amount", "payTo", "asset"])
def test_v2_requirements_name_each_missing_field(missing):
    raw = v2_raw(**{missing: None})
    with pytest.raises(X402Error, match=f"missing fields: {missing}$"):
        PaymentRequirementsV2.from_raw(raw)


def test_v2_requirements_parse_a_timeout_sent_as_a_string():
    requirements = PaymentRequirementsV2.from_raw(
        v2_raw(maxTimeoutSeconds="30", amount=5)
    )
    assert requirements.max_timeout_seconds == 30
    assert requirements.amount == "5"
    assert requirements.to_payload()["maxTimeoutSeconds"] == 30


def test_v2_requirements_echo_an_advertised_empty_extra_but_not_an_absent_one():
    advertised = PaymentRequirementsV2.from_raw(v2_raw(extra={}))
    absent = PaymentRequirementsV2.from_raw(v2_raw())
    null = PaymentRequirementsV2.from_raw(v2_raw(extra=None))
    assert advertised.to_payload()["extra"] == {}
    assert "extra" not in absent.to_payload()
    assert "extra" not in null.to_payload()
    assert advertised == absent


@pytest.mark.parametrize(
    "raw", [None, "https://api.example/r", {}, {"url": ""}, {"description": "x"}]
)
def test_resource_info_without_a_url_is_refused(raw):
    with pytest.raises(X402Error, match="invalid resource info"):
        X402ResourceInfo.from_raw(raw)


def test_resource_info_round_trips_description_and_mime_type():
    raw = {
        "url": "https://api.example/r",
        "description": "weather",
        "mimeType": "text/plain",
    }
    info = X402ResourceInfo.from_raw(raw)
    assert info.to_payload() == raw


def test_resource_info_omits_what_it_was_not_given():
    assert X402ResourceInfo.from_raw({"url": "https://a.example"}).to_payload() == {
        "url": "https://a.example"
    }


@pytest.mark.parametrize("raw", [None, [], "x402", 2])
def test_a_payment_required_body_that_is_not_an_object_is_refused(raw):
    with pytest.raises(X402Error, match="invalid payment required payload"):
        X402PaymentRequired.from_raw(raw)


@pytest.mark.parametrize("raw", [{}, {"x402Version": None}])
def test_a_payment_required_body_without_a_version_is_refused(raw):
    with pytest.raises(X402Error, match="missing x402Version"):
        X402PaymentRequired.from_raw(raw)


def test_a_payment_required_body_without_a_resource_is_refused():
    with pytest.raises(X402Error, match="invalid resource info"):
        X402PaymentRequired.from_raw({"x402Version": 2, "accepts": []})


def test_a_payment_required_body_reads_version_strings_and_null_accepts():
    parsed = X402PaymentRequired.from_raw(
        {
            "x402Version": "2",
            "resource": {"url": "https://a.example"},
            "accepts": None,
            "error": "payment required",
        }
    )
    assert parsed.x402_version == 2
    assert parsed.accepts == []
    assert parsed.error == "payment required"
    assert parsed.extensions is None


@pytest.mark.parametrize("raw", [None, "ok", ["success"], 1])
def test_a_settlement_that_is_not_an_object_is_an_empty_failure(raw):
    receipt = SettlementReceipt.from_raw(raw)
    assert receipt.success is False
    assert receipt.transaction is None
    assert receipt.receipt is None
    assert receipt.details is None
    assert receipt.raw == {}


def test_a_settlement_with_an_empty_transaction_and_odd_extra_reads_as_none():
    receipt = SettlementReceipt.from_raw(
        {"success": True, "transaction": "", "extra": ["retryable"]}
    )
    assert receipt.transaction is None
    assert receipt.retryable is False
    assert receipt.details is None


def test_a_settlement_receipt_missing_its_signature_is_not_parsed():
    receipt = SettlementReceipt.from_raw(
        {
            "success": True,
            "extra": {
                "receipt": {"receipt": "0xab", "signature": None},
                "details": "x",
            },
        }
    )
    assert receipt.receipt is None
    assert receipt.details is None
