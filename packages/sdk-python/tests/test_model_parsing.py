import pytest

from fourmica_sdk.errors import InvalidParamsError
from fourmica_sdk.models import (
    ActiveCycleResponse,
    AssetBalanceInfo,
    CheckpointAcceptedResponse,
    CheckpointBatchResponse,
    CheckpointPayload,
    CheckpointRequiredDetails,
    CorePublicParameters,
    FutureTimestampDetails,
    PaymentRequest,
    PaymentRequestPayload,
    RecipientPaymentInfo,
    SignedCheckpoint,
    UserSuspensionStatus,
    ValidationRequirement,
    parse_refusal_details,
)
from fourmica_sdk.utils import (
    ValidationError,
    normalize_bytes32_hex,
    parse_u256,
    serialize_u256,
)

PAYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
ASSET = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
RECIPIENT = "0x00000000000000000000000000000000000000Be"
CYCLE = "0x" + "11" * 32
U64_MAX = 2**64 - 1
U256_MAX = 2**256 - 1


def checkpoint_raw(**overrides) -> dict:
    raw = {
        "payer": PAYER,
        "cycle_id": CYCLE,
        "asset_address": ASSET,
        "cumulative_gross": "0x64",
        "timestamp_cutoff": 1_700_000_000,
    }
    raw.update(overrides)
    return raw


def cycle_raw(**overrides) -> dict:
    raw = {
        "cycle_id": CYCLE,
        "cycle_id_text": "t",
        "asset_address": ASSET,
        "period_start": 1_700_000_000,
        "period_end": 1_700_086_400,
        "server_time": 1_700_000_100,
        "max_uncheckpointed": 8,
    }
    raw.update(overrides)
    return raw


def batch_raw(**overrides) -> dict:
    raw = {
        "cycle_id": CYCLE,
        "asset_address": ASSET,
        "payer": PAYER,
    }
    raw.update(overrides)
    return raw


def accepted_raw(**overrides) -> dict:
    raw = {
        "cycle_id": CYCLE,
        "cycle_id_text": "t",
        "asset_address": ASSET,
        "payer": PAYER,
        "cumulative_gross": "100",
        "timestamp_cutoff": 1_700_000_000,
        "covered": 3,
    }
    raw.update(overrides)
    return raw


def params_raw(**overrides) -> dict:
    raw = {
        "contract_address": "0x2222222222222222222222222222222222222222",
        "eip712_name": "4micaClearingHouse",
        "eip712_version": "1",
        "chain_id": 84532,
    }
    raw.update(overrides)
    return raw


def payload(**overrides) -> PaymentRequestPayload:
    values = {
        "user_address": PAYER,
        "recipient_address": RECIPIENT,
        "cycle_id": CYCLE,
        "req_id": 1,
        "amount": 10,
        "asset_address": ASSET,
        "timestamp": 1_700_000_000,
        "salt": "0x" + "22" * 32,
    }
    values.update(overrides)
    return PaymentRequestPayload(**values)


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ("ABCD", "0xabcd"),
        ("0XABCD", "0xabcd"),
        (" 0xab ", "0xab"),
        ("", "0x"),
        (None, "0x"),
    ],
)
def test_validation_params_are_normalized_to_lowercase_prefixed_hex(params, expected):
    validation = ValidationRequirement(validator="v", subject=CYCLE, params=params)
    assert validation.params == expected


@pytest.mark.parametrize("params", ["0xabc", "a", "0x0"])
def test_validation_params_of_odd_length_are_refused(params):
    with pytest.raises(ValidationError, match="invalid hex bytes"):
        ValidationRequirement(validator="v", subject=CYCLE, params=params)


def test_validation_params_that_are_not_hex_are_refused_as_a_validation_error():
    with pytest.raises(ValidationError, match="invalid hex bytes"):
        ValidationRequirement(validator="v", subject=CYCLE, params="0xzz")


def test_a_validation_deadline_sent_as_a_string_is_read_as_an_integer():
    validation = ValidationRequirement.from_rpc(
        {"validator": "v", "subject": CYCLE, "deadline": "60"}
    )
    assert validation.deadline == 60
    assert validation.params == "0x"
    assert validation.to_payload() == {
        "validator": "v",
        "subject": CYCLE,
        "deadline": 60,
    }


@pytest.mark.parametrize("size", [0, 31, 33])
def test_a_cycle_id_given_as_bytes_must_be_exactly_32_bytes(size):
    with pytest.raises(ValidationError, match=f"expected 32 bytes, got {size}"):
        payload(cycle_id=b"\x11" * size)


