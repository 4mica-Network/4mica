from __future__ import annotations

import asyncio
import httpx
from importlib.metadata import PackageNotFoundError, version
from typing import Any, Awaitable, Callable, Dict, List, Optional

from .errors import RpcError
from .models import SupportedTokensResponse
from .signing import CorePublicParameters

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


def _serialize_tab_id(tab_id: int) -> str:
    return hex(int(tab_id))


class RpcProxy:
    """HTTP client for the core facilitator API."""

    def __init__(self, endpoint: str) -> None:
        base = endpoint if endpoint.endswith("/") else f"{endpoint}/"
        self._client = httpx.AsyncClient(base_url=base, timeout=20.0)
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

    async def _headers(self, admin: bool = False) -> Dict[str, str]:
        headers: Dict[str, str] = {
            SDK_CLIENT_HEADER: SDK_CLIENT,
            "user-agent": SDK_CLIENT,
        }
        if admin and self._admin_api_key:
            headers[ADMIN_API_KEY_HEADER] = self._admin_api_key
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

        message = "unknown error"
        if isinstance(payload, dict):
            message = payload.get("error") or payload.get("message") or str(payload)
        elif isinstance(payload, str) and payload.strip():
            message = payload.strip()
        raise RpcError(
            f"{response.status_code}: {message}", status_code=response.status_code
        )

    async def _get(
        self,
        path: str,
        admin: bool = False,
        params: Optional[Dict[str, Any]] = None,
    ) -> Any:
        last_exc: Optional[RpcError] = None
        for attempt in range(_MAX_RETRIES):
            if attempt > 0:
                await asyncio.sleep(_RETRY_BASE_DELAY * (2 ** (attempt - 1)))
            resp = await self._client.get(
                path, headers=await self._headers(admin), params=params
            )
            try:
                return await self._decode(resp)
            except RpcError as exc:
                if exc.status_code not in _RETRYABLE_STATUS_CODES:
                    raise
                last_exc = exc
        raise last_exc  # type: ignore[misc]

    async def _post(self, path: str, body: Any, admin: bool = False) -> Any:
        resp = await self._client.post(
            path, json=body, headers=await self._headers(admin)
        )
        return await self._decode(resp)

    async def get_public_params(self) -> CorePublicParameters:
        data = await self._get("/core/public-params")
        return CorePublicParameters.from_rpc(data)

    async def issue_guarantee(self, body: Dict[str, Any]) -> Dict[str, Any]:
        return await self._post("/core/guarantees", body)

    async def create_payment_tab(self, body: Dict[str, Any]) -> Dict[str, Any]:
        return await self._post("/core/payment-tabs", body)

    async def list_settled_tabs(self, recipient_address: str) -> List[Dict[str, Any]]:
        return await self._get(f"/core/recipients/{recipient_address}/settled-tabs")

    async def list_pending_remunerations(
        self, recipient_address: str
    ) -> List[Dict[str, Any]]:
        return await self._get(
            f"/core/recipients/{recipient_address}/pending-remunerations"
        )

    async def get_tab(self, tab_id: int) -> Optional[Dict[str, Any]]:
        return await self._get(f"/core/tabs/{_serialize_tab_id(tab_id)}")

    async def list_user_tabs(
        self, user_address: str, settlement_statuses: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        params: Optional[Dict[str, Any]] = None
        if settlement_statuses:
            params = {"settlement_status": settlement_statuses}
        return await self._get(f"/core/users/{user_address}/tabs", params=params)

    async def list_recipient_tabs(
        self, recipient_address: str, settlement_statuses: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        params: Optional[Dict[str, Any]] = None
        if settlement_statuses:
            params = {"settlement_status": settlement_statuses}
        return await self._get(
            f"/core/recipients/{recipient_address}/tabs", params=params
        )

    async def get_tab_guarantees(self, tab_id: int) -> List[Dict[str, Any]]:
        return await self._get(f"/core/tabs/{_serialize_tab_id(tab_id)}/guarantees")

    async def get_latest_guarantee(self, tab_id: int) -> Optional[Dict[str, Any]]:
        return await self._get(
            f"/core/tabs/{_serialize_tab_id(tab_id)}/guarantees/latest"
        )

    async def get_guarantee(self, tab_id: int, req_id: int) -> Optional[Dict[str, Any]]:
        return await self._get(
            f"/core/tabs/{_serialize_tab_id(tab_id)}/guarantees/{req_id}"
        )

    async def list_recipient_payments(
        self, recipient_address: str
    ) -> List[Dict[str, Any]]:
        return await self._get(f"/core/recipients/{recipient_address}/payments")

    async def get_collateral_events_for_tab(self, tab_id: int) -> List[Dict[str, Any]]:
        return await self._get(
            f"/core/tabs/{_serialize_tab_id(tab_id)}/collateral-events"
        )

    async def get_supported_tokens(self) -> SupportedTokensResponse:
        response = await self._get("/core/tokens")
        return SupportedTokensResponse.from_rpc(response)

    async def get_user_asset_balance(
        self, user_address: str, asset_address: str
    ) -> Optional[Dict[str, Any]]:
        return await self._get(f"/core/users/{user_address}/assets/{asset_address}")

    async def update_user_suspension(
        self, user_address: str, suspended: bool
    ) -> Dict[str, Any]:
        body = {"suspended": suspended}
        return await self._post(
            f"/core/users/{user_address}/suspension", body, admin=True
        )

    async def create_admin_api_key(self, body: Dict[str, Any]) -> Dict[str, Any]:
        return await self._post("/core/admin/api-keys", body, admin=True)

    async def list_admin_api_keys(self) -> List[Dict[str, Any]]:
        return await self._get("/core/admin/api-keys", admin=True)

    async def revoke_admin_api_key(self, key_id: str) -> Dict[str, Any]:
        return await self._post(f"/core/admin/api-keys/{key_id}/revoke", {}, admin=True)
