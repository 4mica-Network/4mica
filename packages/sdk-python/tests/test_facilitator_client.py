import json

import httpx
import pytest

from fourmica_sdk.client.facilitator import (
    ALREADY_SUBMITTED,
    NAMES_THE_CLAIM,
    NAMES_THE_PAYMENT,
    NAMES_THE_REQUEST,
    Facilitator,
    confirm_facilitator_echo,
    eip2612_nonce,
    refuses_the_authorization,
    rejection_error,
    sponsorship_unavailable,
)
from fourmica_sdk.errors import (
    ClientError,
    FacilitatorNotConfiguredError,
    FacilitatorRejectedError,
    MissingTokenDomainSeparatorError,
    OutcomeUnknownError,
    Permit2AllowanceRequiredError,
    SponsorshipError,
    SponsorshipTransportError,
    TransactionOutcomeUnknownError,
)

TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"


def facilitator(handler, base: str = "https://facilitator.example") -> Facilitator:
    return Facilitator(
        base, client=httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )


def answering(response: httpx.Response):
    return lambda request: response


def test_a_facilitator_without_a_url_is_not_configured():
    assert not Facilitator(None).is_configured()
    assert Facilitator("https://facilitator.example/").is_configured()


async def test_posting_without_a_url_raises_not_configured_and_sends_nothing():
    sent = []
    unconfigured = Facilitator(
        None,
        client=httpx.AsyncClient(transport=httpx.MockTransport(sent.append)),
    )
    with pytest.raises(FacilitatorNotConfiguredError, match="no facilitator"):
        await unconfigured.post("deposit", {})
    assert sent == []


@pytest.mark.parametrize(
    "base", ["https://facilitator.example", "https://facilitator.example/"]
)
async def test_the_path_is_joined_with_exactly_one_slash_and_the_body_is_json(base):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["body"] = json.loads(request.content)
        seen["method"] = request.method
        return httpx.Response(200, json={"ok": True})

    assert await facilitator(handler, base).post("clearing/pay", {"a": 1}) == {
        "ok": True
    }
    assert seen == {
        "url": "https://facilitator.example/clearing/pay",
        "body": {"a": 1},
        "method": "POST",
    }


async def test_a_base_url_with_a_path_keeps_its_prefix():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["path"] = request.url.path
        return httpx.Response(200, json={})

    await facilitator(handler, "https://h.example/v2").post("deposit", {})
    assert seen["path"] == "/v2/deposit"


@pytest.mark.parametrize(
    "error",
    [
        httpx.ConnectError,
        httpx.ConnectTimeout,
        httpx.PoolTimeout,
        httpx.UnsupportedProtocol,
    ],
)
async def test_a_request_that_never_reached_the_facilitator_is_a_transport_error(
    error,
):
    def refuse(request: httpx.Request) -> httpx.Response:
        raise error("refused", request=request)

    with pytest.raises(SponsorshipTransportError, match="refused") as raised:
        await facilitator(refuse).post("deposit", {})
    assert not isinstance(raised.value, OutcomeUnknownError)


async def test_an_invalid_url_is_a_transport_error():
    def refuse(request: httpx.Request) -> httpx.Response:
        raise httpx.InvalidURL("bad url")

    with pytest.raises(SponsorshipTransportError, match="bad url"):
        await facilitator(refuse).post("deposit", {})


@pytest.mark.parametrize(
    "error",
    [httpx.ReadTimeout, httpx.WriteTimeout, httpx.ReadError, httpx.RemoteProtocolError],
)
async def test_a_request_that_may_have_landed_is_an_unknown_outcome(error):
    def fail(request: httpx.Request) -> httpx.Response:
        raise error("lost", request=request)

    with pytest.raises(OutcomeUnknownError, match="facilitator request failed"):
        await facilitator(fail).post("deposit", {})


@pytest.mark.parametrize("status", [400, 401, 403, 404, 409, 422, 429, 499])
async def test_a_client_error_status_is_a_transport_error_with_the_body(status):
    response = httpx.Response(status, text="nope")
    with pytest.raises(SponsorshipTransportError) as raised:
        await facilitator(answering(response)).post("deposit", {})
    assert str(raised.value) == f"facilitator returned {status}: nope"