def test_a_salt_given_as_a_bytearray_is_stored_as_hex():
    assert payload(salt=bytearray(b"\x33" * 32)).salt == "0x" + "33" * 32


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("timestamp", -1),
        ("timestamp", 2**64),
        ("amount", -5),
        ("amount", "abc"),
        ("amount", 1.5),
        ("req_id", "-0x1"),
        ("user_address", "0x1234"),
        ("asset_address", ""),
    ],
)
def test_a_payload_with_an_out_of_range_or_malformed_field_is_refused(field, value):
    with pytest.raises(ValidationError):
        payload(**{field: value})


def test_a_payload_accepts_the_u64_and_u256_upper_bounds():
    built = payload(timestamp=U64_MAX, amount=U256_MAX, req_id=str(U256_MAX))
    assert built.timestamp == U64_MAX
    assert built.amount == U256_MAX
    assert built.to_payload()["amount"] == "0x" + "f" * 64


@pytest.mark.parametrize("raw", [None, [], "v1", 1])
def test_a_payment_payload_that_is_not_an_object_is_refused(raw):
    with pytest.raises(InvalidParamsError, match="payment payload must be an object"):
        PaymentRequestPayload.from_rpc(raw)


@pytest.mark.parametrize("missing", ["payload", "signature"])
def test_a_payment_request_missing_its_payload_or_signature_is_refused(missing):
    raw = {"payload": payload().to_payload(), "signature": "0xab"}
    raw[missing] = None
    with pytest.raises(
        InvalidParamsError, match=f"payment request is missing {missing}"
    ):
        PaymentRequest.from_rpc(raw)


def test_a_checkpoint_round_trips_through_the_wire():
    parsed = CheckpointPayload.from_rpc(checkpoint_raw())
    assert parsed.cumulative_gross == 100
    assert CheckpointPayload.from_rpc(parsed.to_payload()) == parsed
    assert parsed.to_payload()["cumulative_gross"] == "0x64"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("cumulative_gross", "-1"),
        ("cumulative_gross", "lots"),
        ("timestamp_cutoff", 2**64),
        ("timestamp_cutoff", "soon"),
        ("cycle_id", "0x1234"),
        ("payer", "0xnot"),
    ],
)
def test_a_malformed_checkpoint_is_refused(field, value):
    with pytest.raises(InvalidParamsError, match="invalid checkpoint"):
        CheckpointPayload.from_rpc(checkpoint_raw(**{field: value}))


@pytest.mark.parametrize(
    "missing",
    ["payer", "cycle_id", "asset_address", "cumulative_gross", "timestamp_cutoff"],
)
def test_a_checkpoint_missing_a_field_names_it(missing):
    with pytest.raises(InvalidParamsError, match=f"checkpoint is missing {missing}"):
        CheckpointPayload.from_rpc(checkpoint_raw(**{missing: None}))


def test_a_signed_checkpoint_round_trips_through_the_wire():
    signed = SignedCheckpoint.from_rpc(
        {"payload": checkpoint_raw(), "signature": "0xcd"}
    )
    assert SignedCheckpoint.from_rpc(signed.to_payload()) == signed


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("period_start", -1),
        ("period_end", 2**64),
        ("server_time", "noon"),
        ("max_uncheckpointed", "many"),
        ("cycle_id", "0xab"),
    ],
)
def test_a_malformed_active_cycle_is_refused(field, value):
    with pytest.raises(InvalidParamsError, match="invalid active cycle"):
        ActiveCycleResponse.from_rpc(cycle_raw(**{field: value}))


@pytest.mark.parametrize(
    "missing", ["cycle_id", "asset_address", "period_start", "period_end"]
)
def test_an_active_cycle_missing_a_required_field_names_it(missing):
    raw = cycle_raw()
    del raw[missing]
    with pytest.raises(InvalidParamsError, match=f"active cycle is missing {missing}"):
        ActiveCycleResponse.from_rpc(raw)


def test_an_active_cycle_reads_null_optionals_as_zero():
    cycle = ActiveCycleResponse.from_rpc(
        cycle_raw(cycle_id_text=None, server_time=None, max_uncheckpointed=None)
    )
    assert cycle.cycle_id_text == ""
    assert cycle.server_time == 0
    assert cycle.max_uncheckpointed == 0


def test_a_first_checkpoint_batch_has_no_previous_and_no_authorizations():
    batch = CheckpointBatchResponse.from_rpc(
        batch_raw(previous=None, authorizations=None)
    )
    assert batch.previous is None
    assert batch.authorizations == []
    assert batch.cycle_id_text == ""
    assert batch.max_uncheckpointed == 0


