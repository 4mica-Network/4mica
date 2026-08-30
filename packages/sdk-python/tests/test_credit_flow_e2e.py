"""End-to-end tests for the 4Mica credit flow.

Set ``4MICA_E2E=1`` to enable these tests. The suite is aligned with the TS
SDK e2e flow and can either talk directly to core or route tab / verify /
settle operations through the local x402-4mica facilitator.

The tests expect:

  - a locally-running Anvil node (or any EVM JSON-RPC)
  - a locally-running 4Mica core API
  - the environment variables listed below

Default values use the canonical Anvil dev accounts so the suite works
out-of-the-box against the standard local dev stack.

Environment variables (all optional unless noted):
  4MICA_E2E                      set to "1" to run
  4MICA_RPC_URL                  core RPC URL         (default: http://127.0.0.1:3000)
  4MICA_AUTH_URL                 auth URL             (default: same as 4MICA_RPC_URL)
  ETH_HTTP_RPC_URL               EVM JSON-RPC URL     (default: http://localhost:8545)
  CONTRACT_ADDRESS               contract address     (discovered from API by default)
  4MICA_BEARER_TOKEN             bearer token         (optional)
  PAYER_PRIVATE_KEY              payer key            (default: Anvil key #0)
  RECIPIENT_PRIVATE_KEY          recipient key        (default: Anvil key #1)
  E2E_TOKEN_ADDRESS              ERC-20 token address (discovered from core by default)
  E2E_TOKEN_DECIMALS             token decimals       (required only when bypassing discovery)
  DEPOSIT_AMOUNT                 collateral deposit   (default: 1 token)
  GUARANTEE_AMOUNT               guarantee amount     (default: 0.001 token)
  WITHDRAW_AMOUNT                withdrawal amount    (default: min(0.5 token, residual))
  TAB_TTL_SECONDS                tab TTL override     (default: min(300, tabExpirationTime - 1))
  PAYMENT_SYNC_TIMEOUT_MS        poll timeout (ms)    (default: 150000)
  4MICA_REQUIRE_PAYMENT_FINALIZATION  set "0" to skip finalization wait (default: on)
  PAYMENT_FINALIZATION_TIMEOUT_MS  finalization timeout (ms) (default: 210000 when enabled)
  4MICA_E2E_MODE                 "direct" | "facilitator" | "prompt" (default: prompt on TTY, else direct)
  FACILITATOR_URL                facilitator URL       (default: http://127.0.0.1:8080)
  # V2-only:
  VALIDATION_REGISTRY            validation registry address
  VALIDATOR_ADDRESS              validator address
  VALIDATOR_AGENT_ID             validator agent id   (default: 0)
  VALIDATION_CHAIN_ID            validation chain id  (default: EVM chain id)
  MIN_VALIDATION_SCORE           min score 1-100      (default: 80)
  VALIDATION_TAG                 required tag string  (default: hard-finality)
  V2_GUARANTEE_AMOUNT            V2 guarantee amount  (default: 0.001 token)
"""

from __future__ import annotations

import asyncio
import base64
import contextlib
import json
import os
import sys
import time
from decimal import Decimal
from typing import Any, Callable, Dict, Optional, Tuple

import httpx
import pytest

from fourmica_sdk import (
    PaymentRequirementsV1,
    PaymentRequirementsV2,
    X402Flow,
    X402PaymentRequired,
    X402ResourceInfo,
)
from fourmica_sdk.client import Client
from fourmica_sdk.config import Config, ConfigBuilder
from fourmica_sdk.models import (
    AssetBalanceInfo,
    PaymentGuaranteeRequestClaims,
    PaymentGuaranteeRequestClaimsV2,
    PaymentGuaranteeValidationPolicyV2,
    SigningScheme,
    TabPaymentStatus,
)
from fourmica_sdk.utils import normalize_address
from fourmica_sdk.validation import (
    compute_validation_request_hash,
    compute_validation_subject_hash,
)
from fourmica_sdk.x402 import TabResponse

try:
    from fourmica_x402.facilitator import FourMicaFacilitatorClient
    from x402.http import FacilitatorConfig
    from x402.schemas import PaymentPayload as X402PaymentPayloadV2
    from x402.schemas import PaymentRequirements as X402PaymentRequirementsV2
    from x402.schemas.v1 import PaymentPayloadV1 as X402PaymentPayloadV1
    from x402.schemas.v1 import PaymentRequirementsV1 as X402PaymentRequirementsV1
except ImportError:
    FourMicaFacilitatorClient = None  # type: ignore[assignment,misc]
    FacilitatorConfig = None  # type: ignore[assignment,misc]
    X402PaymentPayloadV2 = None  # type: ignore[assignment,misc]
    X402PaymentRequirementsV2 = None  # type: ignore[assignment,misc]
    X402PaymentPayloadV1 = None  # type: ignore[assignment,misc]
    X402PaymentRequirementsV1 = None  # type: ignore[assignment,misc]

# ---------------------------------------------------------------------------
# Feature flag
# ---------------------------------------------------------------------------

E2E_ENABLED = os.environ.get("4MICA_E2E") == "1"

pytestmark = pytest.mark.skipif(
    not E2E_ENABLED, reason="set 4MICA_E2E=1 to run e2e tests"
)

# ---------------------------------------------------------------------------
# Default Anvil dev private keys
# ---------------------------------------------------------------------------

_DEFAULT_PAYER_KEY = (
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
)
_DEFAULT_RECIPIENT_KEY = (
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
)
_DEFAULT_CORE_RPC_URL = "http://127.0.0.1:3000"
_DEFAULT_FACILITATOR_URL = "http://127.0.0.1:8080"
_DEFAULT_V2_VALIDATION_REGISTRY = "0x8004Cb1BF31DAf7788923b405b754f57acEB4272"
_DEFAULT_V2_VALIDATOR_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
_E2E_MODE: Optional[str] = None

# ---------------------------------------------------------------------------
# Environment helpers
# ---------------------------------------------------------------------------


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    return int(raw, 0) if raw else default


def _resolve_e2e_mode() -> str:
    global _E2E_MODE
    if _E2E_MODE is not None:
        return _E2E_MODE

    configured = _env("4MICA_E2E_MODE", "").strip().lower()
    if configured in {"direct", "facilitator"}:
        _E2E_MODE = configured
        print(f"[e2e] using configured mode: {_E2E_MODE}")
        return _E2E_MODE

    if configured and configured != "prompt":
        raise RuntimeError("4MICA_E2E_MODE must be one of: direct, facilitator, prompt")

    if sys.stdin is not None and sys.stdin.isatty():
        response = (
            input(
                "\nSelect E2E mode: [d]irect core API or [f]acilitator via x402-4mica? "
            )
            .strip()
            .lower()
        )
        _E2E_MODE = "facilitator" if response.startswith("f") else "direct"
    else:
        _E2E_MODE = "direct"

    print(f"[e2e] selected mode: {_E2E_MODE}")
    return _E2E_MODE


