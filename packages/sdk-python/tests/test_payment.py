"""PaymentClient tests. BLS certificates are produced with py_ecc's G2Basic —
the same basic-scheme DST core signs under."""

import pytest
from conftest import TEST_ADDRESS, FakeRpc, make_ctx
from py_ecc.bls import G2Basic

from fourmica_sdk.client.payment import PaymentClient
from fourmica_sdk.errors import (
    CertificateMismatchError,
    GuaranteeDomainMismatchError,
    InvalidParamsError,
)
from fourmica_sdk.guarantee import encode_guarantee_claims
from fourmica_sdk.models import (
    BLSCert,
    PaymentGuaranteeClaims,
    PaymentGuaranteeRequestClaims,
    PaymentSignature,
    SigningScheme,
)

DOMAIN = b"\x11" * 32
_SECRET = G2Basic.KeyGen(b"\x42" * 32)
_PUBLIC = G2Basic.SkToPk(_SECRET)


def signed_cert(claims: PaymentGuaranteeClaims) -> BLSCert:
    blob = encode_guarantee_claims(claims)
    signature = G2Basic.Sign(_SECRET, blob)
    return BLSCert(claims=blob.hex(), signature="0x" + signature.hex())


def cert_claims(**overrides) -> PaymentGuaranteeClaims:
    values = dict(
        domain=DOMAIN,
        user_address="0x1234567890123456789012345678901234567890",
        recipient_address=TEST_ADDRESS,
        cycle_id=100,
        req_id=7,
        amount=1000,
        asset_address="0x0000000000000000000000000000000000000000",
        timestamp=1_700_000_000,
        version=1,
    )
    values.update(overrides)
    return PaymentGuaranteeClaims(**values)


def payment_client(rpc=None) -> PaymentClient:
    from conftest import make_public_params

    ctx = make_ctx(
        rpc=rpc,
        public_params=make_public_params(public_key=_PUBLIC),
        guarantee_domain=DOMAIN,
    )
    return PaymentClient(ctx)


def test_verify_guarantee_accepts_a_valid_certificate():
    claims = cert_claims()
    verified = payment_client().verify_guarantee(signed_cert(claims))
    assert verified == claims


def test_verify_guarantee_rejects_a_tampered_certificate():
    cert = signed_cert(cert_claims())
    tampered_claims = encode_guarantee_claims(cert_claims(amount=2000))
    tampered = BLSCert(claims=tampered_claims.hex(), signature=cert.signature)
    with pytest.raises(CertificateMismatchError):
        payment_client().verify_guarantee(tampered)


def test_verify_guarantee_rejects_a_foreign_domain():
    cert = signed_cert(cert_claims(domain=b"\x99" * 32))
    with pytest.raises(GuaranteeDomainMismatchError):
        payment_client().verify_guarantee(cert)


async def test_issue_guarantee_posts_tagged_payload():
    rpc = FakeRpc(issue_guarantee=BLSCert(claims="00", signature="0x00"))
    client = payment_client(rpc)
    claims = PaymentGuaranteeRequestClaims.new(
        user_address="0x1234567890123456789012345678901234567890",
        recipient_address=TEST_ADDRESS,
        req_id=7,
        amount=1000,
        timestamp=1_700_000_000,
    )
    signature = PaymentSignature(
        signature="0x" + "ab" * 65, scheme=SigningScheme.EIP712
    )

    await client.issue_guarantee(claims, signature)

    _, body = rpc.calls[0][0], rpc.calls[0][1]
    assert body["claims"]["version"] == "v1"
    assert body["signature"] == "0x" + "ab" * 65
    assert body["scheme"] == "eip712"


async def test_issue_guarantee_requires_signer_to_be_recipient():
    client = payment_client(FakeRpc())
    claims = PaymentGuaranteeRequestClaims.new(
        user_address="0x1234567890123456789012345678901234567890",
        recipient_address="0x00000000000000000000000000000000000000Be",
        req_id=7,
        amount=1000,
        timestamp=1_700_000_000,
    )
    signature = PaymentSignature(signature="0x00", scheme=SigningScheme.EIP712)
    with pytest.raises(InvalidParamsError, match="recipient"):
        await client.issue_guarantee(claims, signature)
