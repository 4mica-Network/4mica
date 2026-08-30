import json
from pathlib import Path

import pytest
from eth_account import Account
from eth_account.messages import encode_defunct, encode_typed_data

from fourmica_sdk.digest import eip191_payload_for_claims, eip712_message_for_claims
from fourmica_sdk.errors import AddressMismatchError
from fourmica_sdk.models import (
    CorePublicParameters,
    PaymentGuaranteeRequestClaims,
    SigningScheme,
    ValidationRequirement,
)
from fourmica_sdk.signing import LocalAccountSigner, PaymentSigner

FIXTURES = Path(__file__).parent / "fixtures"
PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
ACCOUNT = Account.from_key(PRIVATE_KEY)


def params() -> CorePublicParameters:
    fx = json.loads((FIXTURES / "digest_vectors.json").read_text())["params"]
    return CorePublicParameters(
        public_key=b"\x00" * 48,
        contract_address=fx["contract_address"],
        eip712_name=fx["eip712_name"],
        eip712_version=fx["eip712_version"],
        chain_id=fx["chain_id"],
    )


def claims(user: str, validated: bool = False) -> PaymentGuaranteeRequestClaims:
    built = PaymentGuaranteeRequestClaims.new(
        user_address=user,
        recipient_address="0x00000000000000000000000000000000000000Be",
        req_id=7,
        amount=1000,
        timestamp=1_700_000_000,
    )
    if validated:
        built = built.with_validation(
            ValidationRequirement(
                validator="eip155:84532:0x1111111111111111111111111111111111111111",
                subject="0x" + "42" * 32,
                deadline=1_700_000_600,
                params="0xdeadbeef",
            )
        )
    return built


async def test_eip712_signature_recovers_to_signer():
    signer = PaymentSigner(PRIVATE_KEY)
    request_claims = claims(ACCOUNT.address)
    signature = await signer.sign_request(params(), request_claims)
    assert signature.scheme == SigningScheme.EIP712

    message = encode_typed_data(
        full_message=eip712_message_for_claims(params(), request_claims)
    )
    recovered = Account.recover_message(message, signature=signature.signature)
    assert recovered == ACCOUNT.address


async def test_validated_eip712_signature_recovers_to_signer():
    signer = PaymentSigner(LocalAccountSigner(PRIVATE_KEY))
    request_claims = claims(ACCOUNT.address, validated=True)
    signature = await signer.sign_request(params(), request_claims)

    message = encode_typed_data(
        full_message=eip712_message_for_claims(params(), request_claims)
    )
    recovered = Account.recover_message(message, signature=signature.signature)
    assert recovered == ACCOUNT.address


async def test_eip191_signature_recovers_to_signer():
    signer = PaymentSigner(PRIVATE_KEY)
    request_claims = claims(ACCOUNT.address)
    signature = await signer.sign_request(
        params(), request_claims, SigningScheme.EIP191
    )
    assert signature.scheme == SigningScheme.EIP191

    payload = eip191_payload_for_claims(request_claims)
    recovered = Account.recover_message(
        encode_defunct(primitive=payload), signature=signature.signature
    )
    assert recovered == ACCOUNT.address


async def test_signer_must_match_claims_user():
    signer = PaymentSigner(PRIVATE_KEY)
    other = "0x1111111111111111111111111111111111111111"
    with pytest.raises(AddressMismatchError):
        await signer.sign_request(params(), claims(other))