def _facilitator_url() -> str:
    return _env("FACILITATOR_URL", _DEFAULT_FACILITATOR_URL).rstrip("/")


def _caip2_network(client: Client) -> str:
    return f"eip155:{client.gateway.chain_id}"


def _parse_u256_like(value: Any, *, field: str) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            raise RuntimeError(f"{field} cannot be empty")
        return int(raw, 0)
    raise RuntimeError(f"invalid {field}: {value!r}")


# ---------------------------------------------------------------------------
# Unit conversion
# ---------------------------------------------------------------------------


def _parse_units(amount_str: str, decimals: int) -> int:
    """Convert a human-readable token amount string to its raw integer representation."""
    return int(Decimal(amount_str) * Decimal(10) ** decimals)


def _format_units(amount: int, decimals: int) -> str:
    d = Decimal(amount) / Decimal(10) ** decimals
    return str(d.normalize())


# ---------------------------------------------------------------------------
# Config factory
# ---------------------------------------------------------------------------


def _make_config(private_key: str) -> Config:
    rpc_url = _env("4MICA_RPC_URL", _DEFAULT_CORE_RPC_URL)
    eth_rpc = _env("ETH_HTTP_RPC_URL", "http://localhost:8545")
    contract = _env("CONTRACT_ADDRESS", "")
    bearer = _env("4MICA_BEARER_TOKEN", "")
    builder = ConfigBuilder().rpc_url(rpc_url).wallet_private_key(private_key)
    if eth_rpc:
        builder.ethereum_http_rpc_url(eth_rpc)
    if contract:
        builder.contract_address(contract)
    if bearer:
        builder.bearer_token(bearer)
    else:
        builder.enable_auth()
        auth_url = _env("4MICA_AUTH_URL")
        if auth_url:
            builder.auth_url(auth_url)
        refresh_margin = os.environ.get("4MICA_AUTH_REFRESH_MARGIN_SECS")
        if refresh_margin:
            builder.auth_refresh_margin_secs(int(refresh_margin, 0))
    return builder.build()


# ---------------------------------------------------------------------------
# Blockchain helpers
# ---------------------------------------------------------------------------


async def _mine_block(client: Client, count: int = 1) -> None:
    """Mine confirmation blocks on Anvil/EVM test nodes."""
    provider = client.gateway.w3.provider
    make_req = getattr(provider, "make_request", None)
    if make_req is None:
        return
    for method in ("anvil_mine", "evm_mine"):
        try:
            args = [count] if method == "anvil_mine" else []
            result = make_req(method, args)
            if hasattr(result, "__await__"):
                await result
            return
        except Exception:
            continue


async def _get_erc20_balance(client: Client, token_address: str, account: str) -> int:
    contract = client.gateway._erc20(token_address)
    return await contract.functions.balanceOf(normalize_address(account)).call()


async def _get_native_balance(client: Client, address: str) -> int:
    return await client.gateway.w3.eth.get_balance(normalize_address(address))


async def _send_native_eth(client: Client, to: str, amount_wei: int) -> None:
    from_addr = client.gateway.account.address
    nonce = await client.gateway.w3.eth.get_transaction_count(from_addr)
    tx: Dict[str, Any] = {
        "to": normalize_address(to),
        "from": from_addr,
        "value": amount_wei,
        "nonce": nonce,
        "chainId": client.gateway.chain_id,
        "gas": 21_000,
    }
    try:
        tx["gasPrice"] = await client.gateway.w3.eth.gas_price
    except Exception:
        pass
    await client.gateway._build_and_send(tx)


async def _ensure_recipient_native_gas(
    payer_client: Client,
    recipient_address: str,
    min_balance_wei: int = 5 * 10**16,  # 0.05 ETH
    top_up_wei: int = 10**17,  # 0.1 ETH
) -> None:
    balance = await _get_native_balance(payer_client, recipient_address)
    if balance < min_balance_wei:
        await _send_native_eth(payer_client, recipient_address, top_up_wei)


async def _resolve_token_metadata(
    payer_client: Client,
) -> Tuple[str, int, str]:
    token_address = _env("E2E_TOKEN_ADDRESS")
    if token_address:
        decimals_env = _env_int("E2E_TOKEN_DECIMALS", 18)
        contract = payer_client.gateway._erc20(token_address)
        try:
            decimals = await contract.functions.decimals().call()
            symbol = await contract.functions.symbol().call()
        except Exception:
            decimals = decimals_env
            symbol = "TOKEN"
        return normalize_address(token_address), int(decimals), str(symbol)

    try:
        tokens_resp = await payer_client.rpc.get_supported_tokens()
    except Exception as exc:
        raise RuntimeError(
            f"GET /core/tokens failed ({exc}). Set E2E_TOKEN_ADDRESS and "
            "E2E_TOKEN_DECIMALS to bypass token discovery."
        ) from exc

    supported_tokens = tokens_resp.tokens

    preferred = next(
        (t for t in supported_tokens if t.symbol.upper() == "USDC"),
        supported_tokens[0] if supported_tokens else None,
    )
    if preferred is None:
        raise RuntimeError("could not resolve an ERC20 token address for e2e")

    if not preferred.address:
        raise RuntimeError("supported token entry is missing an address")

    decimals = preferred.decimals
    if decimals is None:
        contract = payer_client.gateway._erc20(preferred.address)
        decimals = await contract.functions.decimals().call()

    return (
        normalize_address(preferred.address),
        int(decimals),
        preferred.symbol or "TOKEN",
    )


async def _resolve_effective_tab_ttl(payer_client: Client) -> Optional[int]:
    try:
        tab_expiration_time = int(
            await payer_client.gateway.contract.functions.tabExpirationTime().call()
        )
        configured_ttl = int(_env("TAB_TTL_SECONDS", "300"), 0)
        if configured_ttl > 0:
            return min(configured_ttl, max(1, tab_expiration_time - 1))
        return max(1, tab_expiration_time - 1)
    except Exception:
        return None


async def _login_if_enabled(client: Client) -> None:
    if client.cfg.auth is not None:
        await client.login()


def _build_v1_requirements(
    network: str,
    recipient_address: str,
    asset_address: str,
    amount: int,
    ttl_seconds: Optional[int],
) -> PaymentRequirementsV1:
    return PaymentRequirementsV1(
        scheme="4mica-credit",
        network=network,
        max_amount_required=str(amount),
        pay_to=recipient_address,
        asset=asset_address,
        extra={},
        max_timeout_seconds=ttl_seconds,
    )


