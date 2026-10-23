import pytest

from fourmica_sdk.errors import InvalidParamsError
from fourmica_sdk.models import (
    ActiveCycleResponse,
    CheckpointBatchResponse,
    CheckpointRequiredDetails,
    ClearingParticipantProof,
    ClearingSettlementActionResponse,
    CorePublicParameters,
    CycleMismatchDetails,
    PaymentRequestPayload,
    SupportedTokensResponse,
    TimestampNotPastCutoffDetails,
    ValidationRequirement,
    parse_refusal_details,
)

ACTION_SNAKE = {
    "contract_address": "0x2222222222222222222222222222222222222222",
    "function_name": "payNetDebit",
    "action": "pay_net_debit",
    "cycle_id": "0x" + "aa" * 32,
    "cycle_id_text": "cycle",
    "asset_address": "0x0000000000000000000000000000000000000000",
    "participant": "0x1234567890123456789012345678901234567890",
    "amount": "10",
    "payable_value": "10",
    "proof": [],
}


def test_action_parses_camel_case_too():
    camel = {
        "contractAddress": ACTION_SNAKE["contract_address"],
        "functionName": "claimNetCreditFor",
        "action": "claim_net_credit",
        "cycleId": ACTION_SNAKE["cycle_id"],
        "cycleIdText": "cycle",
        "assetAddress": ACTION_SNAKE["asset_address"],
        "participant": ACTION_SNAKE["participant"],
        "amount": "10",
        "payableValue": "0",
        "proof": ["0x" + "dd" * 32],
    }
    action = ClearingSettlementActionResponse.from_rpc(camel)
    assert action.function_name == "claimNetCreditFor"
    assert action.payable_value == 0


def test_action_rejects_bad_cycle_id():
    bad = dict(ACTION_SNAKE, cycle_id="not-a-cycle")
    with pytest.raises(InvalidParamsError):
        ClearingSettlementActionResponse.from_rpc(bad)


def test_proof_rejects_unknown_role():
    raw = {
        "cycle_id": "0x" + "aa" * 32,
        "cycle_id_text": "cycle",
        "asset_address": "0x0000000000000000000000000000000000000000",
        "participant": "0x1234567890123456789012345678901234567890",
        "role": "FLAT",
        "amount": "0",
        "net_debit": "0",
        "net_credit": "0",
        "leaf": "0x" + "bb" * 32,
        "merkle_root": "0x" + "cc" * 32,
        "proof": [],
    }
    with pytest.raises(InvalidParamsError):
        ClearingParticipantProof.from_rpc(raw)


def test_public_params_parse_the_signing_addresses():
    params = CorePublicParameters.from_rpc(
        {
            "guarantee_signer": "0x0000000000000000000000000000000000005164",
            "contract_address": "0x2222222222222222222222222222222222222222",
            "guarantee_registry_address": "0x0000000000000000000000000000000000065e61",
            "clearing_house_address": "0x00000000000000000000000000000000c1ea4111",
            "eip712_name": "4micaClearingHouse",
            "eip712_version": "1",
            "chain_id": 1337,
            "supported_payment_payload_versions": [1],
            "validators": ["https://validator.acme.io/checks"],
        }
    )
    assert params.guarantee_signer == "0x0000000000000000000000000000000000005164"
    assert params.clearing_house_address.endswith("c1ea4111")
    assert params.guarantee_registry_address.endswith("065e61")
    assert params.supported_payment_payload_versions == [1]
    assert params.validators == ["https://validator.acme.io/checks"]


def test_public_params_default_what_an_older_core_omits():
    params = CorePublicParameters.from_rpc(
        {
            "contract_address": "0x2222222222222222222222222222222222222222",
            "eip712_name": "4micaClearingHouse",
            "eip712_version": "1",
            "chain_id": 84532,
        }
    )
    assert params.supported_payment_payload_versions == [1]
    assert params.guarantee_signer == ""
    assert params.ethereum_http_rpc_url == ""
    # An explicit empty list means a core that accepts nothing, not a default.
    explicit = CorePublicParameters.from_rpc(
        {
            "contract_address": "0x2222222222222222222222222222222222222222",
            "eip712_name": "4micaClearingHouse",
            "eip712_version": "1",
            "chain_id": 84532,
            "supported_payment_payload_versions": [],
        }
    )
    assert explicit.supported_payment_payload_versions == []


