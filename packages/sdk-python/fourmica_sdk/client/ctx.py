"""Everything the sub-clients share: configuration, connections, and the
metadata resolved once at connect time. Port of ``sdk-rust/src/client/ctx.rs``.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

from ..auth import AuthClient, AuthSession
from ..config import Config
from ..contract import ContractGateway
from ..digest import core_domain_separator as derive_core_domain_separator
from ..digest import permit2_domain_separator
from ..errors import (
    ChainRpcUnavailableError,
    ClientError,
    ClientInitializationError,
    MissingTokenDomainSeparatorError,
)
from ..guarantee import (
    clearing_house_domain_separator,
    guarantee_registry_domain_separator,
)
from ..models import PAYMENT_PAYLOAD_VERSION, CorePublicParameters
from ..rpc import RpcProxy
from ..signing import EvmSigner, LocalAccountSigner, PayerSigner
from ..utils import (
    ValidationError,
    normalize_address,
    normalize_bytes32_hex,
    parse_address,
)
from .facilitator import Facilitator


@dataclass(frozen=True)
class ActiveCycle:
    """The settlement cycle a payment must be signed for, as core reports it."""

    id: str
    """On-chain bytes32 cycle id, 0x-prefixed hex."""
    period_start: int
    """Unix seconds; a payment stamped earlier is refused as stale."""
    period_end: int
    """Unix seconds; core opens the next cycle from this moment on."""


def _local_now_ms() -> int:
    return int(time.time() * 1000)


class ClientCtx:
    """Shared state behind a connected :class:`~fourmica_sdk.Client`."""

    def __init__(
        self,
        cfg: Config,
        rpc: RpcProxy,
        auth_session: Optional[AuthSession],
        public_params: CorePublicParameters,
        contract_address: str,
        ethereum_http_rpc_url: Optional[str],
        signer: EvmSigner,
    ) -> None:
        self.cfg = cfg
        self.rpc = rpc
        self.auth_session = auth_session
        self.public_params = public_params
        self.contract_address = contract_address
        self.chain_id = public_params.chain_id
        self.ethereum_http_rpc_url = ethereum_http_rpc_url
        # guarantee_signer is the address whose signature attests this
        # operator's guarantee receipts.
        (
            self.clearing_house_address,
            self.guarantee_registry_address,
            self.guarantee_signer,
        ) = _signing_addresses(public_params)
        #: The domain every payer-signed payload is verified under.
        self.clearing_house_domain_separator = clearing_house_domain_separator(
            self.chain_id, self.clearing_house_address
        )
        #: The domain the operator's guarantee receipts are verified under.
        self.guarantee_domain_separator = guarantee_registry_domain_separator(
            self.chain_id, self.guarantee_registry_address
        )
        self.signer = signer
        self.payer_signer = PayerSigner(signer)
        #: Facilitator that sponsors gas; unconfigured, every gasless call
        #: fails with FacilitatorNotConfiguredError and auto routes self-fund.
        self.facilitator = Facilitator(cfg.facilitator_url)
        # Prefer what core publishes (read from the contract, so right across
        # a domain change); fall back to deriving it, sound because the
        # contract fixes its domain as EIP712("Core4Mica", "1").
        if public_params.core_domain_separator:
            self.core_domain_separator = bytes.fromhex(
                public_params.core_domain_separator.removeprefix("0x")
            )
        else:
            self.core_domain_separator = derive_core_domain_separator(
                self.chain_id, contract_address
            )
        self.permit2_domain_separator = permit2_domain_separator(self.chain_id)
        self._gateway: Optional[ContractGateway] = None
        self._gateway_lock = asyncio.Lock()
        self._token_domain_separators: Dict[str, str] = {}
        self._token_domain_lock = asyncio.Lock()
        # The cycle each asset's payments are scoped to, held until its period
        # ends or core refuses a request signed against it.
        self._active_cycles: Dict[str, ActiveCycle] = {}
        # The latest checkpoint cutoff known per asset. A payment at or below
        # it can never be collected, so payments are held back past it.
        self._payment_cutoffs: Dict[str, int] = {}
        # Core's clock minus ours, in ms, taken as a lower bound: the last
        # server_time core reported against when its answer arrived.
        self._clock_offset_ms = 0

    @classmethod
    async def create(cls, cfg: Config) -> "ClientCtx":
        signer: EvmSigner
        if cfg.evm_signer is not None:
            signer = cfg.evm_signer
        elif cfg.wallet_private_key:
            signer = LocalAccountSigner(cfg.wallet_private_key)
        else:
            raise ClientInitializationError(
                "config carries neither a wallet_private_key nor an evm_signer"
            )

        rpc = RpcProxy(cfg.rpc_url)
        try:
            public_params = await rpc.get_public_params()
            cls._require_payload_version_support(public_params)
            _signing_addresses(public_params)

            contract_address = normalize_address(
                cfg.contract_address or public_params.contract_address
            )
            ethereum_http_rpc_url = (
                cfg.ethereum_http_rpc_url or public_params.ethereum_http_rpc_url or None
            )
        except BaseException:
            await rpc.aclose()
            raise

        auth_session: Optional[AuthSession] = None
        if cfg.auth is not None:
            auth_session = AuthSession(
                AuthClient(cfg.auth.auth_url),
                wallet_private_key=cfg.wallet_private_key,
                evm_signer=cfg.evm_signer,
                refresh_margin_secs=cfg.auth.refresh_margin_secs,
            )
            rpc = rpc.with_token_provider(auth_session.access_token)
        elif cfg.bearer_token:
            rpc = rpc.with_bearer_token(cfg.bearer_token)

        return cls(
            cfg=cfg,
            rpc=rpc,
            auth_session=auth_session,
            public_params=public_params,
            contract_address=contract_address,
            ethereum_http_rpc_url=ethereum_http_rpc_url,
            signer=signer,
        )

    @staticmethod
    def _require_payload_version_support(params: CorePublicParameters) -> None:
        """Refuses a core that cannot read what this client signs, rather than
        letting every payment fail later with a decode error."""
        if PAYMENT_PAYLOAD_VERSION in params.supported_payment_payload_versions:
            return
        raise ClientInitializationError(
            f"this client signs payment payload v{PAYMENT_PAYLOAD_VERSION}, which "
            "core does not accept (core accepts "
            f"{params.supported_payment_payload_versions}); upgrade core or "
            "downgrade the SDK"
        )

    @property
    def signer_address(self) -> str:
        return normalize_address(self.signer.address)

    async def active_cycle(self, asset: str) -> ActiveCycle:
        """The cycle payments for *asset* must be signed for, fetched once and
        reused until its period ends or :meth:`forget_active_cycle` drops it."""
        key = normalize_address(asset)
        cached = self._active_cycles.get(key)
        if cached is not None and self.core_now() < cached.period_end:
            return cached
        response = await self.rpc.get_active_cycle(key)
        self.record_core_time(response.server_time)
        cycle = ActiveCycle(
            id=response.cycle_id,
            period_start=response.period_start,
            period_end=response.period_end,
        )
        self._active_cycles[key] = cycle
        return cycle

    def forget_active_cycle(self, asset: str) -> None:
        """Drops the cached cycle for *asset*, so the next payment re-reads it."""
        self._active_cycles.pop(normalize_address(asset), None)

    def record_payment_cutoff(self, asset: str, cutoff: int) -> None:
        key = normalize_address(asset)
        self._payment_cutoffs[key] = max(self._payment_cutoffs.get(key, 0), int(cutoff))

    def payment_cutoff(self, asset: str) -> Optional[int]:
        return self._payment_cutoffs.get(normalize_address(asset))

    def record_core_time(self, server_time: int) -> None:
        """Learns core's clock from a ``server_time`` it just reported. Zero,
        from a core that predates it, teaches nothing."""
        if not server_time:
            return
        # The report left core before it reached us and was truncated to the
        # second, so core was at least this far ahead. Erring low is the safe
        # side: core refuses a payment stamped even a second past its clock.
        self._clock_offset_ms = int(server_time) * 1000 - _local_now_ms()

    def core_now_ms(self) -> int:
        """Core's clock as best known, in unix ms, never ahead of the real one."""
        return max(_local_now_ms() + self._clock_offset_ms, 0)

    def core_now(self) -> int:
        """Core's clock as best known, in unix seconds."""
        return self.core_now_ms() // 1000

    async def gateway(self) -> ContractGateway:
        """The transaction gateway, connected on first use so a client that
        only signs and calls the API never needs an Ethereum endpoint. The
        chain id is checked here rather than at construction."""
        if self._gateway is not None:
            return self._gateway
        async with self._gateway_lock:
            if self._gateway is not None:
                return self._gateway
            if not self.ethereum_http_rpc_url:
                raise ChainRpcUnavailableError()
            if not self.cfg.wallet_private_key:
                raise ClientError(
                    "on-chain transactions need a local wallet_private_key; "
                    "a remote evm_signer can sign requests but not transactions"
                )
            gateway = ContractGateway(
                eth_rpc_url=self.ethereum_http_rpc_url,
                private_key=self.cfg.wallet_private_key,
                contract_address=self.contract_address,
                chain_id=self.chain_id,
            )
            await gateway.verify_chain_id()
            self._gateway = gateway
            return gateway

    async def token_domain_separator(self, token: str) -> str:
        """A token's EIP-712 domain separator, memoised. Deliberately not an
        ``eth_call``: signing a gasless authorization must not require an
        Ethereum RPC endpoint. A hit never goes stale; a miss refetches in case
        a new asset has been registered."""
        checksum = normalize_address(token)
        async with self._token_domain_lock:
            cached = self._token_domain_separators.get(checksum)
            if cached is not None:
                return cached
            tokens = await self.rpc.get_supported_tokens()
            found: Optional[str] = None
            for info in tokens.tokens:
                if not info.domain_separator:
                    continue
                try:
                    address = normalize_address(info.address)
                    separator = normalize_bytes32_hex(info.domain_separator)
                except Exception:
                    continue
                self._token_domain_separators[address] = separator
                if address == checksum:
                    found = separator
            if found is None:
                raise MissingTokenDomainSeparatorError(checksum)
            return found

    async def login(self):
        if self.auth_session is None:
            raise ClientError("auth is not configured")
        return await self.auth_session.login()

    async def logout(self) -> None:
        if self.auth_session is not None:
            await self.auth_session.logout()

    async def aclose(self) -> None:
        await self.rpc.aclose()
        await self.facilitator.aclose()
        if self.auth_session is not None:
            await self.auth_session.aclose()
        if self._gateway is not None:
            await self._gateway.aclose()


def _signing_addresses(params: CorePublicParameters) -> Tuple[str, str, str]:
    """The ClearingHouse, the GuaranteeRegistry and the guarantee signer, which
    every payment is signed or verified against — so a core that omits one is
    refused at connect rather than at the first payment."""
    resolved = []
    for what, raw in (
        ("clearing house address", params.clearing_house_address),
        ("guarantee registry address", params.guarantee_registry_address),
        ("guarantee signer", params.guarantee_signer),
    ):
        try:
            resolved.append(parse_address(raw, what))
        except ValidationError as exc:
            raise ClientInitializationError(f"{what}: {exc}") from exc
    return resolved[0], resolved[1], resolved[2]