def _build_v2_requirements(
    network: str,
    recipient_address: str,
    asset_address: str,
    amount: int,
    ttl_seconds: Optional[int],
    validation_registry: str,
    validation_chain_id: int,
    validator_address: str,
    validator_agent_id: int,
    min_validation_score: int,
    required_validation_tag: str,
    job_hash: str,
) -> PaymentRequirementsV2:
    return PaymentRequirementsV2(
        scheme="4mica-credit",
        network=network,
        amount=str(amount),
        pay_to=recipient_address,
        asset=asset_address,
        max_timeout_seconds=ttl_seconds,
        extra={
            "validationRegistryAddress": validation_registry,
            "validationChainId": validation_chain_id,
            "validatorAddress": validator_address,
            "validatorAgentId": hex(validator_agent_id),
            "minValidationScore": min_validation_score,
            "requiredValidationTag": required_validation_tag,
            "jobHash": job_hash,
        },
    )


def _make_facilitator_client() -> FourMicaFacilitatorClient:
    return FourMicaFacilitatorClient(FacilitatorConfig(url=_facilitator_url()))


def _to_x402_requirements(
    requirements: PaymentRequirementsV1 | PaymentRequirementsV2,
) -> X402PaymentRequirementsV1 | X402PaymentRequirementsV2:
    payload = requirements.to_payload()
    if isinstance(requirements, PaymentRequirementsV2):
        return X402PaymentRequirementsV2.model_validate(payload)
    payload.setdefault("resource", "")
    return X402PaymentRequirementsV1.model_validate(payload)


def _to_x402_payload(
    payment_payload: Dict[str, Any], x402_version: int
) -> X402PaymentPayloadV1 | X402PaymentPayloadV2:
    if x402_version == 2:
        return X402PaymentPayloadV2.model_validate(payment_payload)
    return X402PaymentPayloadV1.model_validate(payment_payload)


async def _facilitator_settle_raw(
    x402_version: int,
    payment_payload: Dict[str, Any],
    payment_requirements: PaymentRequirementsV1 | PaymentRequirementsV2,
) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            f"{_facilitator_url()}/settle",
            json={
                "x402Version": x402_version,
                "paymentPayload": payment_payload,
                "paymentRequirements": payment_requirements.to_payload(),
            },
        )
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise RuntimeError(
            f"facilitator /settle returned {response.status_code}: {response.text}"
        ) from exc
    payload = response.json()
    if not isinstance(payload, dict):
        raise RuntimeError(
            f"facilitator /settle returned non-object payload: {payload!r}"
        )
    return payload


class _FacilitatorX402Flow(X402Flow):
    def __init__(self, signer, facilitator_client: FourMicaFacilitatorClient) -> None:
        super().__init__(signer)
        self._facilitator = facilitator_client

    async def _request_tab(
        self,
        x402_version: int,
        payment_requirements: PaymentRequirementsV1 | PaymentRequirementsV2,
        user_address: str,
        resource: X402ResourceInfo | None = None,
    ) -> TabResponse:
        del x402_version, resource
        tab = await self._facilitator.open_tab(
            user_address=user_address,
            payment_requirements=_to_x402_requirements(payment_requirements),
            ttl_seconds=payment_requirements.max_timeout_seconds,
        )
        return TabResponse(
            tab_id=_parse_u256_like(tab.tab_id, field="tab_id"),
            user_address=str(tab.user_address or user_address),
            next_req_id=_parse_u256_like(
                tab.next_req_id if tab.next_req_id is not None else "0x0",
                field="next_req_id",
            ),
        )


def _decode_payment_header(header: str) -> Dict[str, Any]:
    raw = base64.b64decode(header).decode("utf-8")
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise RuntimeError(
            f"decoded payment header must be an object, got: {payload!r}"
        )
    return payload


def _claims_payload_from_envelope(envelope: Dict[str, Any]) -> Dict[str, Any]:
    payload = envelope.get("payload", {}).get("claims", {})
    if not isinstance(payload, dict):
        raise RuntimeError(
            f"payment claims payload must be an object, got: {payload!r}"
        )
    return payload


def _v1_claims_from_payload(payload: Dict[str, Any]) -> PaymentGuaranteeRequestClaims:
    return PaymentGuaranteeRequestClaims.new(
        user_address=str(payload["user_address"]),
        recipient_address=str(payload["recipient_address"]),
        tab_id=_parse_u256_like(payload["tab_id"], field="tab_id"),
        req_id=_parse_u256_like(payload["req_id"], field="req_id"),
        amount=_parse_u256_like(payload["amount"], field="amount"),
        timestamp=int(payload["timestamp"]),
        erc20_token=str(payload["asset_address"]),
    )


def _v2_claims_from_payload(payload: Dict[str, Any]) -> PaymentGuaranteeRequestClaimsV2:
    return PaymentGuaranteeRequestClaimsV2.new(
        user_address=str(payload["user_address"]),
        recipient_address=str(payload["recipient_address"]),
        tab_id=_parse_u256_like(payload["tab_id"], field="tab_id"),
        req_id=_parse_u256_like(payload["req_id"], field="req_id"),
        amount=_parse_u256_like(payload["amount"], field="amount"),
        timestamp=int(payload["timestamp"]),
        erc20_token=str(payload["asset_address"]),
        validation_registry_address=str(payload["validation_registry_address"]),
        validation_request_hash=str(payload["validation_request_hash"]),
        validation_chain_id=_parse_u256_like(
            payload["validation_chain_id"], field="validation_chain_id"
        ),
        validator_address=str(payload["validator_address"]),
        validator_agent_id=_parse_u256_like(
            payload["validator_agent_id"], field="validator_agent_id"
        ),
        min_validation_score=int(payload["min_validation_score"]),
        validation_subject_hash=str(payload["validation_subject_hash"]),
        required_validation_tag=str(payload.get("required_validation_tag", "")),
        job_hash=str(payload["job_hash"]),
    )


async def _sign_v1_payment_with_facilitator(
    facilitator_flow: "_FacilitatorX402Flow",
    requirements: PaymentRequirementsV1,
    user_address: str,
) -> tuple[Dict[str, Any], PaymentGuaranteeRequestClaims, str]:
    signed_payment = await facilitator_flow.sign_payment(requirements, user_address)
    envelope = _decode_payment_header(signed_payment.header)
    claims = _v1_claims_from_payload(_claims_payload_from_envelope(envelope))
    return envelope, claims, signed_payment.signature.signature


