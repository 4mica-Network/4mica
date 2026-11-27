import pytest
from eth_account import Account
from eth_utils import keccak

from fourmica_sdk.authorizations import (
    Permit2Authorization,
    ReceiveAuthorization,
    WithdrawalCancelAuthorization,
    WithdrawalRequestAuthorization,
    split_signature,
)
from fourmica_sdk.digest import eip712_digest, eip712_domain_separator
from fourmica_sdk.errors import (
    ContractError,
    InvalidParamsError,
    MalformedReceiptError,
    UnknownRevertError,
    UnsupportedAssetError,
)
from fourmica_sdk.guarantee import (
    GUARANTEE_V1_TYPE_HASH,
    Guarantee,
    GuaranteeReceipt,
    recipient_commitment,
    recover_signer,
)
from fourmica_sdk.models import PaymentRequestPayload
from fourmica_sdk.utils import ValidationError

KEY = "0x" + "24" * 32
SIGNER = Account.from_key(KEY)
PAYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
RECIPIENT = "0x00000000000000000000000000000000000000Be"
ASSET = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
CYCLE = "0x" + "11" * 32
DIGEST = keccak(b"4mica")
NONCE = "0x" + "44" * 32


def signature_bytes(digest: bytes = DIGEST) -> bytes:
    return bytes(SIGNER.unsafe_sign_hash(digest).signature)


def guarantee() -> Guarantee:
    return Guarantee(
        cycle_id=0x11,
        req_id=2,
        client=PAYER,
        recipient=RECIPIENT,
        amount=1000,
        asset=ASSET,
        timestamp=1_700_000_000,
    )


@pytest.mark.parametrize("salt", [b"\x01" * 31, "0x1234", bytearray(33)])
def test_a_commitment_salt_must_be_32_bytes(salt):
    with pytest.raises(InvalidParamsError, match="expected 32 bytes"):
        recipient_commitment(RECIPIENT, salt)


@pytest.mark.parametrize("recipient", ["0x1234", "", "recipient"])
def test_a_commitment_to_a_malformed_recipient_is_an_invalid_params_error(recipient):
    with pytest.raises(InvalidParamsError, match="invalid recipient address"):
        recipient_commitment(recipient, b"\x01" * 32)


def test_a_commitment_reads_salt_as_bytes_or_hex_alike():
    assert recipient_commitment(RECIPIENT, b"\x01" * 32) == recipient_commitment(
        RECIPIENT.lower(), "0x" + "01" * 32
    )


def test_a_signature_recovers_with_v_as_27_28_or_0_1():
    raw = signature_bytes()
    low_v = raw[:64] + bytes([raw[64] - 27])
    assert recover_signer(DIGEST, raw) == SIGNER.address
    assert recover_signer(DIGEST, bytearray(low_v)) == SIGNER.address
    assert recover_signer(DIGEST, "0x" + raw.hex()) == SIGNER.address
    assert recover_signer(DIGEST, raw.hex()) == SIGNER.address


@pytest.mark.parametrize("v", [2, 26, 29, 30, 255])
def test_a_signature_with_an_impossible_v_recovers_nobody(v):
    raw = signature_bytes()
    assert recover_signer(DIGEST, raw[:64] + bytes([v])) is None


@pytest.mark.parametrize(
    "signature",
    ["0xzz", "", b"\x01" * 64, b"\x01" * 66, "0x" + "00" * 65],
    ids=["not-hex", "empty", "short", "long", "zero"],
)
def test_an_unreadable_signature_recovers_nobody(signature):
    assert recover_signer(DIGEST, signature) is None


def test_a_guarantee_names_its_layout_and_version():
    built = guarantee()
    assert built.type_hash == GUARANTEE_V1_TYPE_HASH
    assert built.version == 1


