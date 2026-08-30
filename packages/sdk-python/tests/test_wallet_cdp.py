"""Tests for CdpAccountSigner — no cdp-sdk installation required (all CDP calls are mocked)."""

import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from eth_account.messages import encode_defunct, encode_typed_data
from eth_utils import keccak

from fourmica_sdk.wallet.cdp import (
    CdpAccountConfig,
    CdpAccountSigner,
    create_cdp_account,
)

ADDRESS = "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01"


# ---------------------------------------------------------------------------
# Fake CDP exception used to simulate schema rejections from the CDP API.
# ---------------------------------------------------------------------------
class _FakeCdpApiException(Exception):
    pass


def _make_cdp_mock() -> MagicMock:
    cdp = MagicMock()
    cdp.evm.sign_hash = AsyncMock(return_value="0xSIGHASH")
    cdp.evm.sign_message = AsyncMock(return_value="0xSIGMESSAGE")
    cdp.evm.sign_typed_data = AsyncMock(return_value="0xSIGTYPED")
    cdp.close = AsyncMock()
    return cdp


@pytest.fixture
def mock_cdp() -> MagicMock:
    return _make_cdp_mock()


@pytest.fixture
def signer(mock_cdp: MagicMock) -> CdpAccountSigner:
    return CdpAccountSigner(address=ADDRESS, _cdp_client=mock_cdp)


@pytest.fixture
def cdp_modules():
    """Patch sys.modules so cdp imports inside CdpAccountSigner methods resolve without the real SDK."""
    fake_domain_cls = MagicMock(side_effect=lambda **kw: MagicMock())
    mocks = {
        "cdp": MagicMock(),
        "cdp.openapi_client": MagicMock(),
        "cdp.openapi_client.models": MagicMock(),
        "cdp.openapi_client.models.eip712_domain": MagicMock(
            EIP712Domain=fake_domain_cls
        ),
        "cdp.openapi_client.exceptions": MagicMock(ApiException=_FakeCdpApiException),
    }
    with patch.dict(sys.modules, mocks):
        yield mocks


# ---------------------------------------------------------------------------
# address property
# ---------------------------------------------------------------------------


def test_address_returns_value(signer: CdpAccountSigner) -> None:
    assert signer.address == ADDRESS


# ---------------------------------------------------------------------------
# sign_message — bytes path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sign_message_bytes_calls_sign_hash(
    signer: CdpAccountSigner, mock_cdp: MagicMock
) -> None:
    await signer.sign_message(b"hello")
    mock_cdp.evm.sign_hash.assert_awaited_once()
    mock_cdp.evm.sign_message.assert_not_awaited()


@pytest.mark.asyncio
async def test_sign_message_bytes_passes_correct_eip191_hash(
    signer: CdpAccountSigner, mock_cdp: MagicMock
) -> None:
    msg = b"hello world"
    prefixed = encode_defunct(primitive=msg)
    expected = "0x" + keccak(prefixed.version + prefixed.header + prefixed.body).hex()

    await signer.sign_message(msg)

    mock_cdp.evm.sign_hash.assert_awaited_once_with(ADDRESS, expected)


@pytest.mark.asyncio
async def test_sign_message_bytes_hash_is_not_bare_keccak(
    signer: CdpAccountSigner, mock_cdp: MagicMock
) -> None:
    """Regression: old code did keccak(body) which omits the EIP-191 prefix."""
    msg = b"\xde\xad\xbe\xef" * 8
    broken_hash = "0x" + keccak(msg).hex()

    await signer.sign_message(msg)

    actual_hash = mock_cdp.evm.sign_hash.call_args[0][1]
    assert actual_hash != broken_hash


@pytest.mark.asyncio
async def test_sign_message_bytes_with_address(
    signer: CdpAccountSigner, mock_cdp: MagicMock
) -> None:
    await signer.sign_message(b"test")
    call_address = mock_cdp.evm.sign_hash.call_args[0][0]
    assert call_address == ADDRESS


