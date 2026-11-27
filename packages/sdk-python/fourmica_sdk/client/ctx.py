from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass

from ..auth import AuthClient, AuthSession, AuthTokens
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
    id: str
    period_start: int
    period_end: int


def _local_now_ms() -> int:
    return int(time.time() * 1000)


class ClientCtx:
    def __init__(
        self,
        cfg: Config,
        rpc: RpcProxy,
        auth_session: AuthSession | None,
        public_params: CorePublicParameters,
        contract_address: str,
        ethereum_http_rpc_url: str | None,
        signer: EvmSigner,
    ) -> None:
        self.cfg = cfg
        self.rpc = rpc
        self.auth_session = auth_session
        self.public_params = public_params
        self.contract_address = contract_address
        self.chain_id = public_params.chain_id
        self.ethereum_http_rpc_url = ethereum_http_rpc_url
        (
            self.clearing_house_address,
            self.guarantee_registry_address,
            self.guarantee_signer,
        ) = _signing_addresses(public_params)
        self.clearing_house_domain_separator = clearing_house_domain_separator(
            self.chain_id, self.clearing_house_address
        )
        self.guarantee_domain_separator = guarantee_registry_domain_separator(
            self.chain_id, self.guarantee_registry_address
        )
        self.signer = signer
        self.payer_signer = PayerSigner(signer)
        self.facilitator = Facilitator(cfg.facilitator_url)
        if public_params.core_domain_separator:
            self.core_domain_separator = bytes.fromhex(
                public_params.core_domain_separator.removeprefix("0x")
            )
        else:
            self.core_domain_separator = derive_core_domain_separator(
                self.chain_id, contract_address
            )
        self.permit2_domain_separator = permit2_domain_separator(self.chain_id)
        self._gateway: ContractGateway | None = None
        self._gateway_lock = asyncio.Lock()
        self._token_domain_separators: dict[str, str] = {}
        self._token_domain_lock = asyncio.Lock()
        self._active_cycles: dict[str, ActiveCycle] = {}
        self._payment_cutoffs: dict[str, int] = {}
        self._clock_offset_ms = 0

    @classmethod
    async def create(cls, cfg: Config) -> ClientCtx:
        signer: EvmSigner
        if cfg.evm_signer is not None:
            signer = cfg.evm_signer
            if cfg.wallet_private_key:
                local = LocalAccountSigner(cfg.wallet_private_key).address
                if normalize_address(local) != normalize_address(signer.address):
                    raise ClientInitializationError(
                        f"wallet_private_key is {local} but evm_signer is "
                        f"{signer.address}: payments would be signed by one and "
                        "transactions sent by the other; configure one account"
                    )
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

        auth_session: AuthSession | None = None
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
        self._active_cycles.pop(normalize_address(asset), None)

    def record_payment_cutoff(self, asset: str, cutoff: int) -> None:
        key = normalize_address(asset)
        self._payment_cutoffs[key] = max(self._payment_cutoffs.get(key, 0), int(cutoff))

    def payment_cutoff(self, asset: str) -> int | None:
        return self._payment_cutoffs.get(normalize_address(asset))

    def record_core_time(self, server_time: int) -> None:
        if not server_time:
            return
        # Erring low: core refuses a payment stamped even a second past its clock.
        self._clock_offset_ms = int(server_time) * 1000 - _local_now_ms()

    def core_now_ms(self) -> int:
        return max(_local_now_ms() + self._clock_offset_ms, 0)

    def core_now(self) -> int:
        return self.core_now_ms() // 1000

    async def gateway(self) -> ContractGateway:
        existing = self._gateway
        if existing is not None:
            return existing
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
        checksum = normalize_address(token)
        async with self._token_domain_lock:
            cached = self._token_domain_separators.get(checksum)
            if cached is not None:
                return cached
            tokens = await self.rpc.get_supported_tokens()
            found: str | None = None
            for info in tokens.tokens:
                if not info.domain_separator:
                    continue
                try:
                    address = normalize_address(info.address)
                    separator = normalize_bytes32_hex(info.domain_separator)
                except ValidationError:
                    continue
                self._token_domain_separators[address] = separator
                if address == checksum:
                    found = separator
            if found is None:
                raise MissingTokenDomainSeparatorError(checksum)
            return found

    async def login(self) -> AuthTokens:
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


def _signing_address(what: str, raw: str) -> str:
    try:
        return parse_address(raw, what)
    except ValidationError as exc:
        raise ClientInitializationError(f"{what}: {exc}") from exc


def _signing_addresses(params: CorePublicParameters) -> tuple[str, str, str]:
    return (
        _signing_address("clearing house address", params.clearing_house_address),
        _signing_address(
            "guarantee registry address", params.guarantee_registry_address
        ),
        _signing_address("guarantee signer", params.guarantee_signer),
    )