def test_a_guarantee_reads_its_cycle_id_from_bytes_hex_or_an_integer():
    payment = PaymentRequestPayload.new(
        user_address=PAYER,
        recipient_address=RECIPIENT.lower(),
        cycle_id=CYCLE,
        req_id=2,
        amount=1000,
        timestamp=1_700_000_000,
        erc20_token=ASSET,
    )
    from_bytes = Guarantee.from_payment(payment, bytes.fromhex("11" * 32))
    from_array = Guarantee.from_payment(payment, bytearray.fromhex("11" * 32))
    from_hex = Guarantee.from_payment(payment, CYCLE)
    from_int = Guarantee.from_payment(payment, int(CYCLE, 16))
    assert from_bytes == from_array == from_hex == from_int
    assert from_bytes.cycle_id == int("11" * 32, 16)
    assert from_bytes.recipient == RECIPIENT


def test_a_guarantee_refuses_a_negative_cycle_id():
    payment = PaymentRequestPayload.new(
        user_address=PAYER,
        recipient_address=RECIPIENT,
        cycle_id=CYCLE,
        req_id=2,
        amount=1,
        timestamp=1,
    )
    with pytest.raises(ValidationError, match="negative"):
        Guarantee.from_payment(payment, -1)


def test_a_receipt_whose_address_word_has_dirty_padding_does_not_decode():
    data = bytearray(guarantee().receipt_bytes())
    client_word = 32 + 2 * 32
    data[client_word] = 0xFF
    with pytest.raises(MalformedReceiptError, match="does not decode as its layout"):
        Guarantee.decode(bytes(data))


def test_a_receipt_with_a_timestamp_past_u64_does_not_decode():
    data = bytearray(guarantee().receipt_bytes())
    timestamp_word = 32 + 6 * 32
    data[timestamp_word] = 0x01
    with pytest.raises(MalformedReceiptError, match="does not decode as its layout"):
        Guarantee.decode(bytes(data))


def test_a_receipt_round_trips_from_hex_with_or_without_prefix():
    built = guarantee()
    hexed = built.receipt_bytes().hex()
    assert Guarantee.decode(hexed) == built
    assert Guarantee.decode("0x" + hexed) == built


@pytest.mark.parametrize("raw", [None, "0xab", ["0xab", "0xcd"], 7])
def test_a_guarantee_receipt_that_is_not_an_object_is_refused(raw):
    with pytest.raises(InvalidParamsError, match="must be an object"):
        GuaranteeReceipt.from_rpc(raw)


@pytest.mark.parametrize(
    "raw",
    [
        {},
        {"receipt": "0xab"},
        {"signature": "0xcd"},
        {"receipt": None, "signature": "0xcd"},
    ],
)
def test_a_guarantee_receipt_missing_a_part_is_refused(raw):
    with pytest.raises(InvalidParamsError, match="missing receipt or signature"):
        GuaranteeReceipt.from_rpc(raw)


def test_a_guarantee_receipt_keeps_empty_strings_as_given():
    assert GuaranteeReceipt.from_rpc({"receipt": "", "signature": ""}).to_payload() == {
        "receipt": "",
        "signature": "",
    }


@pytest.mark.parametrize(
    ("domain", "struct"),
    [(b"\x01" * 31, DIGEST), (b"\x01" * 32, b"\x02" * 33), ("0x1234", DIGEST)],
)
def test_an_eip712_digest_refuses_words_that_are_not_32_bytes(domain, struct):
    with pytest.raises(ValueError, match="expected 32 bytes"):
        eip712_digest(domain, struct)


def test_an_eip712_digest_reads_the_domain_as_bytes_or_hex_alike():
    domain = b"\x07" * 32
    assert eip712_digest(domain, DIGEST) == eip712_digest("0x" + domain.hex(), DIGEST)
    assert eip712_digest(domain, DIGEST) == keccak(b"\x19\x01" + domain + DIGEST)


def test_a_domain_without_a_version_hashes_another_type():
    with_version = eip712_domain_separator("n", "1", 1, RECIPIENT)
    without = eip712_domain_separator("n", None, 1, RECIPIENT)
    assert with_version != without
    assert len(without) == 32


