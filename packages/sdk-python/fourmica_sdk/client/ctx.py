"""Everything the sub-clients share: configuration, connections, and the
metadata resolved once at connect time. Port of ``sdk-rust/src/client/ctx.rs``.
"""

from __future__ import annotations

import asyncio
from typing import Dict, Optional

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
from ..models import GUARANTEE_CLAIMS_VERSION, CorePublicParameters
from ..rpc import RpcProxy
from ..signing import EvmSigner, LocalAccountSigner, PaymentSigner
from ..utils import normalize_address, normalize_bytes32_hex
from .facilitator import Facilitator

_BLS_G1_COMPRESSED_BYTES = 48


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
        guarantee_domain: bytes,
        guarantee_domains: Dict[int, bytes],
        signer: EvmSigner,
    ) -> None:
        self.cfg = cfg
        self.rpc = rpc
        self.auth_session = auth_session
        self.public_params = public_params
        self.contract_address = contract_address
        self.chain_id = public_params.chain_id
        self.operator_public_key = public_params.public_key
        self.ethereum_http_rpc_url = ethereum_http_rpc_url
        self.guarantee_domain = guarantee_domain
        self.guarantee_domains = guarantee_domains
        self.signer = signer
        self.payment_signer = PaymentSigner(signer)
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

            if len(public_params.public_key) != _BLS_G1_COMPRESSED_BYTES:
                raise ClientInitializationError(
                    "invalid operator public key: expected "
                    f"{_BLS_G1_COMPRESSED_BYTES} bytes, got "
                    f"{len(public_params.public_key)}"
                )

            contract_address = normalize_address(
                cfg.contract_address or public_params.contract_address
            )
            ethereum_http_rpc_url = (
                cfg.ethereum_http_rpc_url or public_params.ethereum_http_rpc_url or None
            )

            guarantee_domain, guarantee_domains = await cls._fetch_guarantee_metadata(
                public_params, contract_address, ethereum_http_rpc_url
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
            guarantee_domain=guarantee_domain,
            guarantee_domains=guarantee_domains,
            signer=signer,
        )

    @staticmethod
    async def _fetch_guarantee_metadata(
        public_params: CorePublicParameters,
        contract_address: str,
        ethereum_http_rpc_url: Optional[str],
    ) -> tuple[bytes, Dict[int, bytes]]:
        """The domain separator for every guarantee version this deployment
        supports, so certs can be verified whichever version issued them.
        Requests are always signed at ``GUARANTEE_CLAIMS_VERSION``, so that one
        must be supported and enabled.

        Takes what core publishes and reads the contract only when core
        publishes nothing — the one path here that needs an Ethereum endpoint.
        """
        if GUARANTEE_CLAIMS_VERSION not in public_params.supported_guarantee_versions:
            raise ClientInitializationError(
                f"this client signs guarantee v{GUARANTEE_CLAIMS_VERSION}, which "
                f"core does not support (core supports "
                f"{public_params.supported_guarantee_versions}); upgrade core or "
                "downgrade the SDK"
            )

        domains: Dict[int, bytes] = {}
        if public_params.guarantee_domains:
            for entry in public_params.guarantee_domains:
                domains[entry.version] = bytes.fromhex(
                    entry.domain_separator.removeprefix("0x")
                )
        else:
            domains = await ClientCtx._read_guarantee_domains(
                public_params, contract_address, ethereum_http_rpc_url
            )

        guarantee_domain = domains.get(GUARANTEE_CLAIMS_VERSION)
        if guarantee_domain is None:
            raise ClientInitializationError(
                f"missing guarantee domain metadata for v{GUARANTEE_CLAIMS_VERSION}"
            )
        return guarantee_domain, domains

    @staticmethod
    async def _read_guarantee_domains(
        public_params: CorePublicParameters,
        contract_address: str,
        ethereum_http_rpc_url: Optional[str],
    ) -> Dict[int, bytes]:
        """Reads each supported version's domain off the contract, one call
        apiece — the fallback for a core too old to publish them."""
        from ..contract import AsyncHTTPProvider, AsyncWeb3
        from ..ssl_utils import get_web3_ssl_context
        from ..utils import load_abi

        if not ethereum_http_rpc_url:
            raise ChainRpcUnavailableError()

        ssl_context = get_web3_ssl_context()
        request_kwargs = {"ssl": ssl_context} if ssl_context is not None else {}
        w3 = AsyncWeb3(
            AsyncHTTPProvider(ethereum_http_rpc_url, request_kwargs=request_kwargs)
        )
        contract = w3.eth.contract(
            address=contract_address, abi=load_abi("core4mica.json")
        )

        expected = (
            normalize_bytes32_hex(public_params.guarantee_domain_separator)
            if public_params.guarantee_domain_separator
            else None
        )

        domains: Dict[int, bytes] = {}
        try:
            for version in public_params.supported_guarantee_versions:
                result = await contract.functions.getGuaranteeVersionConfig(
                    int(version)
                ).call()
                if isinstance(result, dict):
                    domain = bytes(result.get("domainSeparator"))
                    enabled = bool(result.get("enabled"))
                else:
                    domain = bytes(result[1])
                    enabled = bool(result[3])

                if not enabled:
                    if version == GUARANTEE_CLAIMS_VERSION:
                        raise ClientInitializationError(
                            f"guarantee v{GUARANTEE_CLAIMS_VERSION} is disabled on-chain"
                        )
                    continue
                domains[version] = domain

                if (
                    version == GUARANTEE_CLAIMS_VERSION
                    and expected is not None
                    and expected != "0x" + domain.hex()
                ):
                    raise ClientInitializationError(
                        "guarantee domain mismatch between core metadata and "
                        f"contract for version {version}"
                    )
        except ClientError:
            raise
        except Exception as exc:
            raise ClientInitializationError(str(exc)) from exc
        finally:
            provider = getattr(w3, "provider", None)
            disconnect = getattr(provider, "disconnect", None)
            if callable(disconnect):
                result = disconnect()
                if hasattr(result, "__await__"):
                    await result

        return domains

    @property
    def signer_address(self) -> str:
        return normalize_address(self.signer.address)

    def guarantee_domain_for_version(self, version: int) -> Optional[bytes]:
        return self.guarantee_domains.get(int(version))

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