async def _sign_v2_payment_with_facilitator(
    facilitator_flow: "_FacilitatorX402Flow",
    payment_required: X402PaymentRequired,
    requirements: PaymentRequirementsV2,
    user_address: str,
) -> tuple[Dict[str, Any], PaymentGuaranteeRequestClaimsV2, str]:
    signed_payment = await facilitator_flow.sign_payment_v2(
        payment_required, requirements, user_address
    )
    envelope = _decode_payment_header(signed_payment.header)
    claims = _v2_claims_from_payload(_claims_payload_from_envelope(envelope))
    return envelope, claims, signed_payment.signature.signature


def _assert_facilitator_settle_success(
    settle_payload: Any, *, x402_version: int
) -> None:
    success = (
        settle_payload.get("success")
        if isinstance(settle_payload, dict)
        else getattr(settle_payload, "success", None)
    )
    if success is True:
        return
    error = (
        str(settle_payload.get("error") or "")
        if isinstance(settle_payload, dict)
        else str(
            getattr(settle_payload, "error", None)
            or getattr(settle_payload, "error_reason", None)
            or getattr(settle_payload, "error_message", None)
            or ""
        )
    )
    if x402_version == 1 and "guarantee domain mismatch" in error:
        pytest.xfail(
            "local x402-4mica facilitator rejects V1 /settle due to guarantee domain mismatch"
        )
    assert success is True, settle_payload


def _bls_cert_from_facilitator(payload: Dict[str, Any]):
    from fourmica_sdk.models import BLSCert

    if isinstance(payload, dict):
        certificate = payload.get("certificate")
    else:
        certificate = getattr(payload, "certificate", None)
    if isinstance(certificate, dict):
        claims = certificate.get("claims")
        signature = certificate.get("signature")
    else:
        claims = getattr(certificate, "claims", None)
        signature = getattr(certificate, "signature", None)
    if not isinstance(claims, str) or not isinstance(signature, str):
        raise RuntimeError(f"facilitator certificate is malformed: {certificate!r}")
    return BLSCert(claims=claims, signature=signature)


async def _issue_guarantee_via_facilitator(
    facilitator: FourMicaFacilitatorClient,
    x402_version: int,
    payment_envelope: Dict[str, Any],
    payment_requirements: PaymentRequirementsV1 | PaymentRequirementsV2,
):
    verify_payload = await facilitator.verify(
        _to_x402_payload(payment_envelope, x402_version),
        _to_x402_requirements(payment_requirements),
    )
    assert getattr(verify_payload, "is_valid", None) is True, verify_payload
    settle_payload = await _facilitator_settle_raw(
        x402_version, payment_envelope, payment_requirements
    )
    _assert_facilitator_settle_success(settle_payload, x402_version=x402_version)
    return _bls_cert_from_facilitator(settle_payload)


# ---------------------------------------------------------------------------
# Polling helpers
# ---------------------------------------------------------------------------


async def _wait_for_core_asset_balance(
    payer_client: Client,
    user_address: str,
    asset: Optional[str],
    expected: int,
    timeout_ms: int = 30_000,
    poll_ms: int = 2_000,
) -> None:
    asset_key = asset or "0x0000000000000000000000000000000000000000"
    deadline = time.monotonic() + timeout_ms / 1000
    while time.monotonic() < deadline:
        balance = await payer_client.recipient.get_user_asset_balance(
            user_address, asset_key
        )
        if balance and balance.total >= expected:
            return
        await asyncio.sleep(poll_ms / 1000)
    raise TimeoutError(
        f"core asset balance for {user_address} never reached {expected}"
    )


async def _wait_for_user_asset_balance(
    payer_client: Client,
    user_address: str,
    asset: str,
    check_fn: Callable[[AssetBalanceInfo], bool],
    timeout_ms: int = 30_000,
    poll_ms: int = 2_000,
    mine_on_poll: bool = False,
) -> AssetBalanceInfo:
    asset_key = normalize_address(asset)
    deadline = time.monotonic() + timeout_ms / 1000
    while time.monotonic() < deadline:
        balance = await payer_client.recipient.get_user_asset_balance(
            user_address, asset_key
        )
        print(
            f"[debug:user_balance] {user_address} / {asset_key}"
            f" → total={balance.total if balance else 'None'}"
            f" locked={balance.locked if balance else 'None'}"
            f" matched={balance is not None and check_fn(balance)}"
        )
        if balance is not None and check_fn(balance):
            return balance
        if mine_on_poll:
            await _mine_block(payer_client)
        await asyncio.sleep(poll_ms / 1000)
    raise TimeoutError(
        f"user asset balance predicate never matched for {user_address} / {asset_key}"
    )


async def _wait_for_tab_payment_status(
    payer_client: Client,
    tab_id: int,
    check_fn: Callable[[TabPaymentStatus], bool],
    timeout_ms: int = 30_000,
    poll_ms: int = 2_000,
) -> TabPaymentStatus:
    deadline = time.monotonic() + timeout_ms / 1000
    while time.monotonic() < deadline:
        status = await payer_client.user.get_tab_payment_status(tab_id)
        if check_fn(status):
            return status
        await asyncio.sleep(poll_ms / 1000)
    raise TimeoutError(f"tab {tab_id} payment status condition never met")


async def _wait_until_unix_ts(
    label: str, target_unix_ts: int, client: Optional[Client] = None
) -> None:
    if client is not None:
        provider = client.gateway.w3.provider
        make_req = getattr(provider, "make_request", None)
        if make_req is not None:
            for method, args in (
                ("anvil_setNextBlockTimestamp", [target_unix_ts]),
                ("evm_setNextBlockTimestamp", [target_unix_ts]),
                ("evm_increaseTime", [max(target_unix_ts - int(time.time()), 0)]),
            ):
                try:
                    result = make_req(method, args)
                    if hasattr(result, "__await__"):
                        await result
                    await _mine_block(client)
                    print(f"[e2e] {label}: advanced time via {method}")
                    return
                except Exception:
                    continue

    while True:
        now = int(time.time())
        remaining = target_unix_ts - now
        if remaining <= 0:
            print(f"[e2e] {label}: ready")
            return
        print(f"[e2e] {label}: waiting {remaining}s")
        await asyncio.sleep(min(remaining, 1))