@pytest.mark.parametrize(
    "signature",
    [b"\xab" * 65, bytearray(b"\xab" * 65), "ab" * 65, "0x" + "ab" * 65],
    ids=["bytes", "bytearray", "bare-hex", "prefixed-hex"],
)
def test_a_permit2_signature_is_stored_as_prefixed_hex(signature):
    auth = Permit2Authorization(
        from_address=PAYER.lower(), nonce="5", deadline=9, signature=signature
    )
    assert auth.signature == "0x" + "ab" * 65
    assert auth.to_payload() == {
        "from": PAYER,
        "nonce": "0x5",
        "deadline": "0x9",
        "signature": "0x" + "ab" * 65,
    }


def test_withdrawal_authorizations_carry_prefixed_signatures_and_hex_quantities():
    request = WithdrawalRequestAuthorization(
        user=PAYER.lower(),
        asset=ASSET.lower(),
        amount=255,
        valid_after=0,
        valid_before=16,
        nonce=NONCE.upper().replace("0X", "0x"),
        signature=b"\x01" * 65,
    )
    cancel = WithdrawalCancelAuthorization(
        user=PAYER,
        asset=ASSET,
        valid_after=1,
        valid_before=2,
        nonce=NONCE,
        signature="cd" * 65,
    )
    assert request.to_payload() == {
        "user": PAYER,
        "asset": ASSET,
        "amount": "0xff",
        "validAfter": "0x0",
        "validBefore": "0x10",
        "nonce": NONCE,
        "signature": "0x" + "01" * 65,
    }
    assert cancel.to_payload()["signature"] == "0x" + "cd" * 65
    assert "amount" not in cancel.to_payload()


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("from_address", "0x1234"),
        ("nonce", "0x12"),
        ("r", "zz"),
        ("s", "0x" + "11" * 33),
    ],
)
def test_a_receive_authorization_with_a_malformed_field_is_refused(field, value):
    values = {
        "from_address": PAYER,
        "valid_after": 0,
        "valid_before": 1,
        "nonce": NONCE,
        "v": 27,
        "r": "0x" + "01" * 32,
        "s": "0x" + "02" * 32,
    }
    values[field] = value
    with pytest.raises(ValidationError):
        ReceiveAuthorization(**values)


@pytest.mark.parametrize(
    ("v", "expected"),
    [(0, 27), (1, 28), (27, 27), (28, 28), (37, 37)],
)
def test_a_split_signature_lifts_v_of_0_or_1_and_keeps_the_rest(v, expected):
    raw = b"\x01" * 32 + b"\x02" * 32 + bytes([v])
    assert split_signature(raw) == (expected, "0x" + "01" * 32, "0x" + "02" * 32)


@pytest.mark.parametrize("prefix", ["0x", ""])
def test_a_split_signature_reads_hex_strings(prefix):
    v, r, s = split_signature(prefix + "aa" * 32 + "bb" * 32 + "1c")
    assert (v, r, s) == (28, "0x" + "aa" * 32, "0x" + "bb" * 32)


@pytest.mark.parametrize("size", [0, 64, 66])
def test_a_split_signature_must_be_65_bytes(size):
    with pytest.raises(ValueError, match=f"expected a 65-byte signature, got {size}"):
        split_signature(b"\x01" * size)


def test_an_unknown_revert_keeps_its_selector_and_data():
    error = UnknownRevertError("deadbeef", "0xdeadbeef00")
    assert isinstance(error, ContractError)
    assert str(error) == "unknown revert (selector 0xdeadbeef)"
    assert error.selector == "deadbeef"
    assert error.data == "0xdeadbeef00"
    assert UnknownRevertError("00000000").data is None


def test_an_unsupported_asset_error_names_the_asset():
    error = UnsupportedAssetError(ASSET)
    assert isinstance(error, ContractError)
    assert str(error) == f"unsupported asset: {ASSET}"
    assert error.asset == ASSET
