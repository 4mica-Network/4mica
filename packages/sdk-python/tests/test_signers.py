from unittest.mock import AsyncMock, MagicMock

import pytest
from eth_account import Account
from eth_account.messages import encode_defunct, encode_typed_data
from stubs import TEST_ADDRESS, TEST_PRIVATE_KEY, TOKEN_ADDRESS, make_ctx

from fourmica_sdk.client import sig
from fourmica_sdk.digest import digest_for_request_withdrawal
from fourmica_sdk.errors import SigningError
from fourmica_sdk.models import PaymentRequestPayload
from fourmica_sdk.signing import LocalAccountSigner, PayerSigner
from fourmica_sdk.wallet.cdp import CdpAccountSigner

CDP_ADDRESS = "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01"
TYPED = {
    "types": {
        "EIP712Domain": [
            {"name": "name", "type": "string"},
            {"name": "chainId", "type": "uint256"},
        ],
        "Transfer": [{"name": "amount", "type": "uint256"}],
    },
    "primaryType": "Transfer",
    "domain": {"name": "TestApp", "chainId": 1},
    "message": {"amount": 100},
}


def payment() -> PaymentRequestPayload:
    return PaymentRequestPayload.new(
        user_address=TEST_ADDRESS,
        recipient_address="0x00000000000000000000000000000000000000Be",
        cycle_id="0x" + "11" * 32,
        req_id=1,
        amount=10,
        timestamp=1_700_000_000,
        salt=b"\x22" * 32,
    )


@pytest.mark.parametrize("key", ["", "0x1234", "zz" * 32, "0x" + "00" * 32])
def test_a_local_signer_refuses_an_unusable_private_key(key):
    with pytest.raises(SigningError, match="invalid wallet private key"):
        LocalAccountSigner(key)


async def test_a_local_signer_signs_typed_data_that_recovers_to_its_address():
    signer = LocalAccountSigner(TEST_PRIVATE_KEY)
    signature = await signer.sign_typed_data(TYPED)
    recovered = Account.recover_message(
        encode_typed_data(full_message=TYPED),
        signature=bytes.fromhex(signature.removeprefix("0x")),
    )
    assert recovered == TEST_ADDRESS


async def test_a_local_signer_signs_text_and_bytes_messages_the_same_way():
    signer = LocalAccountSigner(TEST_PRIVATE_KEY)
    from_text = await signer.sign_message("pay me")
    from_bytes = await signer.sign_message(b"pay me")
    assert from_text == from_bytes
    recovered = Account.recover_message(
        encode_defunct(primitive=b"pay me"),
        signature=bytes.fromhex(from_bytes.removeprefix("0x")),
    )
    assert recovered == TEST_ADDRESS


def test_a_payer_signer_built_from_a_key_reports_that_keys_address():
    assert PayerSigner(TEST_PRIVATE_KEY).address == TEST_ADDRESS


@pytest.mark.parametrize("domain", ["0x1234", b"\x01" * 31, "0xzz"])
async def test_a_payment_under_a_malformed_domain_is_a_signing_error(domain):
    hashed = AsyncMock()
    signer = PayerSigner(LocalAccountSigner(TEST_PRIVATE_KEY))
    signer._signer.sign_hash = hashed
    with pytest.raises(SigningError, match="failed to sign the payment"):
        await signer.sign_payment_request(domain, payment())
    hashed.assert_not_awaited()


class BytesSigner:
    def __init__(self) -> None:
        self._account = Account.from_key(TEST_PRIVATE_KEY)

    @property
    def address(self) -> str:
        return self._account.address

    async def sign_hash(self, message_hash: bytes) -> bytes:
        return bytes(self._account.unsafe_sign_hash(message_hash).signature)


async def test_an_authorization_accepts_a_signer_that_returns_raw_bytes():
    ctx = make_ctx()
    ctx.signer = BytesSigner()
    auth = await sig.request_withdrawal_authorization(ctx, TOKEN_ADDRESS, 1000)
    digest = digest_for_request_withdrawal(
        ctx.core_domain_separator,
        auth.user,
        auth.asset,
        auth.amount,
        auth.valid_after,
        auth.valid_before,
        auth.nonce,
    )
    signature = bytes.fromhex(auth.signature.removeprefix("0x"))
    assert len(signature) == 65
    assert Account._recover_hash(digest, signature=signature) == TEST_ADDRESS


def cdp_signer() -> tuple:
    cdp = MagicMock()
    cdp.evm.sign_hash = AsyncMock(return_value="0xSIGHASH")
    cdp.evm.sign_typed_data = AsyncMock(side_effect=RuntimeError("unavailable"))
    return CdpAccountSigner(address=CDP_ADDRESS, _cdp_client=cdp), cdp


@pytest.mark.parametrize("digest", [b"\x01" * 32, bytearray(b"\x01" * 32)])
async def test_a_cdp_signer_sends_a_byte_digest_as_prefixed_hex(digest):
    signer, cdp = cdp_signer()
    assert await signer.sign_hash(digest) == "0xSIGHASH"
    cdp.evm.sign_hash.assert_awaited_once_with(CDP_ADDRESS, "0x" + "01" * 32)


async def test_a_cdp_signer_passes_a_hex_digest_through_unchanged():
    signer, cdp = cdp_signer()
    await signer.sign_hash("0x" + "02" * 32)
    cdp.evm.sign_hash.assert_awaited_once_with(CDP_ADDRESS, "0x" + "02" * 32)