# ---------------------------------------------------------------------------
# V1 Credit Flow
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.timeout(420)
async def test_credit_flow_tracks_lock_unlock_remuneration_and_withdrawal():
    """
    Full V1 credit flow:
    deposit → lock collateral → issue guarantee → pay tab → remunerate → withdraw
    """
    payer_key = _env("PAYER_PRIVATE_KEY", _DEFAULT_PAYER_KEY)
    recipient_key = _env("RECIPIENT_PRIVATE_KEY", _DEFAULT_RECIPIENT_KEY)
    payment_sync_timeout_ms = _env_int("PAYMENT_SYNC_TIMEOUT_MS", 150_000)
    require_finalization = _env("4MICA_REQUIRE_PAYMENT_FINALIZATION", "1") != "0"
    payment_finalization_timeout_ms = _env_int(
        "PAYMENT_FINALIZATION_TIMEOUT_MS",
        210_000 if require_finalization else 15_000,
    )

    mode = _resolve_e2e_mode()
    async with contextlib.AsyncExitStack() as stack:
        payer = await stack.enter_async_context(
            await Client.new(_make_config(payer_key))
        )
        recipient = await stack.enter_async_context(
            await Client.new(_make_config(recipient_key))
        )
        facilitator = None
        if mode == "facilitator":
            facilitator = await stack.enter_async_context(_make_facilitator_client())

        await _login_if_enabled(payer)
        await _login_if_enabled(recipient)
        facilitator_flow = (
            _FacilitatorX402Flow(payer.user, facilitator)
            if facilitator is not None
            else None
        )

        payer_address = payer._signer.address
        recipient_address = recipient._signer.address
        network = _caip2_network(payer)

        # Resolve token and amounts
        erc20_token, decimals, token_symbol = await _resolve_token_metadata(payer)

        deposit_raw = _env("DEPOSIT_AMOUNT")
        guarantee_raw = _env("GUARANTEE_AMOUNT")
        withdraw_raw = _env("WITHDRAW_AMOUNT")

        deposit_amount = (
            int(deposit_raw, 0) if deposit_raw else _parse_units("1.0", decimals)
        )
        guarantee_amount = (
            int(guarantee_raw, 0) if guarantee_raw else _parse_units("0.001", decimals)
        )
        default_withdraw_amount = min(
            _parse_units("0.5", decimals),
            max(deposit_amount - guarantee_amount, 0),
        )
        withdraw_amount = (
            int(withdraw_raw, 0) if withdraw_raw else default_withdraw_amount
        )

        tab_ttl = await _resolve_effective_tab_ttl(payer)

        print(f"\n[e2e] payer:     {payer_address}")
        print(f"[e2e] recipient: {recipient_address}")
        print(f"[e2e] rpc:       {_env('4MICA_RPC_URL', _DEFAULT_CORE_RPC_URL)}")
        print(f"[e2e] mode:      {mode}")
        print(f"[e2e] token:     {erc20_token} ({token_symbol})")
        print(f"[e2e] deposit:   {_format_units(deposit_amount, decimals)}")
        print(f"[e2e] guarantee: {_format_units(guarantee_amount, decimals)}")

        # ------------------------------------------------------------------
        # 0. Ensure recipient has native gas
        # ------------------------------------------------------------------
        await _ensure_recipient_native_gas(payer, recipient_address)

        # ------------------------------------------------------------------
        # 1. Deposit collateral
        # ------------------------------------------------------------------
        print("[e2e] Step 1: deposit collateral")
        initial_balance = await payer.recipient.get_user_asset_balance(
            payer_address, erc20_token
        )
        initial_total = initial_balance.total if initial_balance is not None else 0
        initial_locked = initial_balance.locked if initial_balance is not None else 0
        await payer.user.approve_erc20(erc20_token, deposit_amount)
        await payer.user.deposit(deposit_amount, erc20_token)
        await _mine_block(payer)

        await _wait_for_core_asset_balance(
            payer,
            payer_address,
            erc20_token,
            deposit_amount,
            timeout_ms=payment_sync_timeout_ms,
        )
        deposit_balance = await _wait_for_user_asset_balance(
            payer,
            payer_address,
            erc20_token,
            lambda b: (
                b.total >= initial_total + deposit_amount and b.locked == initial_locked
            ),
            timeout_ms=payment_sync_timeout_ms,
        )
        print(f"[e2e] deposit confirmed: {_format_units(deposit_amount, decimals)}")

        # ------------------------------------------------------------------
        # 2. Recipient creates a paid tab
        # ------------------------------------------------------------------
        print("[e2e] Step 2: create paid tab")
        if mode == "facilitator":
            paid_requirements = _build_v1_requirements(
                network, recipient_address, erc20_token, guarantee_amount, tab_ttl
            )
            print("[e2e] Step 3: sign paid guarantee request")
            assert facilitator_flow is not None
            (
                paid_envelope,
                paid_claims,
                paid_signature,
            ) = await _sign_v1_payment_with_facilitator(
                facilitator_flow, paid_requirements, payer_address
            )
            paid_tab_id = paid_claims.tab_id
            paid_req_id = paid_claims.req_id
            print(f"[e2e] signature: {paid_signature[:20]}...")
        else:
            paid_tab_id, _, _ = await recipient.recipient.create_tab(
                payer_address, recipient_address, erc20_token, tab_ttl
            )
            latest_before = await recipient.recipient.get_latest_guarantee(paid_tab_id)
            paid_req_id = latest_before.req_id + 1 if latest_before is not None else 0
            print("[e2e] Step 3: sign paid guarantee request")
            paid_timestamp = int(time.time())
            paid_claims = PaymentGuaranteeRequestClaims.new(
                user_address=payer_address,
                recipient_address=recipient_address,
                tab_id=paid_tab_id,
                req_id=paid_req_id,
                amount=guarantee_amount,
                timestamp=paid_timestamp,
                erc20_token=erc20_token,
            )
            paid_sig = await payer.user.sign_payment(paid_claims, SigningScheme.EIP712)
            print(f"[e2e] signature: {paid_sig.signature[:20]}...")
        print(f"[e2e] paid_tab_id: {hex(paid_tab_id)}")

        # ------------------------------------------------------------------
        # 4. Recipient issues paid guarantee
        # ------------------------------------------------------------------
        print("[e2e] Step 4: issue paid guarantee")
        if mode == "facilitator":
            assert facilitator is not None
            paid_cert = await _issue_guarantee_via_facilitator(
                facilitator,
                1,
                paid_envelope,
                paid_requirements,
            )
        else:
            paid_cert = await recipient.recipient.issue_payment_guarantee(
                paid_claims, paid_sig.signature, paid_sig.scheme
            )
        print(f"[e2e] cert claims: {paid_cert.claims[:20]}...")

        # ------------------------------------------------------------------
        # 5. Verify the paid BLS certificate
        # ------------------------------------------------------------------
        print("[e2e] Step 5: verify paid guarantee")
        paid_decoded = recipient.recipient.verify_payment_guarantee(paid_cert)
        assert paid_decoded.user_address.lower() == payer_address.lower()
        assert paid_decoded.recipient_address.lower() == recipient_address.lower()
        assert paid_decoded.tab_id == paid_tab_id
        assert paid_decoded.amount == guarantee_amount
        print(
            f"[e2e] guarantee verified, total_amount: "
            f"{_format_units(paid_decoded.total_amount, decimals)}"
        )

        locked_after_paid_guarantee = await _wait_for_user_asset_balance(
            payer,
            payer_address,
            erc20_token,
            lambda b: (
                b.total == deposit_balance.total
                and b.locked == deposit_balance.locked + paid_decoded.amount
            ),
            timeout_ms=payment_sync_timeout_ms,
        )

        # ------------------------------------------------------------------
        # 6. Payer pays the tab on-chain
        # ------------------------------------------------------------------
        print("[e2e] Step 6: pay tab on-chain")
        await payer.user.approve_erc20(erc20_token, guarantee_amount)
        recipient_token_balance_before = await _get_erc20_balance(
            payer, erc20_token, recipient_address
        )
        pay_receipt = await payer.user.pay_tab(
            paid_tab_id,
            paid_req_id,
            guarantee_amount,
            recipient_address,
            erc20_token,
        )
        await _mine_block(payer)
        recipient_token_balance_after = await _get_erc20_balance(
            payer, erc20_token, recipient_address
        )
        assert (
            recipient_token_balance_after - recipient_token_balance_before
            == guarantee_amount
        )

        status = await _wait_for_tab_payment_status(
            payer,
            paid_tab_id,
            lambda s: s.paid >= guarantee_amount,
            timeout_ms=payment_sync_timeout_ms,
        )
        assert status.paid == guarantee_amount
        assert not status.remunerated
        assert normalize_address(status.asset) == normalize_address(erc20_token)
        print(f"[e2e] tab paid: {_format_units(status.paid, decimals)}")

        pay_tx_hash = pay_receipt.get("transactionHash", b"")
        if isinstance(pay_tx_hash, bytes):
            pay_tx_hash = "0x" + pay_tx_hash.hex()
        pay_tx_hash = str(pay_tx_hash)

        recipient_payments = await recipient.recipient.list_recipient_payments()
        recorded_payment = next(
            (
                payment
                for payment in recipient_payments
                if payment.tx_hash.lower().removeprefix("0x")
                == pay_tx_hash.lower().removeprefix("0x")
            ),
            None,
        )
        assert recorded_payment is not None
        assert recorded_payment.amount == guarantee_amount
        assert not recorded_payment.failed

        if require_finalization:
            print("[e2e] waiting for payment finalization...")
            unlocked_after_payment = await _wait_for_user_asset_balance(
                payer,
                payer_address,
                erc20_token,
                lambda b: (
                    b.total == locked_after_paid_guarantee.total
                    and b.locked
                    == locked_after_paid_guarantee.locked - guarantee_amount
                ),
                timeout_ms=payment_finalization_timeout_ms,
                mine_on_poll=True,
            )
            assert unlocked_after_payment.total == locked_after_paid_guarantee.total
            assert (
                unlocked_after_payment.locked
                == locked_after_paid_guarantee.locked - guarantee_amount
            )

        guarantees = await recipient.recipient.get_tab_guarantees(paid_tab_id)
        assert len(guarantees) >= 1

        latest = await recipient.recipient.get_latest_guarantee(paid_tab_id)
        assert latest is not None
        assert latest.amount == guarantee_amount

        guarantee_by_req = await recipient.recipient.get_guarantee(
            paid_tab_id, paid_req_id
        )
        assert guarantee_by_req is not None
        assert guarantee_by_req.amount == guarantee_amount

        settled_tabs = await recipient.recipient.list_settled_tabs()
        settled_ids = [t.tab_id for t in settled_tabs]
        assert paid_tab_id in settled_ids, f"tab {hex(paid_tab_id)} not in settled tabs"

        # ------------------------------------------------------------------
        # 7. Create remunerated tab and guarantee
        # ------------------------------------------------------------------
        print("[e2e] Step 7: create remunerated tab")
        if mode == "facilitator":
            rem_requirements = _build_v1_requirements(
                network, recipient_address, erc20_token, guarantee_amount, tab_ttl
            )
            assert facilitator_flow is not None
            rem_envelope, rem_claims, _ = await _sign_v1_payment_with_facilitator(
                facilitator_flow, rem_requirements, payer_address
            )
            rem_tab_id = rem_claims.tab_id
            rem_req_id = rem_claims.req_id
        else:
            rem_tab_id, _, _ = await recipient.recipient.create_tab(
                payer_address, recipient_address, erc20_token, tab_ttl
            )
            rem_latest_before = await recipient.recipient.get_latest_guarantee(
                rem_tab_id
            )
            rem_req_id = (
                rem_latest_before.req_id + 1 if rem_latest_before is not None else 0
            )
        print(f"[e2e] rem_tab_id: {hex(rem_tab_id)}")

        if mode == "facilitator":
            assert facilitator is not None
            rem_cert = await _issue_guarantee_via_facilitator(
                facilitator,
                1,
                rem_envelope,
                rem_requirements,
            )
        else:
            rem_claims = PaymentGuaranteeRequestClaims.new(
                user_address=payer_address,
                recipient_address=recipient_address,
                tab_id=rem_tab_id,
                req_id=rem_req_id,
                amount=guarantee_amount,
                timestamp=int(time.time()),
                erc20_token=erc20_token,
            )
            rem_sig = await payer.user.sign_payment(rem_claims, SigningScheme.EIP712)
            rem_cert = await recipient.recipient.issue_payment_guarantee(
                rem_claims, rem_sig.signature, rem_sig.scheme
            )
        rem_decoded = recipient.recipient.verify_payment_guarantee(rem_cert)
        assert rem_decoded.tab_id == rem_tab_id
        assert rem_decoded.total_amount == guarantee_amount

        balance_before_remuneration = await _wait_for_user_asset_balance(
            payer,
            payer_address,
            erc20_token,
            lambda b: (
                b.total >= deposit_balance.total - paid_decoded.amount
                and b.locked >= rem_decoded.amount
            ),
            timeout_ms=payment_sync_timeout_ms,
        )

        try:
            remuneration_grace = int(
                await payer.gateway.contract.functions.remunerationGracePeriod().call()
            )
        except Exception:
            remuneration_grace = 14 * 24 * 60 * 60
        await _wait_until_unix_ts(
            "Remuneration grace period",
            rem_claims.timestamp + remuneration_grace + 1,
            payer,
        )

        # ------------------------------------------------------------------
        # 8. Recipient remunerates overdue tab
        # ------------------------------------------------------------------
        print("[e2e] Step 8: remunerate")
        remunerate_receipt = await recipient.recipient.remunerate(rem_cert)
        await _mine_block(recipient)
        tx_hash = remunerate_receipt.get("transactionHash", b"")
        if isinstance(tx_hash, bytes):
            tx_hash = tx_hash.hex()
        print(f"[e2e] remunerate tx: {tx_hash}")

        rem_tab_status = await recipient.recipient.get_tab_payment_status(rem_tab_id)
        assert rem_tab_status.remunerated, "tab should be marked remunerated"
        assert rem_tab_status.paid == 0
        print("[e2e] remuneration confirmed on-chain")

        post_remuneration_balance = await _wait_for_user_asset_balance(
            payer,
            payer_address,
            erc20_token,
            lambda b: (
                b.total
                == max(balance_before_remuneration.total - rem_decoded.total_amount, 0)
                and b.locked
                == max(balance_before_remuneration.locked - rem_decoded.total_amount, 0)
            ),
            timeout_ms=payment_sync_timeout_ms,
        )
        post_remuneration_assets = await payer.user.get_user()
        post_remuneration_position = next(
            (
                a
                for a in post_remuneration_assets
                if normalize_address(a.asset) == normalize_address(erc20_token)
            ),
            None,
        )
        assert post_remuneration_position is not None
        assert post_remuneration_position.collateral == post_remuneration_balance.total

        effective_withdraw_amount = min(
            withdraw_amount, post_remuneration_position.collateral
        )
        assert effective_withdraw_amount > 0

        # ------------------------------------------------------------------
        # 9. Payer requests withdrawal
        # ------------------------------------------------------------------
        print("[e2e] Step 9: request withdrawal")
        payer_token_balance_before_withdrawal = await _get_erc20_balance(
            payer, erc20_token, payer_address
        )
        await payer.user.request_withdrawal(effective_withdraw_amount, erc20_token)
        await _mine_block(payer)

        requested_assets = await payer.user.get_user()
        requested_position = next(
            (
                a
                for a in requested_assets
                if normalize_address(a.asset) == normalize_address(erc20_token)
            ),
            None,
        )
        assert requested_position is not None
        assert requested_position.collateral == post_remuneration_position.collateral
        assert requested_position.withdrawal_request_amount == effective_withdraw_amount
        assert requested_position.withdrawal_request_timestamp > 0

        try:
            grace = int(
                await payer.gateway.contract.functions.withdrawalGracePeriod().call()
            )
        except Exception:
            grace = 5
        print(f"[e2e] withdrawal grace period: {grace}s — waiting...")
        await _wait_until_unix_ts(
            "Withdrawal grace period",
            requested_position.withdrawal_request_timestamp + grace + 1,
            payer,
        )

        # ------------------------------------------------------------------
        # 10. Finalize withdrawal
        # ------------------------------------------------------------------
        print("[e2e] Step 10: finalize withdrawal")
        await payer.user.finalize_withdrawal(erc20_token)
        await _mine_block(payer)
        print("[e2e] withdrawal finalized")

        payer_token_balance_after_withdrawal = await _get_erc20_balance(
            payer, erc20_token, payer_address
        )
        assert (
            payer_token_balance_after_withdrawal - payer_token_balance_before_withdrawal
            == effective_withdraw_amount
        )

        final_assets = await payer.user.get_user()
        final_position = next(
            (
                a
                for a in final_assets
                if normalize_address(a.asset) == normalize_address(erc20_token)
            ),
            None,
        )
        assert final_position is not None
        assert (
            final_position.collateral
            == requested_position.collateral - effective_withdraw_amount
        )
        assert final_position.withdrawal_request_amount == 0
        assert final_position.withdrawal_request_timestamp == 0
        print(
            f"[e2e] remaining collateral: "
            f"{_format_units(final_position.collateral, decimals)}"
            f" (expected {_format_units(requested_position.collateral - effective_withdraw_amount, decimals)})"
        )

        print("[e2e] V1 credit flow PASSED")