@pytest.mark.parametrize(
    "overrides",
    [
        {"cycle_id": "nope"},
        {"max_uncheckpointed": "x"},
        {"authorizations": [5]},
    ],
)
def test_a_malformed_checkpoint_batch_is_refused(overrides):
    with pytest.raises(InvalidParamsError, match="invalid checkpoint batch"):
        CheckpointBatchResponse.from_rpc(batch_raw(**overrides))


def test_a_checkpoint_batch_with_a_malformed_previous_checkpoint_is_refused():
    with pytest.raises(InvalidParamsError, match="invalid checkpoint"):
        CheckpointBatchResponse.from_rpc(
            batch_raw(
                previous={
                    "payload": checkpoint_raw(cumulative_gross="-1"),
                    "signature": "0x",
                }
            )
        )


def test_an_accepted_checkpoint_is_parsed():
    accepted = CheckpointAcceptedResponse.from_rpc(
        accepted_raw(covered=None, cycle_id_text=None)
    )
    assert accepted.cumulative_gross == 100
    assert accepted.covered == 0
    assert accepted.cycle_id_text == ""


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("cumulative_gross", "-3"),
        ("timestamp_cutoff", -1),
        ("covered", "some"),
        ("cycle_id", "0x" + "1" * 63),
    ],
)
def test_a_malformed_accepted_checkpoint_is_refused(field, value):
    with pytest.raises(InvalidParamsError, match="invalid accepted checkpoint"):
        CheckpointAcceptedResponse.from_rpc(accepted_raw(**{field: value}))


def test_an_accepted_checkpoint_missing_its_payer_names_it():
    with pytest.raises(
        InvalidParamsError, match="accepted checkpoint is missing payer"
    ):
        CheckpointAcceptedResponse.from_rpc(accepted_raw(payer=None))


def required_details(**overrides) -> dict:
    raw = {
        "cycle_id": CYCLE,
        "cycle_id_text": "t",
        "asset_address": ASSET,
        "payer": PAYER,
        "uncheckpointed": "0x10",
        "max_uncheckpointed": 16,
    }
    raw.update(overrides)
    return raw


def test_refusal_details_read_hex_and_decimal_integers():
    details = parse_refusal_details(CheckpointRequiredDetails, required_details())
    assert details.uncheckpointed == 16
    assert details.max_uncheckpointed == 16
    assert details.payer == PAYER


@pytest.mark.parametrize("value", ["lots", "-1", [], 1.5])
def test_refusal_details_with_an_unreadable_integer_are_none(value):
    assert (
        parse_refusal_details(
            CheckpointRequiredDetails, required_details(uncheckpointed=value)
        )
        is None
    )


def test_refusal_details_with_a_null_required_field_are_none():
    assert (
        parse_refusal_details(
            FutureTimestampDetails, {"timestamp": 1, "server_time": None}
        )
        is None
    )


def test_public_params_read_camel_case_and_normalize_the_core_domain():
    params = CorePublicParameters.from_rpc(
        {
            "contractAddress": "0x2222222222222222222222222222222222222222",
            "eip712Name": "n",
            "eip712Version": "2",
            "chainId": "8453",
            "guaranteeSigner": "0x01",
            "guaranteeRegistryAddress": "0x02",
            "clearingHouseAddress": "0x03",
            "ethereumHttpRpcUrl": "https://rpc.example",
            "supportedPaymentPayloadVersions": ["1", 2],
            "coreDomainSeparator": "0X" + "AB" * 32,
        }
    )
    assert params.chain_id == 8453
    assert params.eip712_version == "2"
    assert params.supported_payment_payload_versions == [1, 2]
    assert params.core_domain_separator == "0x" + "ab" * 32
    assert params.ethereum_http_rpc_url == "https://rpc.example"
    assert params.validators == []


def test_public_params_with_an_empty_version_list_accept_none():
    params = CorePublicParameters.from_rpc(
        params_raw(supported_payment_payload_versions=[])
    )
    assert params.supported_payment_payload_versions == []


def test_public_params_with_a_version_that_is_not_a_list_default_to_this_sdks():
    params = CorePublicParameters.from_rpc(
        params_raw(supported_payment_payload_versions="1")
    )
    assert params.supported_payment_payload_versions == [1]


def test_public_params_with_a_malformed_core_domain_are_refused():
    with pytest.raises(ValidationError):
        CorePublicParameters.from_rpc(params_raw(core_domain_separator="0x1234"))


