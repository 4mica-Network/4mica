from __future__ import annotations

import os
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .signing import EvmSigner

from .errors import ConfigError
from .networks import DEFAULT_NETWORK, NETWORKS, resolve_network
from .utils import (
    ValidationError,
    normalize_address,
    normalize_private_key,
    validate_url,
)

DEFAULT_RPC_URL = NETWORKS[DEFAULT_NETWORK].rpc_url

_ENV_PREFIXES = ("FOURMICA_", "4MICA_")


def read_env(env: Mapping[str, str], name: str) -> str | None:
    preferred, legacy = (env.get(prefix + name) for prefix in _ENV_PREFIXES)
    if preferred and legacy and preferred != legacy:
        raise ConfigError(
            f"FOURMICA_{name} and 4MICA_{name} are both set, to different "
            "values; unset one of them"
        )
    return preferred or legacy or None


@dataclass
class AuthConfig:
    auth_url: str
    refresh_margin_secs: int = 60


@dataclass
class Config:
    rpc_url: str
    wallet_private_key: str | None = field(repr=False)
    evm_signer: EvmSigner | None = None
    ethereum_http_rpc_url: str | None = None
    contract_address: str | None = None
    bearer_token: str | None = field(default=None, repr=False)
    auth: AuthConfig | None = None
    facilitator_url: str | None = None


