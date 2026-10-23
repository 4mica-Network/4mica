"""HTTP client for the 4Mica core operator API.

Mirrors ``crates/rpc/src/proxy.rs``: the paths here are exactly the routes
core serves (``core/src/http.rs``); anything else is another service's
endpoint. GETs retry on 429/5xx; POSTs never do — they may have acted.
"""

from __future__ import annotations

import asyncio
from importlib.metadata import PackageNotFoundError, version
from typing import Any, Awaitable, Callable, Dict, List, Optional

import httpx

from .errors import RpcError
from .guarantee import GuaranteeReceipt
from .models import (
    ActiveCycleResponse,
    AssetBalanceInfo,
    CheckpointAcceptedResponse,
    CheckpointBatchResponse,
    ClearingParticipantProof,
    ClearingSettlementAction,
    ClearingSettlementActionResponse,
    CorePublicParameters,
    PaymentRequest,
    RecipientPaymentInfo,
    SignedCheckpoint,
    SupportedTokensResponse,
    UserSuspensionStatus,
)
from .utils import normalize_bytes32_hex

ADMIN_API_KEY_HEADER = "x-api-key"
AUTHORIZATION_HEADER = "authorization"
SDK_CLIENT_HEADER = "x-4mica-sdk"

try:
    _SDK_VERSION = version("sdk-4mica")
except PackageNotFoundError:
    _SDK_VERSION = "unknown"

SDK_CLIENT = f"py-sdk-4mica/{_SDK_VERSION}"
TokenProvider = Callable[[], Awaitable[str]]

_RETRYABLE_STATUS_CODES: frozenset = frozenset({429, 500, 502, 503, 504})
_MAX_RETRIES = 3
_RETRY_BASE_DELAY = 0.5  # seconds


