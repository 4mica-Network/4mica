from __future__ import annotations

import os
from dataclasses import dataclass
from typing import TYPE_CHECKING, Mapping, Optional, Union

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

# Shells cannot ``export`` a name starting with a digit, hence ``FOURMICA_``.
_ENV_PREFIXES = ("FOURMICA_", "4MICA_")


def read_env(env: Mapping[str, str], name: str) -> Optional[str]:
    """``FOURMICA_<name>``, else the older ``4MICA_<name>``; empty counts as
    unset. Both set to different values is a :class:`ConfigError`."""
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
    wallet_private_key: Optional[str]
    evm_signer: Optional["EvmSigner"] = None
    ethereum_http_rpc_url: Optional[str] = None
    contract_address: Optional[str] = None
    bearer_token: Optional[str] = None
    auth: Optional[AuthConfig] = None
    facilitator_url: Optional[str] = None
    """Facilitator that sponsors gas. Without one, every operation is self-funded."""


class ConfigBuilder:
    """Builds a :class:`Config`; hand it to ``Client.connect``. SIWE auth is on
    by default; a bearer token replaces it."""

    def __init__(self) -> None:
        self._rpc_url: Optional[str] = DEFAULT_RPC_URL
        self._wallet_private_key: Optional[str] = None
        self._evm_signer: Optional["EvmSigner"] = None
        self._ethereum_http_rpc_url: Optional[str] = None
        self._contract_address: Optional[str] = None
        self._bearer_token: Optional[str] = None
        self._auth_enabled: bool = True
        self._auth_url: Optional[str] = None
        self._auth_refresh_margin_secs: Optional[Union[int, str]] = 60
        self._facilitator_url: Optional[str] = None
        self._network_facilitator_url: Optional[str] = None

    def rpc_url(self, value: str) -> "ConfigBuilder":
        """Set the 4Mica core API URL directly; :meth:`network` selects a hosted
        network by name instead."""
        self._rpc_url = value
        self._network_facilitator_url = None
        return self

    def network(self, value: str) -> "ConfigBuilder":
        """Select a hosted 4Mica network by shorthand (``"base"``) or CAIP-2 id
        (``"eip155:8453"``): its core API URL and, where one is hosted, its
        facilitator. Mutually exclusive with :meth:`rpc_url` — last call wins."""
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

    def wallet_private_key(self, value: str) -> "ConfigBuilder":
        self._wallet_private_key = value
        return self

    def evm_signer(self, signer: "EvmSigner") -> "ConfigBuilder":
        self._evm_signer = signer
        return self

    def ethereum_http_rpc_url(self, value: str) -> "ConfigBuilder":
        """Ethereum endpoint for on-chain reads and self-funded transactions.
        Normally unnecessary: core advertises one."""
        self._ethereum_http_rpc_url = value
        return self

    def contract_address(self, value: str) -> "ConfigBuilder":
        """Normally unnecessary: core advertises the deployment."""
        self._contract_address = value
        return self

    def facilitator_url(self, value: str) -> "ConfigBuilder":
        """Facilitator that sponsors gas. Without one, every operation is
        self-funded."""
        self._facilitator_url = value
        return self

    def bearer_token(self, value: str) -> "ConfigBuilder":
        self._bearer_token = value
        return self

    def enable_auth(self) -> "ConfigBuilder":
        self._auth_enabled = True
        return self

    def disable_auth(self) -> "ConfigBuilder":
        self._auth_enabled = False
        return self

    def auth_url(self, value: str) -> "ConfigBuilder":
        """Auth base URL for SIWE credentials. Defaults to the RPC URL."""
        self._auth_url = value
        return self

    def auth_refresh_margin_secs(self, value: int) -> "ConfigBuilder":
        self._auth_refresh_margin_secs = value
        return self

    def from_env(self, env: Optional[Mapping[str, str]] = None) -> "ConfigBuilder":
        """Load settings from ``FOURMICA_*`` variables (the older ``4MICA_``
        prefix also works): ``NETWORK`` (which wins over ``RPC_URL``),
        ``RPC_URL``, ``WALLET_PRIVATE_KEY``, ``ETHEREUM_HTTP_RPC_URL``,
        ``CONTRACT_ADDRESS``, ``FACILITATOR_URL``, ``BEARER_TOKEN``,
        ``AUTH_URL`` and ``AUTH_REFRESH_MARGIN_SECS``. Reads ``os.environ``
        unless *env* is given."""
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