PAYLOAD_JSON = {
    "version": "v1",
    "user_address": "0x1234567890123456789012345678901234567890",
    "recipient_address": "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    "cycle_id": "0x" + "55" * 32,
    "req_id": "2",
    "amount": "3",
    "asset_address": "0x0000000000000000000000000000000000000000",
    "timestamp": 100,
    "salt": "0x" + "99" * 32,
}


def test_payload_parses_decimal_or_hex_amounts():
    decoded = PaymentRequestPayload.from_rpc(PAYLOAD_JSON)
    assert decoded.version == 1
    assert decoded.req_id == 2
    assert decoded.amount == 3
    assert decoded.validation is None
    assert PaymentRequestPayload.from_rpc(dict(PAYLOAD_JSON, amount="0x3")).amount == 3


def test_payload_serializes_v1_tagged_hex():
    payload = PaymentRequestPayload.from_rpc(PAYLOAD_JSON).to_payload()
    assert payload["version"] == "v1"
    assert payload["req_id"] == "0x2"
    assert payload["amount"] == "0x3"
    assert payload["cycle_id"] == "0x" + "55" * 32
    assert payload["salt"] == "0x" + "99" * 32
    assert "validation" not in payload


def test_payload_keeps_the_addresses_as_spelled():
    """What travels is what the payer signed over, and a resource server may
    compare the recipient as a string."""
    payload = PaymentRequestPayload.from_rpc(PAYLOAD_JSON).to_payload()
    assert payload["recipient_address"] == PAYLOAD_JSON["recipient_address"]


def test_a_payload_without_a_version_tag_is_refused():
    """The tag is what selects a layout, so a payload without one is
    unroutable rather than defaulted."""
    raw = dict(PAYLOAD_JSON)
    del raw["version"]
    with pytest.raises(InvalidParamsError, match="version tag"):
        PaymentRequestPayload.from_rpc(raw)


def test_an_unknown_payload_version_is_refused():
    with pytest.raises(InvalidParamsError, match="unsupported payment payload"):
        PaymentRequestPayload.from_rpc(dict(PAYLOAD_JSON, version="v9"))


@pytest.mark.parametrize("field", ["cycle_id", "salt"])
def test_cycle_id_and_salt_are_required(field):
    """Both are part of what the payer signs, so a payload without them
    cannot be verified and must not parse into something that looks whole."""
    raw = dict(PAYLOAD_JSON)
    del raw[field]
    with pytest.raises(InvalidParamsError, match=field):
        PaymentRequestPayload.from_rpc(raw)


@pytest.mark.parametrize(
    "field,value",
    [
        ("user_address", "nope"),
        ("cycle_id", "0x1234"),
        ("timestamp", 2**64),
        ("amount", "-1"),
    ],
)
def test_a_malformed_payload_is_refused(field, value):
    with pytest.raises(InvalidParamsError):
        PaymentRequestPayload.from_rpc(dict(PAYLOAD_JSON, **{field: value}))


def test_validation_round_trips_nested_not_flattened():
    validation = ValidationRequirement(
        validator="eip155:84532:0x1111111111111111111111111111111111111111",
        subject="0x" + "11" * 32,
        deadline=1_736_003_600,
        params="0x010203",
    )
    payload = PaymentRequestPayload.from_rpc(PAYLOAD_JSON).with_validation(validation)
    wire = payload.to_payload()
    assert "validation" in wire
    assert "validator" not in wire
    assert PaymentRequestPayload.from_rpc(wire) == payload


def test_new_payloads_get_a_fresh_salt():
    def build():
        return PaymentRequestPayload.new(
            user_address="0x1234567890123456789012345678901234567890",
            recipient_address="0x00000000000000000000000000000000000000Be",
            cycle_id="0x" + "55" * 32,
            req_id=1,
            amount=1,
            timestamp=1,
        )

    assert build().salt != build().salt