# ---------------------------------------------------------------------------
# sign_message — str path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sign_message_str_delegates_to_cdp(
    signer: CdpAccountSigner, mock_cdp: MagicMock
) -> None:
    result = await signer.sign_message("pay me")

    mock_cdp.evm.sign_message.assert_awaited_once_with(ADDRESS, "pay me")
    mock_cdp.evm.sign_hash.assert_not_awaited()
    assert result == "0xSIGMESSAGE"


# ---------------------------------------------------------------------------
# sign_typed_data — happy path
# ---------------------------------------------------------------------------

_TYPED_MSG = {
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


@pytest.mark.asyncio
async def test_sign_typed_data_calls_cdp(
    signer: CdpAccountSigner, mock_cdp: MagicMock, cdp_modules: dict
) -> None:
    result = await signer.sign_typed_data(_TYPED_MSG)
    mock_cdp.evm.sign_typed_data.assert_awaited_once()
    assert result == "0xSIGTYPED"


@pytest.mark.asyncio
async def test_sign_typed_data_strips_eip712domain_from_types(
    signer: CdpAccountSigner, mock_cdp: MagicMock, cdp_modules: dict
) -> None:
    captured: dict = {}

    async def _capture(addr, domain, types, primary_type, message):
        captured.update(types)
        return "0xSIG"

    mock_cdp.evm.sign_typed_data = _capture
    await signer.sign_typed_data(_TYPED_MSG)

    assert "EIP712Domain" not in captured
    assert "Transfer" in captured


@pytest.mark.asyncio
async def test_sign_typed_data_passes_correct_address(
    signer: CdpAccountSigner, mock_cdp: MagicMock, cdp_modules: dict
) -> None:
    await signer.sign_typed_data(_TYPED_MSG)
    call_address = mock_cdp.evm.sign_typed_data.call_args[0][0]
    assert call_address == ADDRESS


# ---------------------------------------------------------------------------
# sign_typed_data — fallback path
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_sign_typed_data_fallback_on_cdp_api_exception(
    signer: CdpAccountSigner, mock_cdp: MagicMock, cdp_modules: dict
) -> None:
    mock_cdp.evm.sign_typed_data = AsyncMock(
        side_effect=_FakeCdpApiException("bad schema")
    )
    mock_cdp.evm.sign_hash = AsyncMock(return_value="0xFALLBACK")

    result = await signer.sign_typed_data(_TYPED_MSG)

    mock_cdp.evm.sign_hash.assert_awaited_once()
    assert result == "0xFALLBACK"


@pytest.mark.asyncio
async def test_sign_typed_data_fallback_passes_correct_eip712_hash(
    signer: CdpAccountSigner, mock_cdp: MagicMock, cdp_modules: dict
) -> None:
    mock_cdp.evm.sign_typed_data = AsyncMock(
        side_effect=_FakeCdpApiException("rejected")
    )
    mock_cdp.evm.sign_hash = AsyncMock(return_value="0xFALLBACK")

    encoded = encode_typed_data(full_message=_TYPED_MSG)
    expected = "0x" + keccak(encoded.version + encoded.header + encoded.body).hex()

    await signer.sign_typed_data(_TYPED_MSG)

    mock_cdp.evm.sign_hash.assert_awaited_once_with(ADDRESS, expected)


@pytest.mark.asyncio
async def test_sign_typed_data_fallback_hash_is_not_bare_body_keccak(
    signer: CdpAccountSigner, mock_cdp: MagicMock, cdp_modules: dict
) -> None:
    """Regression: old code did keccak(body) which omits version+header bytes."""
    mock_cdp.evm.sign_typed_data = AsyncMock(
        side_effect=_FakeCdpApiException("rejected")
    )
    mock_cdp.evm.sign_hash = AsyncMock(return_value="0xFALLBACK")

    encoded = encode_typed_data(full_message=_TYPED_MSG)
    broken_hash = "0x" + keccak(encoded.body).hex()

    await signer.sign_typed_data(_TYPED_MSG)

    actual_hash = mock_cdp.evm.sign_hash.call_args[0][1]
    assert actual_hash != broken_hash


@pytest.mark.asyncio
async def test_sign_typed_data_non_cdp_exception_propagates(
    signer: CdpAccountSigner, mock_cdp: MagicMock, cdp_modules: dict
) -> None:
    mock_cdp.evm.sign_typed_data = AsyncMock(
        side_effect=ConnectionError("network down")
    )

    with pytest.raises(ConnectionError, match="network down"):
        await signer.sign_typed_data(_TYPED_MSG)

    mock_cdp.evm.sign_hash.assert_not_awaited()


# ---------------------------------------------------------------------------
# close / context manager
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_close_calls_cdp_close(
    signer: CdpAccountSigner, mock_cdp: MagicMock
) -> None:
    await signer.close()
    mock_cdp.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_close_skips_when_no_close_method() -> None:
    cdp = MagicMock(spec=[])  # no .close attribute
    signer = CdpAccountSigner(address=ADDRESS, _cdp_client=cdp)
    await signer.close()  # must not raise


@pytest.mark.asyncio
async def test_context_manager_calls_close_on_exit(mock_cdp: MagicMock) -> None:
    signer = CdpAccountSigner(address=ADDRESS, _cdp_client=mock_cdp)
    async with signer:
        pass
    mock_cdp.close.assert_awaited_once()


@pytest.mark.asyncio
async def test_context_manager_returns_signer(mock_cdp: MagicMock) -> None:
    signer = CdpAccountSigner(address=ADDRESS, _cdp_client=mock_cdp)
    async with signer as s:
        assert s is signer


# ---------------------------------------------------------------------------
# create_cdp_account
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_cdp_account_returns_signer_with_account_address() -> None:
    config = CdpAccountConfig(
        api_key_id="kid",
        api_key_secret="ksecret",
        wallet_secret="wallet-secret",
        name="my-wallet",
    )

    mock_account = MagicMock()
    mock_account.address = "0x1111111111111111111111111111111111111111"

    mock_evm = MagicMock()
    mock_evm.get_or_create_account = AsyncMock(return_value=mock_account)

    mock_client = MagicMock()
    mock_client.evm = mock_evm

    mock_cdp_module = MagicMock()
    mock_cdp_module.CdpClient = MagicMock(return_value=mock_client)

    with patch.dict(sys.modules, {"cdp": mock_cdp_module}):
        signer = await create_cdp_account(config)

    assert signer.address == "0x1111111111111111111111111111111111111111"


@pytest.mark.asyncio
async def test_create_cdp_account_passes_credentials_to_client() -> None:
    config = CdpAccountConfig(
        api_key_id="my-key-id",
        api_key_secret="my-secret",
        wallet_secret="my-wallet-secret",
        name="wallet",
    )

    mock_account = MagicMock()
    mock_account.address = ADDRESS

    mock_evm = MagicMock()
    mock_evm.get_or_create_account = AsyncMock(return_value=mock_account)

    mock_client = MagicMock()
    mock_client.evm = mock_evm

    mock_cdp_module = MagicMock()
    mock_cdp_module.CdpClient = MagicMock(return_value=mock_client)

    with patch.dict(sys.modules, {"cdp": mock_cdp_module}):
        await create_cdp_account(config)

    mock_cdp_module.CdpClient.assert_called_once_with(
        api_key_id="my-key-id",
        api_key_secret="my-secret",
        wallet_secret="my-wallet-secret",
    )


@pytest.mark.asyncio
async def test_create_cdp_account_uses_idempotency_name() -> None:
    config = CdpAccountConfig(
        api_key_id="k",
        api_key_secret="s",
        wallet_secret="wallet-secret",
        name="agent-wallet",
    )

    mock_account = MagicMock()
    mock_account.address = ADDRESS

    mock_evm = MagicMock()
    mock_evm.get_or_create_account = AsyncMock(return_value=mock_account)

    mock_client = MagicMock()
    mock_client.evm = mock_evm

    mock_cdp_module = MagicMock()
    mock_cdp_module.CdpClient = MagicMock(return_value=mock_client)

    with patch.dict(sys.modules, {"cdp": mock_cdp_module}):
        await create_cdp_account(config)

    mock_evm.get_or_create_account.assert_awaited_once_with(name="agent-wallet")