@pytest.mark.parametrize("status", [408, 500, 502, 503, 504, 599, 302])
async def test_a_timeout_server_error_or_redirect_status_is_an_unknown_outcome(
    status,
):
    response = httpx.Response(status, text="down")
    with pytest.raises(OutcomeUnknownError, match=f"facilitator returned {status}"):
        await facilitator(answering(response)).post("deposit", {})


async def test_a_success_status_with_a_body_that_is_not_json_is_an_unknown_outcome():
    response = httpx.Response(200, text="<html>")
    with pytest.raises(OutcomeUnknownError, match="malformed facilitator response"):
        await facilitator(answering(response)).post("deposit", {})


@pytest.mark.parametrize("body", ["[]", "[1, 2]", '"ok"', "7", "null", "true"])
async def test_a_json_body_that_is_not_an_object_is_an_unknown_outcome(body):
    response = httpx.Response(200, content=body.encode())
    with pytest.raises(OutcomeUnknownError, match="not an object"):
        await facilitator(answering(response)).post("deposit", {})


async def test_aclose_closes_the_http_client():
    client = httpx.AsyncClient(transport=httpx.MockTransport(answering(None)))
    await Facilitator("https://f.example/", client=client).aclose()
    assert client.is_closed


def test_an_absent_echo_trusts_the_expected_value():
    assert confirm_facilitator_echo("debtor", None, TOKEN) == TOKEN


def test_an_echo_in_another_case_returns_the_expected_spelling():
    assert confirm_facilitator_echo("debtor", TOKEN.lower(), TOKEN) == TOKEN
    assert confirm_facilitator_echo("debtor", TOKEN.upper(), TOKEN) == TOKEN


@pytest.mark.parametrize("raw", ["", "0x" + "00" * 20, TOKEN + "00"])
def test_an_echo_of_something_else_is_an_unknown_outcome(raw):
    with pytest.raises(OutcomeUnknownError, match="facilitator echoed creditor"):
        confirm_facilitator_echo("creditor", raw, TOKEN)


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        ({}, None),
        ({"extra": None}, None),
        ({"extra": "details"}, None),
        ({"extra": {}}, None),
        ({"extra": {"details": None}}, None),
        ({"extra": {"details": ["3"]}}, None),
        ({"extra": {"details": {}}}, None),
        ({"extra": {"details": {"eip2612Nonce": None}}}, None),
        ({"extra": {"details": {"eip2612Nonce": "three"}}}, None),
        ({"extra": {"details": {"eip2612Nonce": "1.5"}}}, None),
        ({"extra": {"details": {"eip2612Nonce": "3"}}}, 3),
        ({"extra": {"details": {"eip2612Nonce": 0}}}, 0),
        ({"extra": {"details": {"eip2612Nonce": "0x10"}}}, 16),
        ({"extra": {"details": {"eip2612Nonce": str(2**256 - 1)}}}, 2**256 - 1),
    ],
)
def test_the_eip2612_nonce_is_read_only_from_a_well_formed_detail(payload, expected):
    assert eip2612_nonce(payload) == expected


def test_a_permit2_rejection_carries_the_nonce_the_facilitator_offered():
    error = rejection_error(
        {"extra": {"details": {"eip2612Nonce": "9"}}},
        "permit2_allowance_required",
        "approve first",
    )
    assert isinstance(error, Permit2AllowanceRequiredError)
    assert error.eip2612_nonce == 9
    assert "approve first" in str(error)


def test_a_permit2_rejection_without_a_message_still_explains_itself():
    error = rejection_error({}, "permit2_allowance_required", None)
    assert isinstance(error, Permit2AllowanceRequiredError)
    assert error.eip2612_nonce is None
    assert "facilitator gave no reason" in str(error)


def test_sponsorship_unavailable_without_a_message_reads_as_unconfigured():
    error = rejection_error({}, "sponsorship_unavailable", None)
    assert isinstance(error, FacilitatorNotConfiguredError)
    assert "no facilitator configured" in str(error)