def test_active_cycle_tolerates_a_core_that_predates_the_clock():
    cycle = ActiveCycleResponse.from_rpc(
        {
            "cycle_id": "0x" + "AB" * 32,
            "cycle_id_text": "0x0:1700000000",
            "asset_address": "0x0000000000000000000000000000000000000000",
            "period_start": 1_700_000_000,
            "period_end": 1_700_086_400,
        }
    )
    assert cycle.cycle_id == "0x" + "ab" * 32
    assert cycle.server_time == 0
    assert cycle.max_uncheckpointed == 0


def test_checkpoint_batch_parses_previous_and_authorizations():
    batch = CheckpointBatchResponse.from_rpc(
        {
            "cycle_id": "0x" + "55" * 32,
            "cycle_id_text": "0x0:1700000000",
            "asset_address": "0x0000000000000000000000000000000000000000",
            "payer": PAYLOAD_JSON["user_address"],
            "previous": {
                "payload": {
                    "payer": PAYLOAD_JSON["user_address"],
                    "cycle_id": "0x" + "55" * 32,
                    "asset_address": "0x0000000000000000000000000000000000000000",
                    "cumulative_gross": "0x78",
                    "timestamp_cutoff": 99,
                },
                "signature": "0xaa",
            },
            "authorizations": [{"payload": PAYLOAD_JSON, "signature": "0xbb"}],
            "max_uncheckpointed": 64,
        }
    )
    assert batch.previous.payload.cumulative_gross == 120
    assert batch.authorizations[0].payload.req_id == 2
    assert batch.authorizations[0].signature == "0xbb"
    assert batch.max_uncheckpointed == 64


def test_refusal_details_parse_what_core_sends():
    details = parse_refusal_details(
        TimestampNotPastCutoffDetails,
        {
            "cycle_id": "0x" + "11" * 32,
            "cycle_id_text": "0x0:1700000000",
            "asset_address": "0x0000000000000000000000000000000000000000",
            "payer": "0x00000000000000000000000000000000000000be",
            "timestamp": 1_700_000_000,
            "timestamp_cutoff": 1_700_000_000,
            "cumulative_gross": "500",
            "server_time": 1_700_000_001,
        },
    )
    assert details.cumulative_gross == 500
    assert details.payer == "0x00000000000000000000000000000000000000be"


def test_refusal_details_default_what_an_older_core_omits():
    details = parse_refusal_details(
        CycleMismatchDetails,
        {
            "signed_cycle_id": "0x11",
            "active_cycle_id": "0x22",
            "active_cycle_id_text": "t",
            "active_period_end": 5,
        },
    )
    assert details.server_time == 0


@pytest.mark.parametrize(
    "raw",
    [None, "nope", {}, {"uncheckpointed": "lots"}],
)
def test_unreadable_refusal_details_are_none(raw):
    assert parse_refusal_details(CheckpointRequiredDetails, raw) is None


def test_validation_payload_omits_empty_optionals():
    validation = ValidationRequirement(
        validator="validator-id", subject="0x" + "42" * 32
    )
    payload = validation.to_payload()
    assert "deadline" not in payload
    assert "params" not in payload

    full = ValidationRequirement(
        validator="validator-id",
        subject="0x" + "42" * 32,
        deadline=123,
        params="0xdeadbeef",
    )
    assert full.to_payload()["deadline"] == 123
    assert full.to_payload()["params"] == "0xdeadbeef"


def test_supported_tokens_carry_domain_separator():
    tokens = SupportedTokensResponse.from_rpc(
        {
            "chain_id": 84532,
            "tokens": [
                {
                    "symbol": "USDC",
                    "address": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                    "decimals": 6,
                    "domain_separator": "0x" + "aa" * 32,
                },
                {"symbol": "ODD", "address": "0x" + "11" * 20},
            ],
        }
    )
    assert tokens.tokens[0].domain_separator == "0x" + "aa" * 32
    assert tokens.tokens[1].domain_separator is None