@pytest.mark.parametrize(
    "missing", ["contract_address", "eip712_name", "eip712_version", "chain_id"]
)
def test_public_params_missing_a_required_field_name_it(missing):
    with pytest.raises(
        InvalidParamsError, match=f"missing core public parameter: {missing}$"
    ):
        CorePublicParameters.from_rpc(params_raw(**{missing: None}))


@pytest.mark.parametrize(
    "raw",
    [
        {
            "user_address": PAYER,
            "recipient_address": RECIPIENT,
            "tx_hash": "0xab",
            "amount": "0x10",
            "verified": 1,
            "finalized": True,
            "failed": False,
            "created_at": "1700000000",
        },
        {
            "userAddress": PAYER,
            "recipientAddress": RECIPIENT,
            "txHash": "0xab",
            "amount": 16,
            "verified": True,
            "finalized": True,
            "failed": None,
            "createdAt": 1_700_000_000,
        },
    ],
    ids=["snake", "camel"],
)
def test_a_recipient_payment_reads_snake_and_camel_case(raw):
    info = RecipientPaymentInfo.from_rpc(raw)
    assert info.user_address == PAYER
    assert info.recipient_address == RECIPIENT
    assert info.tx_hash == "0xab"
    assert info.amount == 16
    assert (info.verified, info.finalized, info.failed) == (True, True, False)
    assert info.created_at == 1_700_000_000


def test_a_recipient_payment_with_a_negative_amount_is_refused():
    with pytest.raises(ValidationError):
        RecipientPaymentInfo.from_rpc({"amount": "-1", "created_at": 0})


@pytest.mark.parametrize(
    "raw",
    [
        {"user_address": PAYER, "suspended": True, "updated_at": "5"},
        {"userAddress": PAYER, "suspended": 1, "updatedAt": 5},
    ],
    ids=["snake", "camel"],
)
def test_a_suspension_status_reads_snake_and_camel_case(raw):
    status = UserSuspensionStatus.from_rpc(raw)
    assert status.user_address == PAYER
    assert status.suspended is True
    assert status.updated_at == 5


def test_a_suspension_status_without_a_flag_is_not_suspended():
    assert (
        UserSuspensionStatus.from_rpc(
            {"user_address": PAYER, "updated_at": 0}
        ).suspended
        is False
    )


def test_an_asset_balance_reads_camel_case():
    info = AssetBalanceInfo.from_rpc(
        {
            "userAddress": PAYER,
            "assetAddress": ASSET,
            "total": "0x0a",
            "locked": 3,
            "version": "2",
            "updatedAt": 9,
        }
    )
    assert (info.total, info.locked, info.version, info.updated_at) == (10, 3, 2, 9)


@pytest.mark.parametrize("raw", [None, 32, b"\x11" * 32, ["0x"]])
def test_a_bytes32_that_is_not_a_string_is_refused(raw):
    with pytest.raises(ValidationError, match="invalid bytes32 value type"):
        normalize_bytes32_hex(raw)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [(" 0X" + "AB" * 32 + " ", "0x" + "ab" * 32), ("cd" * 32, "0x" + "cd" * 32)],
)
def test_a_bytes32_is_trimmed_and_lowercased(raw, expected):
    assert normalize_bytes32_hex(raw) == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [(0, 0), ("0", 0), (" 42 ", 42), ("0x2A", 42), ("0X2a", 42), (U256_MAX, U256_MAX)],
)
def test_u256_values_parse_from_integers_decimal_and_hex(raw, expected):
    assert parse_u256(raw) == expected


@pytest.mark.parametrize("raw", ["", "0x", "-1", "-0x1", "1e3", "ten", -1])
def test_u256_values_that_are_empty_negative_or_not_numbers_are_refused(raw):
    with pytest.raises(ValidationError):
        parse_u256(raw)


@pytest.mark.parametrize("raw", [1.0, None, b"1"])
def test_u256_values_of_other_types_are_refused(raw):
    with pytest.raises(ValidationError, match="unsupported numeric type"):
        parse_u256(raw)


@pytest.mark.parametrize("raw", [2**256, str(2**256), hex(2**256)])
def test_u256_values_above_the_maximum_are_refused(raw):
    with pytest.raises(ValidationError):
        parse_u256(raw)


@pytest.mark.parametrize("raw", [True, False])
def test_u256_values_given_as_booleans_are_refused(raw):
    with pytest.raises(ValidationError):
        parse_u256(raw)


def test_u256_values_serialize_as_lowercase_hex():
    assert serialize_u256("255") == "0xff"
    assert serialize_u256(0) == "0x0"