def test_a_rejection_with_no_reason_is_coded_unknown():
    error = rejection_error({}, None, None)
    assert isinstance(error, FacilitatorRejectedError)
    assert error.code == "unknown"
    assert str(error) == (
        "facilitator rejected the request (unknown): facilitator gave no reason"
    )
    assert error.retryable is False
    assert error.transaction is None
    assert error.details is None


def test_a_rejection_reads_retryable_and_details_from_extra():
    error = rejection_error(
        {
            "extra": {"retryable": 1, "details": {"k": "v"}},
            "transaction": "0x" + "ab" * 32,
        },
        "rate_limited",
        "slow down",
    )
    assert isinstance(error, FacilitatorRejectedError)
    assert error.retryable is True
    assert error.details == {"k": "v"}
    assert error.transaction == "0x" + "ab" * 32


@pytest.mark.parametrize("transaction", [None, "", 123, ["0x1"]])
def test_a_rejection_drops_a_transaction_that_is_not_a_non_empty_string(transaction):
    error = rejection_error({"transaction": transaction}, "rate_limited", None)
    assert isinstance(error, FacilitatorRejectedError)
    assert error.transaction is None


def test_a_rejection_ignores_an_extra_that_is_not_an_object():
    error = rejection_error({"extra": ["retryable"]}, "rate_limited", None)
    assert isinstance(error, FacilitatorRejectedError)
    assert error.retryable is False
    assert error.details is None


@pytest.mark.parametrize(
    "error",
    [
        OutcomeUnknownError("lost"),
        TransactionOutcomeUnknownError("lost", stage="receipt"),
        Permit2AllowanceRequiredError("approve", 3),
        Permit2AllowanceRequiredError("approve"),
        ClientError("not sponsorship"),
        ValueError("plain"),
    ],
)
def test_an_unknown_outcome_permit2_gap_or_unrelated_error_never_falls_back(error):
    assert not sponsorship_unavailable(error, NAMES_THE_REQUEST)


@pytest.mark.parametrize(
    "error",
    [
        FacilitatorNotConfiguredError(),
        SponsorshipTransportError("down"),
        SponsorshipError("generic"),
        FacilitatorRejectedError("rate_limited", "slow"),
    ],
)
def test_a_facilitator_that_cannot_sponsor_allows_the_fallback(error):
    assert sponsorship_unavailable(error, NAMES_THE_REQUEST)


@pytest.mark.parametrize("code", sorted(ALREADY_SUBMITTED))
def test_a_request_already_submitted_never_falls_back_whatever_the_names(code):
    assert not sponsorship_unavailable(
        FacilitatorRejectedError(code, "busy"), frozenset()
    )


@pytest.mark.parametrize(
    ("names", "code"),
    [
        (NAMES_THE_CLAIM, "clearing_action_mismatch"),
        (NAMES_THE_PAYMENT, "insufficient_funds"),
        (NAMES_THE_PAYMENT, "nonce_already_used"),
        (NAMES_THE_REQUEST, "invalid_signature"),
    ],
)
def test_a_rejection_naming_the_request_never_falls_back(names, code):
    assert not sponsorship_unavailable(FacilitatorRejectedError(code, "x"), names)


def test_the_payment_names_include_every_claim_name():
    assert NAMES_THE_CLAIM < NAMES_THE_PAYMENT
    assert "insufficient_funds" not in NAMES_THE_CLAIM


def test_a_missing_token_domain_refuses_the_authorization():
    assert refuses_the_authorization(MissingTokenDomainSeparatorError(TOKEN))


@pytest.mark.parametrize(
    ("code", "refuses"),
    [
        ("simulation_reverted", True),
        ("unsupported_transfer_method", True),
        ("invalid_signature", False),
        ("rate_limited", False),
    ],
)
def test_only_a_method_level_rejection_refuses_the_authorization(code, refuses):
    assert refuses_the_authorization(FacilitatorRejectedError(code, "x")) is refuses


def test_an_error_that_is_not_a_rejection_does_not_refuse_the_authorization():
    assert not refuses_the_authorization(SponsorshipTransportError("down"))
    assert not refuses_the_authorization(OutcomeUnknownError("lost"))
