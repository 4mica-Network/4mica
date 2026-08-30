from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional

import httpx
from .errors import (
    AuthConfigError,
    AuthDecodeError,
    AuthStatusError,
    AuthTransportError,
    AuthUrlError,
    SigningError,
)
from .signing import EvmSigner, LocalAccountSigner
from .utils import ValidationError, validate_url


@dataclass
class AuthTokens:
    access_token: str
    refresh_token: str
    expires_in: int

    @classmethod
    def from_payload(cls, payload: Dict[str, Any]) -> "AuthTokens":
        def require(key: str) -> Any:
            if key not in payload or payload[key] is None:
                raise AuthDecodeError(f"missing auth token field: {key}")
            return payload[key]

        try:
            expires_in = int(require("expires_in"))
        except (TypeError, ValueError) as exc:
            raise AuthDecodeError("invalid expires_in value") from exc

        return cls(
            access_token=str(require("access_token")),
            refresh_token=str(require("refresh_token")),
            expires_in=expires_in,
        )


@dataclass
class SiweTemplate:
    domain: str
    uri: str
    chain_id: int
    statement: str
    expiration: str
    issued_at: str

    @classmethod
    def from_payload(cls, payload: Dict[str, Any]) -> "SiweTemplate":
        def pick(*keys: str) -> Any:
            for key in keys:
                if key in payload and payload[key] is not None:
                    return payload[key]
            return None

        def require(*keys: str) -> Any:
            value = pick(*keys)
            if value is None:
                raise AuthDecodeError(f"missing SIWE field: {keys[0]}")
            return value

        try:
            chain_id = int(require("chain_id", "chainId"))
        except (TypeError, ValueError) as exc:
            raise AuthDecodeError("invalid chain_id value") from exc

        return cls(
            domain=str(require("domain")),
            uri=str(require("uri")),
            chain_id=chain_id,
            statement=str(require("statement")),
            expiration=str(require("expiration")),
            issued_at=str(require("issued_at", "issuedAt")),
        )


@dataclass
class AuthNonceResponse:
    nonce: str
    siwe: SiweTemplate

    @classmethod
    def from_payload(cls, payload: Dict[str, Any]) -> "AuthNonceResponse":
        if not isinstance(payload, dict):
            raise AuthDecodeError("invalid nonce response payload")
        if "siwe" not in payload or payload["siwe"] is None:
            raise AuthDecodeError("missing siwe template in nonce response")
        siwe_payload = payload["siwe"]
        if not isinstance(siwe_payload, dict):
            raise AuthDecodeError("invalid siwe template payload")
        nonce = payload.get("nonce")
        if nonce is None:
            raise AuthDecodeError("missing nonce in nonce response")
        return cls(nonce=str(nonce), siwe=SiweTemplate.from_payload(siwe_payload))


def build_siwe_message(template: SiweTemplate, address: str, nonce: str) -> str:
    return (
        f"{template.domain} wants you to sign in with your Ethereum account:\n"
        f"{address}\n\n"
        f"{template.statement}\n\n"
        f"URI: {template.uri}\n"
        "Version: 1\n"
        f"Chain ID: {template.chain_id}\n"
        f"Nonce: {nonce}\n"
        f"Issued At: {template.issued_at}\n"
        f"Expiration Time: {template.expiration}"
    )