class RpcProxy:
    """HTTP client for the core operator API."""

    def __init__(
        self, endpoint: str, transport: Optional[httpx.AsyncBaseTransport] = None
    ) -> None:
        base = endpoint if endpoint.endswith("/") else f"{endpoint}/"
        self._client = httpx.AsyncClient(
            base_url=base, timeout=20.0, transport=transport
        )
        self._admin_api_key: Optional[str] = None
        self._bearer_token: Optional[str] = None
        self._token_provider: Optional[TokenProvider] = None

    def with_admin_api_key(self, admin_api_key: str) -> "RpcProxy":
        self._admin_api_key = admin_api_key
        return self

    def with_bearer_token(self, bearer_token: str) -> "RpcProxy":
        self._bearer_token = bearer_token
        return self

    def with_token_provider(self, provider: TokenProvider) -> "RpcProxy":
        self._token_provider = provider
        return self

    async def aclose(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "RpcProxy":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self.aclose()

    async def _headers(
        self, admin: bool = False, authed: bool = True
    ) -> Dict[str, str]:
        headers: Dict[str, str] = {
            SDK_CLIENT_HEADER: SDK_CLIENT,
            "user-agent": SDK_CLIENT,
        }
        if admin and self._admin_api_key:
            headers[ADMIN_API_KEY_HEADER] = self._admin_api_key
        if not authed:
            return headers
        token: Optional[str] = None
        if self._token_provider is not None:
            token = await self._token_provider()
        elif self._bearer_token:
            token = self._bearer_token
        if token:
            if token.lower().startswith("bearer "):
                headers[AUTHORIZATION_HEADER] = token
            else:
                headers[AUTHORIZATION_HEADER] = f"Bearer {token}"
        return headers

    async def _decode(self, response: httpx.Response) -> Any:
        try:
            payload = response.json()
        except Exception as exc:
            if response.is_success:
                raise RpcError(
                    f"invalid JSON response from {response.request.url}: {exc}"
                ) from exc
            payload = response.text
        if response.is_success:
            return payload

        # Core's error body is {"error": <message>, "code"?, "details"?};
        # anything else is surfaced verbatim so a proxy failure reads sensibly.
        message = "unknown error"
        code: Optional[str] = None
        details: Any = None
        if isinstance(payload, dict):
            message = payload.get("error") or payload.get("message") or str(payload)
            code = payload.get("code") if isinstance(payload.get("code"), str) else None
            details = payload.get("details")
        elif isinstance(payload, str) and payload.strip():
            message = payload.strip()
        raise RpcError(
            f"{response.status_code}: {message}",
            status_code=response.status_code,
            code=code,
            details=details,
        )

    async def _get(
        self,
        path: str,
        admin: bool = False,
        params: Optional[Dict[str, Any]] = None,
        authed: bool = True,
    ) -> Any:
        last_exc: Optional[RpcError] = None
        for attempt in range(_MAX_RETRIES):
            if attempt > 0:
                await asyncio.sleep(_RETRY_BASE_DELAY * (2 ** (attempt - 1)))
            try:
                resp = await self._client.get(
                    path, headers=await self._headers(admin, authed), params=params
                )
            except httpx.HTTPError as exc:
                raise RpcError(f"request to {path} failed: {exc}") from exc
            try:
                return await self._decode(resp)
            except RpcError as exc:
                if exc.status_code not in _RETRYABLE_STATUS_CODES:
                    raise
                last_exc = exc
        raise last_exc  # type: ignore[misc]

    async def _post(self, path: str, body: Any, admin: bool = False) -> Any:
        try:
            resp = await self._client.post(
                path, json=body, headers=await self._headers(admin)
            )
        except httpx.HTTPError as exc:
            raise RpcError(f"request to {path} failed: {exc}") from exc
        return await self._decode(resp)

    async def get_public_params(self) -> CorePublicParameters:
        return CorePublicParameters.from_rpc(
            await self._get("/core/public-params", authed=False)
        )

    async def get_supported_tokens(self) -> SupportedTokensResponse:
        return SupportedTokensResponse.from_rpc(
            await self._get("/core/tokens", authed=False)
        )

    async def issue_guarantee(self, request: PaymentRequest) -> GuaranteeReceipt:
        return GuaranteeReceipt.from_rpc(
            await self._post("/core/guarantees", request.to_payload())
        )

    async def get_active_cycle(self, asset_address: str) -> ActiveCycleResponse:
        """The settlement cycle a payment for *asset_address* must be signed
        for right now."""
        raw = await self._get("/core/cycles/active", params={"asset": asset_address})
        return ActiveCycleResponse.from_rpc(raw)

    async def get_checkpoint_batch(
        self, payer: str, asset_address: str, cycle_id: Optional[str] = None
    ) -> CheckpointBatchResponse:
        """The previous checkpoint and the authorizations *payer*'s next one
        must cover, in the active cycle or the one *cycle_id* names. A closed
        cycle still answers until settlement has read what it holds."""
        params = {"asset": asset_address}
        if cycle_id is not None:
            params["cycle_id"] = normalize_bytes32_hex(cycle_id)
        raw = await self._get(f"/core/payers/{payer}/checkpoint-batch", params=params)
        return CheckpointBatchResponse.from_rpc(raw)

    async def submit_checkpoint(
        self, checkpoint: SignedCheckpoint
    ) -> CheckpointAcceptedResponse:
        raw = await self._post("/core/checkpoints", checkpoint.to_payload())
        return CheckpointAcceptedResponse.from_rpc(raw)

    async def get_clearing_participant_proof(
        self, cycle_id: str, participant: str
    ) -> ClearingParticipantProof:
        raw = await self._get(
            f"/core/cycles/{cycle_id}/participants/{participant}/clearing-proof"
        )
        return ClearingParticipantProof.from_rpc(raw)

    async def get_clearing_settlement_action(
        self, cycle_id: str, participant: str, action: ClearingSettlementAction
    ) -> ClearingSettlementActionResponse:
        raw = await self._get(
            f"/core/cycles/{cycle_id}/participants/{participant}/clearing-action",
            params={"action": ClearingSettlementAction(action).value},
        )
        return ClearingSettlementActionResponse.from_rpc(raw)

    async def get_clearing_pay_net_debit_action(
        self, cycle_id: str, debtor: str
    ) -> ClearingSettlementActionResponse:
        return await self.get_clearing_settlement_action(
            cycle_id, debtor, ClearingSettlementAction.PAY_NET_DEBIT
        )

    async def get_clearing_claim_net_credit_action(
        self, cycle_id: str, creditor: str
    ) -> ClearingSettlementActionResponse:
        return await self.get_clearing_settlement_action(
            cycle_id, creditor, ClearingSettlementAction.CLAIM_NET_CREDIT
        )

    async def list_recipient_payments(
        self, recipient_address: str
    ) -> List[RecipientPaymentInfo]:
        raw = await self._get(f"/core/recipients/{recipient_address}/payments")
        return [RecipientPaymentInfo.from_rpc(item) for item in raw or []]

    async def get_user_asset_balance(
        self, user_address: str, asset_address: str
    ) -> Optional[AssetBalanceInfo]:
        # Core answers JSON null (not 404) when the user holds nothing in the asset.
        raw = await self._get(f"/core/users/{user_address}/assets/{asset_address}")
        return AssetBalanceInfo.from_rpc(raw) if raw is not None else None

    async def update_user_suspension(
        self, user_address: str, suspended: bool
    ) -> UserSuspensionStatus:
        raw = await self._post(
            f"/core/users/{user_address}/suspension",
            {"suspended": suspended},
            admin=True,
        )
        return UserSuspensionStatus.from_rpc(raw)

    async def health(self) -> Dict[str, Any]:
        return await self._get("/core/health", authed=False)