# ---------------------------------------------------------------------------
# V2 Credit Flow
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.timeout(420)
async def test_credit_flow_v2_guarantee_when_validation_config_available():
    """
    V2 guarantee flow:
    deposit → create tab → compute hashes → sign V2 claims → issue guarantee → verify
    """
    payer_key = _env("PAYER_PRIVATE_KEY", _DEFAULT_PAYER_KEY)
    recipient_key = _env("RECIPIENT_PRIVATE_KEY", _DEFAULT_RECIPIENT_KEY)
    payment_sync_timeout_ms = _env_int("PAYMENT_SYNC_TIMEOUT_MS", 150_000)

    mode = _resolve_e2e_mode()
    async with contextlib.AsyncExitStack() as stack:
        payer = await stack.enter_async_context(
            await Client.new(_make_config(payer_key))
        )
        recipient = await stack.enter_async_context(
            await Client.new(_make_config(recipient_key))
        )
        facilitator = None
        if mode == "facilitator":
            facilitator = await stack.enter_async_context(_make_facilitator_client())

        await _login_if_enabled(payer)
        await _login_if_enabled(recipient)
        facilitator_flow = (
            _FacilitatorX402Flow(payer.user, facilitator)
            if facilitator is not None
            else None
        )

        if 2 not in payer.params.accepted_guarantee_versions_or_default():
            pytest.skip("core does not advertise V2 guarantee support")

        payer_address = payer._signer.address
        recipient_address = recipient._signer.address
        network = _caip2_network(payer)

        validation_registry = _env(
            "VALIDATION_REGISTRY",
            (
                payer.params.trusted_validation_registries[0]
                if payer.params.trusted_validation_registries
                else _DEFAULT_V2_VALIDATION_REGISTRY
            ),
        )
        validator_address = _env(
            "VALIDATOR_ADDRESS",
            _DEFAULT_V2_VALIDATOR_ADDRESS,
        )
        validator_agent_id = _env_int("VALIDATOR_AGENT_ID", 1)
        min_score = _env_int("MIN_VALIDATION_SCORE", 80)
        validation_tag = _env("VALIDATION_TAG", "")
        job_hash = _env("JOB_HASH", "0x" + "11" * 32)

        # Resolve chain id for validation registry
        validation_chain_id_env = _env("VALIDATION_CHAIN_ID")
        validation_chain_id = (
            int(validation_chain_id_env, 0)
            if validation_chain_id_env
            else payer.gateway.chain_id
        )

        erc20_token, decimals, token_symbol = await _resolve_token_metadata(payer)
        tab_ttl = await _resolve_effective_tab_ttl(payer)

        v2_amount_raw = _env("V2_GUARANTEE_AMOUNT")
        v2_amount = (
            int(v2_amount_raw, 0) if v2_amount_raw else _parse_units("0.001", decimals)
        )

        deposit_raw = _env("DEPOSIT_AMOUNT")
        deposit_amount = (
            int(deposit_raw, 0) if deposit_raw else _parse_units("1.0", decimals)
        )

        print(f"\n[e2e-v2] payer:     {payer_address}")
        print(f"[e2e-v2] recipient: {recipient_address}")
        print(f"[e2e-v2] rpc:       {_env('4MICA_RPC_URL', _DEFAULT_CORE_RPC_URL)}")
        print(f"[e2e-v2] mode:      {mode}")
        print(f"[e2e-v2] token:     {erc20_token} ({token_symbol})")
        print(f"[e2e-v2] amount:    {_format_units(v2_amount, decimals)}")
        print(f"[e2e-v2] registry:  {validation_registry}")
        print(f"[e2e-v2] validator: {validator_address}")
        print(f"[e2e-v2] tag:       {validation_tag}")

        # ------------------------------------------------------------------
        # 0. Ensure recipient has native gas
        # ------------------------------------------------------------------
        await _ensure_recipient_native_gas(payer, recipient_address)

        # ------------------------------------------------------------------
        # 1. Deposit collateral
        # ------------------------------------------------------------------
        print("[e2e-v2] Step 1: deposit")
        await payer.user.approve_erc20(erc20_token, deposit_amount)
        await payer.user.deposit(deposit_amount, erc20_token)
        await _mine_block(payer)

        await _wait_for_core_asset_balance(
            payer,
            payer_address,
            erc20_token,
            deposit_amount,
            timeout_ms=payment_sync_timeout_ms,
        )
        print(f"[e2e-v2] deposit confirmed: {_format_units(deposit_amount, decimals)}")

        # ------------------------------------------------------------------
        # 2. Create tab / prepare payment
        # ------------------------------------------------------------------
        print("[e2e-v2] Step 2: create tab")
        if mode == "facilitator":
            requirements_v2 = _build_v2_requirements(
                network=network,
                recipient_address=recipient_address,
                asset_address=erc20_token,
                amount=v2_amount,
                ttl_seconds=tab_ttl,
                validation_registry=validation_registry,
                validation_chain_id=validation_chain_id,
                validator_address=validator_address,
                validator_agent_id=validator_agent_id,
                min_validation_score=min_score,
                required_validation_tag=validation_tag,
                job_hash=job_hash,
            )
            payment_required_v2 = X402PaymentRequired(
                x402_version=2,
                resource=X402ResourceInfo(
                    url=f"{_facilitator_url()}/resource/e2e-v2",
                    description="e2e-v2",
                    mime_type="application/json",
                ),
                accepts=[requirements_v2],
            )
            assert facilitator_flow is not None
            print("[e2e-v2] Step 3: build and sign V2 claims via SDK")
            (
                envelope_v2,
                claims_v2,
                signed_v2_signature,
            ) = await _sign_v2_payment_with_facilitator(
                facilitator_flow,
                payment_required_v2,
                requirements_v2,
                payer_address,
            )
            tab_id = claims_v2.tab_id
            req_id = claims_v2.req_id
            print(f"[e2e-v2] signature: {signed_v2_signature[:20]}...")
        else:
            tab_id, _, _ = await recipient.recipient.create_tab(
                payer_address, recipient_address, erc20_token, tab_ttl
            )
            latest_before = await recipient.recipient.get_latest_guarantee(tab_id)
            req_id = latest_before.req_id + 1 if latest_before is not None else 0
        print(f"[e2e-v2] tab_id: {hex(tab_id)}")

        # ------------------------------------------------------------------
        # 3. Build V2 claims (two-step hash computation)
        # ------------------------------------------------------------------
        if mode != "facilitator":
            print("[e2e-v2] Step 3: build V2 claims")
            timestamp = int(time.time())

            # Step A: compute validation_subject_hash from base (V1) claims
            base_claims = PaymentGuaranteeRequestClaims.new(
                user_address=payer_address,
                recipient_address=recipient_address,
                tab_id=tab_id,
                req_id=req_id,
                amount=v2_amount,
                timestamp=timestamp,
                erc20_token=erc20_token,
            )
            validation_subject_hash = compute_validation_subject_hash(base_claims)

            # Step B: compute validation_request_hash from a partial policy
            #         (validation_request_hash field is zeroed during this step)
            partial_policy = PaymentGuaranteeValidationPolicyV2(
                validation_registry_address=validation_registry,
                validation_request_hash="0x" + "00" * 32,
                validation_chain_id=validation_chain_id,
                validator_address=validator_address,
                validator_agent_id=validator_agent_id,
                min_validation_score=min_score,
                validation_subject_hash=validation_subject_hash,
                required_validation_tag=validation_tag,
                job_hash=job_hash,
            )
            validation_request_hash = compute_validation_request_hash(partial_policy)

            # Step C: construct final V2 claims with both hashes
            claims_v2 = PaymentGuaranteeRequestClaimsV2.new(
                user_address=payer_address,
                recipient_address=recipient_address,
                tab_id=tab_id,
                req_id=req_id,
                amount=v2_amount,
                timestamp=timestamp,
                erc20_token=erc20_token,
                validation_registry_address=validation_registry,
                validation_request_hash=validation_request_hash,
                validation_chain_id=validation_chain_id,
                validator_address=validator_address,
                validator_agent_id=validator_agent_id,
                min_validation_score=min_score,
                validation_subject_hash=validation_subject_hash,
                required_validation_tag=validation_tag,
                job_hash=job_hash,
            )

            # ------------------------------------------------------------------
            # 4. Sign V2 claims
            # ------------------------------------------------------------------
            print("[e2e-v2] Step 4: sign V2 claims")
            sig = await payer.user.sign_payment(claims_v2, SigningScheme.EIP712)
            print(f"[e2e-v2] signature: {sig.signature[:20]}...")

        # ------------------------------------------------------------------
        # 5. Issue V2 guarantee
        # ------------------------------------------------------------------
        print("[e2e-v2] Step 5: issue V2 guarantee")
        if mode == "facilitator":
            assert facilitator is not None
            cert = await _issue_guarantee_via_facilitator(
                facilitator,
                2,
                envelope_v2,
                requirements_v2,
            )
        else:
            cert = await recipient.recipient.issue_payment_guarantee(
                claims_v2, sig.signature, sig.scheme
            )
        print(f"[e2e-v2] cert claims: {cert.claims[:20]}...")

        # ------------------------------------------------------------------
        # 6. Verify the BLS certificate
        # ------------------------------------------------------------------
        print("[e2e-v2] Step 6: verify V2 guarantee")
        decoded = recipient.recipient.verify_payment_guarantee(cert)
        assert decoded.user_address.lower() == payer_address.lower()
        assert decoded.recipient_address.lower() == recipient_address.lower()
        assert decoded.tab_id == tab_id
        assert decoded.amount == v2_amount
        assert decoded.validation_policy is not None
        assert decoded.validation_policy.required_validation_tag == validation_tag
        assert decoded.validation_policy.min_validation_score == min_score
        print(
            f"[e2e-v2] V2 guarantee verified, tag: "
            f"{decoded.validation_policy.required_validation_tag}"
        )
        print("[e2e-v2] V2 issue+verify flow PASSED")