class AuthClient:
    def __init__(
        self, auth_url: str, client: Optional[httpx.AsyncClient] = None
    ) -> None:
        try:
            auth_url = validate_url(auth_url)
        except ValidationError as exc:
            raise AuthUrlError(str(exc)) from exc
        base = auth_url if auth_url.endswith("/") else f"{auth_url}/"
        self._client = client or httpx.AsyncClient(base_url=base, timeout=20.0)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _decode(self, response: httpx.Response) -> Any:
        try:
            payload = response.json()
        except Exception as exc:
            if response.is_success:
                raise AuthDecodeError(
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
        raise AuthStatusError(
            f"{response.status_code}: {message}", status_code=response.status_code
        )

    async def _post(self, path: str, body: Any) -> Any:
        try:
            resp = await self._client.post(path, json=body)
        except httpx.HTTPError as exc:
            raise AuthTransportError(str(exc)) from exc
        return await self._decode(resp)

    async def get_nonce(self, address: str) -> AuthNonceResponse:
        payload = await self._post("/auth/nonce", {"address": address})
        if not isinstance(payload, dict):
            raise AuthDecodeError("invalid nonce response payload")
        return AuthNonceResponse.from_payload(payload)

    async def verify(self, address: str, message: str, signature: str) -> AuthTokens:
        payload = await self._post(
            "/auth/verify",
            {"address": address, "message": message, "signature": signature},
        )
        if not isinstance(payload, dict):
            raise AuthDecodeError("invalid verify response payload")
        return AuthTokens.from_payload(payload)

    async def refresh(self, refresh_token: str) -> AuthTokens:
        payload = await self._post("/auth/refresh", {"refresh_token": refresh_token})
        if not isinstance(payload, dict):
            raise AuthDecodeError("invalid refresh response payload")
        return AuthTokens.from_payload(payload)

    async def logout(self, refresh_token: str) -> None:
        await self._post("/auth/logout", {"refresh_token": refresh_token})


class AuthSession:
    def __init__(
        self,
        client: AuthClient,
        wallet_private_key: Optional[str] = None,
        evm_signer: Optional[EvmSigner] = None,
        refresh_margin_secs: int = 60,
    ) -> None:
        if refresh_margin_secs < 0:
            raise AuthConfigError("refresh_margin_secs cannot be negative")
        if evm_signer is None:
            if not wallet_private_key:
                raise AuthConfigError("wallet_private_key or evm_signer is required")
            try:
                evm_signer = LocalAccountSigner(wallet_private_key)
            except SigningError as exc:
                raise AuthConfigError(str(exc)) from exc

        self._client = client
        self._signer = evm_signer
        self._address = evm_signer.address
        self._refresh_margin_secs = refresh_margin_secs
        self._tokens: Optional[AuthTokens] = None
        self._expires_at: Optional[float] = None
        self._lock = asyncio.Lock()

    async def aclose(self) -> None:
        await self._client.aclose()

    def _cache_tokens(self, tokens: AuthTokens) -> None:
        self._tokens = tokens
        self._expires_at = time.time() + max(tokens.expires_in, 0)

    def _token_valid(self) -> bool:
        if not self._tokens or self._expires_at is None:
            return False
        return time.time() < (self._expires_at - self._refresh_margin_secs)

    async def login(self) -> AuthTokens:
        async with self._lock:
            return await self._login_locked()

    async def _login_locked(self) -> AuthTokens:
        nonce = await self._client.get_nonce(self._address)
        message = build_siwe_message(nonce.siwe, self._address, nonce.nonce)
        signed = await self._signer.sign_message(message)
        signature = signed.hex() if isinstance(signed, bytes) else str(signed)
        if not signature.startswith("0x"):
            signature = "0x" + signature
        tokens = await self._client.verify(self._address, message, signature)
        self._cache_tokens(tokens)
        return tokens

    async def _refresh(self) -> AuthTokens:
        if not self._tokens:
            return await self._login_locked()
        try:
            tokens = await self._client.refresh(self._tokens.refresh_token)
        except AuthStatusError as exc:
            if exc.status_code == 401:
                return await self._login_locked()
            raise
        self._cache_tokens(tokens)
        return tokens

    async def logout(self) -> None:
        async with self._lock:
            if self._tokens:
                try:
                    await self._client.logout(self._tokens.refresh_token)
                finally:
                    self._tokens = None
                    self._expires_at = None

    async def access_token(self) -> str:
        if self._token_valid():
            return self._tokens.access_token  # type: ignore[union-attr]
        async with self._lock:
            if self._token_valid():
                return self._tokens.access_token  # type: ignore[union-attr]
            if self._tokens:
                tokens = await self._refresh()
            else:
                tokens = await self._login_locked()
            return tokens.access_token
