import pytest

from fourmica_sdk.auth import AuthNonceResponse, AuthSession, AuthTokens, SiweTemplate
from fourmica_sdk.models import PaymentGuaranteeRequestClaims, SigningScheme
from fourmica_sdk.signing import CorePublicParameters, PaymentSigner


class StubSigner:
    def __init__(self, address: str, signature: str = "0xdead") -> None:
        self.address = address
        self._signature = signature
        self.last_message = None
        self.last_typed = None

    async def sign_typed_data(self, full_message):
        self.last_typed = full_message
        return self._signature

    async def sign_message(self, message):
        self.last_message = message
        return self._signature


class StubAuthClient:
    def __init__(self) -> None:
        self.last_signature = None

    async def get_nonce(self, address: str) -> AuthNonceResponse:
        template = SiweTemplate(
            domain="example.com",
            uri="https://example.com/login",
            chain_id=1,
            statement="Sign in",
            expiration="2099-01-01T00:00:00Z",
            issued_at="2024-01-01T00:00:00Z",
        )
        return AuthNonceResponse(nonce="nonce", siwe=template)

    async def verify(self, address: str, message: str, signature: str) -> AuthTokens:
        self.last_signature = signature
        return AuthTokens(access_token="access", refresh_token="refresh", expires_in=60)

    async def refresh(self, refresh_token: str) -> AuthTokens:  # pragma: no cover
        return AuthTokens(access_token="access", refresh_token="refresh", expires_in=60)

    async def logout(self, refresh_token: str) -> None:  # pragma: no cover
        return None

    async def aclose(self) -> None:  # pragma: no cover
        return None


def _make_claims(address: str) -> PaymentGuaranteeRequestClaims:
    return PaymentGuaranteeRequestClaims.new(
        address,
        "0x0000000000000000000000000000000000000002",
        1,
        1,
        10,
        1700000000,
        "0x0000000000000000000000000000000000000000",
    )


@pytest.mark.asyncio
async def test_payment_signer_accepts_custom_signer():
    address = "0x0000000000000000000000000000000000000001"
    signer = StubSigner(address)
    payment_signer = PaymentSigner(signer)
    params = CorePublicParameters(
        public_key=b"\x01" * 48,
        contract_address="0x0000000000000000000000000000000000000003",
        ethereum_http_rpc_url="https://example.com",
        eip712_name="4mica",
        eip712_version="1",
        chain_id=1,
    )
    claims = _make_claims(address)

    signed = await payment_signer.sign_request(params, claims, SigningScheme.EIP712)
    assert signed.signature == "0xdead"
    assert signer.last_typed is not None


@pytest.mark.asyncio
async def test_auth_session_accepts_custom_signer():
    signer = StubSigner("0x0000000000000000000000000000000000000001", "0xabc")
    auth_client = StubAuthClient()
    session = AuthSession(auth_client, evm_signer=signer)

    tokens = await session.login()
    assert tokens.access_token == "access"
    assert auth_client.last_signature == "0xabc"


@pytest.mark.asyncio
async def test_auth_session_accepts_private_key():
    auth_client = StubAuthClient()
    session = AuthSession(
        auth_client,
        wallet_private_key="0x" + "1" * 64,
    )

    tokens = await session.login()
    assert tokens.access_token == "access"