class ConfigBuilder:
    """SIWE auth is on by default; a bearer token replaces it."""

    def __init__(self) -> None:
        self._rpc_url: str | None = DEFAULT_RPC_URL
        self._wallet_private_key: str | None = None
        self._evm_signer: EvmSigner | None = None
        self._ethereum_http_rpc_url: str | None = None
        self._contract_address: str | None = None
        self._bearer_token: str | None = None
        self._auth_enabled: bool = True
        self._auth_url: str | None = None
        self._auth_refresh_margin_secs: int | str | None = 60
        self._facilitator_url: str | None = None
        self._network_facilitator_url: str | None = None

    def rpc_url(self, value: str) -> ConfigBuilder:
        self._rpc_url = value
        self._network_facilitator_url = None
        return self

    def network(self, value: str) -> ConfigBuilder:
        """A shorthand (``"base"``) or CAIP-2 id (``"eip155:8453"``): sets its
        core API URL and any hosted facilitator. Exclusive with :meth:`rpc_url`."""
        resolved = resolve_network(value)
        if not resolved:
            raise ConfigError(
                f'unknown network "{value}". Use a known shorthand (e.g. "base") '
                "or CAIP-2 id, or call rpc_url() directly."
            )
        info = resolved[1]
        self._rpc_url = info.rpc_url
        self._network_facilitator_url = info.facilitator_url
        return self

    def wallet_private_key(self, value: str) -> ConfigBuilder:
        self._wallet_private_key = value
        return self

    def evm_signer(self, signer: EvmSigner) -> ConfigBuilder:
        self._evm_signer = signer
        return self

    def ethereum_http_rpc_url(self, value: str) -> ConfigBuilder:
        """Normally unnecessary: core advertises one."""
        self._ethereum_http_rpc_url = value
        return self

    def contract_address(self, value: str) -> ConfigBuilder:
        """Normally unnecessary: core advertises the deployment."""
        self._contract_address = value
        return self

    def facilitator_url(self, value: str) -> ConfigBuilder:
        """Without one, every operation is self-funded."""
        self._facilitator_url = value
        return self

    def bearer_token(self, value: str) -> ConfigBuilder:
        self._bearer_token = value
        return self

    def enable_auth(self) -> ConfigBuilder:
        self._auth_enabled = True
        return self

    def disable_auth(self) -> ConfigBuilder:
        self._auth_enabled = False
        return self

    def auth_url(self, value: str) -> ConfigBuilder:
        """Defaults to the RPC URL."""
        self._auth_url = value
        return self

    def auth_refresh_margin_secs(self, value: int) -> ConfigBuilder:
        self._auth_refresh_margin_secs = value
        return self

    def from_env(self, env: Mapping[str, str] | None = None) -> ConfigBuilder:
        """Reads ``FOURMICA_*`` (or the older ``4MICA_*``) from *env*, else
        ``os.environ``: ``NETWORK`` (wins over ``RPC_URL``), ``RPC_URL``,
        ``WALLET_PRIVATE_KEY``, ``ETHEREUM_HTTP_RPC_URL``, ``CONTRACT_ADDRESS``,
        ``FACILITATOR_URL``, ``BEARER_TOKEN``, ``AUTH_URL``,
        ``AUTH_REFRESH_MARGIN_SECS``."""
        source = os.environ if env is None else env
        network = read_env(source, "NETWORK")
        rpc_url = read_env(source, "RPC_URL")
        if network:
            self.network(network)
        elif rpc_url:
            self.rpc_url(rpc_url)
        wallet_private_key = read_env(source, "WALLET_PRIVATE_KEY")
        if wallet_private_key:
            self._wallet_private_key = wallet_private_key
        ethereum_http_rpc_url = read_env(source, "ETHEREUM_HTTP_RPC_URL")
        if ethereum_http_rpc_url:
            self._ethereum_http_rpc_url = ethereum_http_rpc_url
        contract_address = read_env(source, "CONTRACT_ADDRESS")
        if contract_address:
            self._contract_address = contract_address
        facilitator_url = read_env(source, "FACILITATOR_URL")
        if facilitator_url:
            self._facilitator_url = facilitator_url
        bearer_token = read_env(source, "BEARER_TOKEN")
        if bearer_token:
            self._bearer_token = bearer_token
        auth_url = read_env(source, "AUTH_URL")
        if auth_url:
            self._auth_url = auth_url
            self._auth_enabled = True
        refresh_margin = read_env(source, "AUTH_REFRESH_MARGIN_SECS")
        if refresh_margin:
            self._auth_refresh_margin_secs = refresh_margin
            self._auth_enabled = True
        return self

    def _parse_refresh_margin(self) -> int:
        value = self._auth_refresh_margin_secs
        if value is None:
            return 60
        if isinstance(value, int):
            margin = value
        else:
            try:
                margin = int(str(value).strip())
            except (TypeError, ValueError) as exc:
                raise ConfigError("invalid auth_refresh_margin_secs") from exc
        if margin < 0:
            raise ConfigError("auth_refresh_margin_secs cannot be negative")
        return margin

    def build(self) -> Config:
        if not self._wallet_private_key and self._evm_signer is None:
            raise ConfigError("missing wallet_private_key or evm_signer")
        if not self._rpc_url:
            raise ConfigError("missing rpc_url")

        try:
            rpc_url = validate_url(self._rpc_url)
            wallet_private_key = (
                normalize_private_key(self._wallet_private_key)
                if self._wallet_private_key
                else None
            )
            ethereum_http_rpc_url = (
                validate_url(self._ethereum_http_rpc_url)
                if self._ethereum_http_rpc_url
                else None
            )
            contract_address = (
                normalize_address(self._contract_address)
                if self._contract_address
                else None
            )
            facilitator_source = self._facilitator_url or self._network_facilitator_url
            facilitator_url = (
                validate_url(facilitator_source) if facilitator_source else None
            )
            auth_config = None
            if self._auth_enabled and not self._bearer_token:
                auth_url_raw = self._auth_url or self._rpc_url
                auth_config = AuthConfig(
                    auth_url=validate_url(auth_url_raw),
                    refresh_margin_secs=self._parse_refresh_margin(),
                )
        except ValidationError as exc:
            raise ConfigError(str(exc)) from exc

        return Config(
            rpc_url=rpc_url,
            wallet_private_key=wallet_private_key,
            evm_signer=self._evm_signer,
            ethereum_http_rpc_url=ethereum_http_rpc_url,
            contract_address=contract_address,
            bearer_token=self._bearer_token,
            auth=auth_config,
            facilitator_url=facilitator_url,
        )
