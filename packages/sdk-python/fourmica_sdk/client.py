from __future__ import annotations

from typing import Dict, List, Optional, Type, Union

from .auth import AuthClient, AuthSession, AuthTokens
from .bls_utils import signature_to_words, verify_bls_signature
from .config import Config
from .contract import ContractGateway
from .networks import resolve_public_rpc_url
from .errors import (
    AuthConfigError,
    ClientInitializationError,
    CreateTabError,
    IssuePaymentGuaranteeError,
    RecipientQueryError,
    RemunerateError,
    RpcError,
    VerifyGuaranteeError,
    VerificationError,
)
from .guarantee import decode_guarantee_claims
from .models import (
    AssetBalanceInfo,
    BLSCert,
    CollateralEventInfo,
    GuaranteeInfo,
    PaymentGuaranteeClaims,
    PaymentGuaranteeRequestClaims,
    PaymentGuaranteeRequestClaimsV2,
    PaymentSignature,
    PendingRemunerationInfo,
    RecipientPaymentInfo,
    SigningScheme,
    TabInfo,
    TabPaymentStatus,
    TxReceiptWaitOptions,
    UserInfo,
)
from .rpc import RpcProxy
from .signing import CorePublicParameters, PaymentSigner
from .utils import ValidationError, normalize_address, parse_u256


class Client:
    """Entry point that bundles both user and recipient flows."""

    def __init__(
        self,
        cfg: Config,
        rpc: RpcProxy,
        params: CorePublicParameters,
        gateway: ContractGateway,
        guarantee_domain: bytes,
        guarantee_domains: Optional[Dict[int, bytes]],
        signer: PaymentSigner,
        auth_session: Optional[AuthSession] = None,
    ) -> None:
        self.cfg = cfg
        self.rpc = rpc
        self.params = params
        self.gateway = gateway
        self.guarantee_domain = guarantee_domain
        self.guarantee_domains = dict(guarantee_domains or {})
        self._signer = signer
        self._auth_session = auth_session
        self.user = UserClient(self)
        self.recipient = RecipientClient(self)

    @classmethod
    async def new(cls, cfg: Config) -> "Client":
        rpc = RpcProxy(cfg.rpc_url)
        auth_session = None
        if cfg.bearer_token:
            rpc.with_bearer_token(cfg.bearer_token)
        elif cfg.auth is not None:
            auth_client = AuthClient(cfg.auth.auth_url)
            auth_session = AuthSession(
                auth_client,
                wallet_private_key=cfg.wallet_private_key,
                evm_signer=cfg.evm_signer,
                refresh_margin_secs=cfg.auth.refresh_margin_secs,
            )
        params = await rpc.get_public_params()
        if auth_session is not None:
            rpc.with_token_provider(auth_session.access_token)
        cls._validate_operator_public_key(params.public_key)
        gateway = cls._build_gateway(cfg, params)
        await cls._validate_chain_id(gateway, params.chain_id)
        guarantee_domain, guarantee_domains = await cls._fetch_guarantee_metadata(
            gateway, params
        )
        signer_source = cfg.evm_signer or cfg.wallet_private_key
        if signer_source is None:
            raise ClientInitializationError("missing evm_signer or wallet_private_key")
        signer = PaymentSigner(signer_source)
        return cls(
            cfg,
            rpc,
            params,
            gateway,
            guarantee_domain,
            guarantee_domains,
            signer,
            auth_session=auth_session,
        )

    @staticmethod
    def _build_gateway(cfg: Config, params: CorePublicParameters) -> ContractGateway:
        if not cfg.wallet_private_key:
            raise ClientInitializationError(
                "wallet_private_key is required to initialize ContractGateway"
            )
        eth_rpc_url = (
            cfg.ethereum_http_rpc_url
            or params.ethereum_http_rpc_url
            or resolve_public_rpc_url(f"eip155:{params.chain_id}")
        )
        contract_address = cfg.contract_address or params.contract_address
        return ContractGateway(
            eth_rpc_url,
            cfg.wallet_private_key,
            contract_address,
            params.chain_id,
        )

    @staticmethod
    async def _validate_chain_id(
        gateway: ContractGateway, expected_chain_id: int
    ) -> None:
        try:
            chain_id = await gateway.w3.eth.chain_id
            if int(chain_id) != int(expected_chain_id):
                raise ClientInitializationError(
                    f"chain id mismatch between core ({expected_chain_id}) and provider ({chain_id})"
                )
        except Exception as exc:
            raise ClientInitializationError(str(exc)) from exc

    @staticmethod
    async def _fetch_guarantee_metadata(
        gateway: ContractGateway, params: CorePublicParameters
    ) -> tuple[bytes, Dict[int, bytes]]:
        try:
            # V1 domain is always the contract's canonical guaranteeDomainSeparator —
            # matches TS SDK which reads it via gateway.getGuaranteeDomain().
            v1_domain = bytes(
                await gateway.contract.functions.guaranteeDomainSeparator().call()
            )

            if params.active_guarantee_domain_separator:
                active_domain = bytes.fromhex(
                    params.active_guarantee_domain_separator.removeprefix("0x")
                )
                guarantee_domains: Dict[int, bytes] = {
                    v: active_domain
                    for v in params.accepted_guarantee_versions_or_default()
                }
                guarantee_domains[1] = v1_domain
                return active_domain, guarantee_domains

            accepted_versions = params.accepted_guarantee_versions_or_default()
            guarantee_domains = {}

            for version in accepted_versions:
                config = await gateway.get_guarantee_version_config(version)
                if config["enabled"]:
                    guarantee_domains[int(version)] = bytes(config["domain_separator"])

            guarantee_domains[1] = v1_domain

            if params.max_accepted_guarantee_version in guarantee_domains:
                active_guarantee_domain = guarantee_domains[
                    params.max_accepted_guarantee_version
                ]
            else:
                active_guarantee_domain = v1_domain

            return bytes(active_guarantee_domain), guarantee_domains
        except Exception as exc:
            raise ClientInitializationError(
                f"failed to fetch guarantee metadata: {exc}"
            ) from exc

    @staticmethod
    def _validate_operator_public_key(public_key: bytes) -> None:
        if len(public_key) != 48:
            raise ClientInitializationError(
                "invalid operator public key length: "
                f"expected 48 bytes, got {len(public_key)}"
            )

    async def aclose(self) -> None:
        await self.rpc.aclose()
        if self._auth_session is not None:
            await self._auth_session.aclose()
        await self.gateway.aclose()

    async def login(self) -> AuthTokens:
        if self._auth_session is None:
            raise AuthConfigError("auth is not enabled for this client")
        return await self._auth_session.login()

    async def logout(self) -> None:
        if self._auth_session is None:
            raise AuthConfigError("auth is not enabled for this client")
        await self._auth_session.logout()

    async def __aenter__(self) -> "Client":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self.aclose()


class UserClient:
    def __init__(self, client: Client) -> None:
        self.client = client

    @property
    def guarantee_domain(self) -> bytes:
        return self.client.guarantee_domain

    @property
    def guarantee_domains(self) -> Dict[int, bytes]:
        return self.client.guarantee_domains

    async def approve_erc20(
        self,
        token: str,
        amount: int,
        wait_options: Optional[TxReceiptWaitOptions] = None,
    ) -> Optional[dict]:
        return await self.client.gateway.approve_erc20(token, amount, wait_options)

    async def deposit(
        self,
        amount: int,
        erc20_token: Optional[str] = None,
        wait_options: Optional[TxReceiptWaitOptions] = None,
    ) -> dict:
        return await self.client.gateway.deposit(amount, erc20_token, wait_options)

    async def get_user(self, block_number: Optional[int] = None) -> List[UserInfo]:
        assets = await self.client.gateway.get_user_assets(block_number=block_number)
        return [
            UserInfo(
                asset=a["asset"],
                collateral=parse_u256(a["collateral"]),
                withdrawal_request_amount=parse_u256(a["withdrawal_request_amount"]),
                withdrawal_request_timestamp=int(a["withdrawal_request_timestamp"]),
            )
            for a in assets
        ]

    async def get_tab_payment_status(self, tab_id: int) -> TabPaymentStatus:
        status = await self.client.gateway.get_payment_status(tab_id)
        return TabPaymentStatus.from_rpc(status)

    async def sign_payment(
        self,
        claims: Union[PaymentGuaranteeRequestClaims, PaymentGuaranteeRequestClaimsV2],
        scheme: SigningScheme = SigningScheme.EIP712,
    ) -> PaymentSignature:
        return await self.client._signer.sign_request(
            self.client.params, claims, scheme
        )

    async def list_tabs(
        self, settlement_statuses: Optional[List[str]] = None
    ) -> List[TabInfo]:
        address = normalize_address(self.client._signer.address)
        tabs = await self.client.rpc.list_user_tabs(address, settlement_statuses)
        return [TabInfo.from_rpc(t) for t in tabs]

    async def pay_tab(
        self,
        tab_id: int,
        req_id: Optional[int] = None,
        amount: Optional[int] = None,
        recipient_address: Optional[str] = None,
        erc20_token: Optional[str] = None,
        wait_options: Optional[TxReceiptWaitOptions] = None,
    ) -> dict:
        if req_id is None or amount is None or recipient_address is None:
            tab = await self.client.recipient.get_tab(tab_id)
            if not tab:
                raise ValueError(f"Tab {tab_id} not found")
            guarantee = await self.client.recipient.get_latest_guarantee(tab_id)
            if not guarantee:
                raise ValueError(f"Tab {tab_id} has no guarantee")
            remaining = (
                tab.total_amount - tab.paid_amount
                if tab.total_amount > tab.paid_amount
                else 0
            )
            if remaining == 0:
                raise ValueError(f"Tab {tab_id} is already fully paid")
            req_id = guarantee.req_id
            amount = remaining
            recipient_address = guarantee.to_address
            erc20_token = (
                guarantee.asset_address
                if guarantee.asset_address
                != "0x0000000000000000000000000000000000000000"
                else None
            )
        if erc20_token:
            return await self.client.gateway.pay_tab_erc20(
                tab_id, amount, erc20_token, recipient_address, wait_options
            )
        return await self.client.gateway.pay_tab_eth(
            tab_id, req_id, amount, recipient_address, wait_options
        )

    async def request_withdrawal(
        self,
        amount: int,
        erc20_token: Optional[str] = None,
        wait_options: Optional[TxReceiptWaitOptions] = None,
    ) -> dict:
        return await self.client.gateway.request_withdrawal(
            amount, erc20_token, wait_options
        )

    async def cancel_withdrawal(
        self,
        erc20_token: Optional[str] = None,
        wait_options: Optional[TxReceiptWaitOptions] = None,
    ) -> dict:
        return await self.client.gateway.cancel_withdrawal(erc20_token, wait_options)

    async def finalize_withdrawal(
        self,
        erc20_token: Optional[str] = None,
        wait_options: Optional[TxReceiptWaitOptions] = None,
    ) -> dict:
        return await self.client.gateway.finalize_withdrawal(erc20_token, wait_options)


class RecipientClient:
    def __init__(self, client: Client) -> None:
        self.client = client

    @property
    def _recipient_address(self) -> str:
        return normalize_address(self.client._signer.address)

    @property
    def guarantee_domain(self) -> bytes:
        return self.client.guarantee_domain

    @property
    def guarantee_domains(self) -> Dict[int, bytes]:
        return self.client.guarantee_domains

    def _check_signer(self, expected: str, error_cls: Type[Exception]) -> None:
        try:
            expected_address = normalize_address(expected)
        except ValidationError as exc:
            raise error_cls(f"invalid recipient address: {exc}") from exc
        if expected_address != self._recipient_address:
            raise error_cls("signer address does not match recipient address")

    async def create_tab(
        self,
        user_address: str,
        recipient_address: str,
        erc20_token: Optional[str],
        ttl: Optional[int],
        guarantee_version: int = 1,
    ) -> tuple[int, str, int]:
        """Create a payment tab.

        Returns:
            (tab_id, asset_address, next_req_id)
        """
        self._check_signer(recipient_address, CreateTabError)
        body = {
            "user_address": user_address,
            "recipient_address": recipient_address,
            "erc20_token": erc20_token,
            "ttl": ttl,
            "guarantee_version": int(guarantee_version),
        }
        try:
            result = await self.client.rpc.create_payment_tab(body)
        except RpcError as exc:
            raise CreateTabError(str(exc), status_code=exc.status_code) from exc
        tab_id = parse_u256(
            result.get("id") or result.get("tab_id") or result.get("tabId") or 0
        )
        erc20_raw = result.get("erc20_token") or result.get("erc20Token")
        asset_address = (
            normalize_address(erc20_raw)
            if erc20_raw
            else "0x0000000000000000000000000000000000000000"
        )
        next_req_id = parse_u256(
            result.get("next_req_id") or result.get("nextReqId") or 0
        )
        return tab_id, asset_address, next_req_id

    async def get_tab_payment_status(self, tab_id: int) -> TabPaymentStatus:
        status = await self.client.gateway.get_payment_status(tab_id)
        return TabPaymentStatus.from_rpc(status)

    async def issue_payment_guarantee(
        self,
        claims: Union[PaymentGuaranteeRequestClaims, PaymentGuaranteeRequestClaimsV2],
        signature: str,
        scheme: SigningScheme,
    ) -> BLSCert:
        self._check_signer(claims.recipient_address, IssuePaymentGuaranteeError)
        payload = {
            "claims": claims.to_payload(),
            "signature": signature,
            "scheme": scheme.value,
        }
        try:
            cert = await self.client.rpc.issue_guarantee(payload)
        except RpcError as exc:
            raise IssuePaymentGuaranteeError(
                str(exc), status_code=exc.status_code
            ) from exc
        return BLSCert(claims=cert["claims"], signature=cert["signature"])

    def verify_payment_guarantee(self, cert: BLSCert) -> PaymentGuaranteeClaims:
        try:
            claims_bytes = bytes.fromhex(cert.claims.removeprefix("0x"))
        except (ValueError, AttributeError, TypeError) as exc:
            raise VerifyGuaranteeError(
                "invalid BLS certificate claims encoding"
            ) from exc

        operator_public_key = bytes(self.client.params.public_key)

        if not verify_bls_signature(operator_public_key, claims_bytes, cert.signature):
            raise VerifyGuaranteeError("certificate signature mismatch")

        claims = decode_guarantee_claims(claims_bytes)
        expected_domain = self.guarantee_domains.get(claims.version)
        if expected_domain is None:
            if claims.version == 1:
                expected_domain = self.guarantee_domain
            else:
                raise VerifyGuaranteeError(
                    f"unsupported guarantee claims version: {claims.version}"
                )
        if claims.domain != expected_domain:
            raise VerifyGuaranteeError("guarantee domain mismatch")
        return claims

    async def remunerate(
        self,
        cert: BLSCert,
        wait_options: Optional[TxReceiptWaitOptions] = None,
    ) -> dict:
        try:
            self.verify_payment_guarantee(cert)
        except VerifyGuaranteeError as exc:
            raise RemunerateError(str(exc)) from exc
        try:
            sig_words = signature_to_words(cert.signature)
            claims_bytes = bytes.fromhex(cert.claims.removeprefix("0x"))
        except VerificationError as exc:
            raise RemunerateError(str(exc)) from exc
        return await self.client.gateway.remunerate(
            claims_bytes, sig_words, wait_options
        )

    async def list_settled_tabs(self) -> List[TabInfo]:
        try:
            tabs = await self.client.rpc.list_settled_tabs(self._recipient_address)
        except RpcError as exc:
            raise RecipientQueryError(str(exc), status_code=exc.status_code) from exc
        return [TabInfo.from_rpc(tab) for tab in tabs]

    async def list_pending_remunerations(self) -> List[PendingRemunerationInfo]:
        try:
            items = await self.client.rpc.list_pending_remunerations(
                self._recipient_address
            )
        except RpcError as exc:
            raise RecipientQueryError(str(exc), status_code=exc.status_code) from exc
        return [PendingRemunerationInfo.from_rpc(item) for item in items]

    async def get_tab(self, tab_id: int) -> Optional[TabInfo]:
        try:
            result = await self.client.rpc.get_tab(tab_id)
        except RpcError as exc:
            raise RecipientQueryError(str(exc), status_code=exc.status_code) from exc
        return TabInfo.from_rpc(result) if result else None

    async def list_recipient_tabs(
        self, settlement_statuses: Optional[List[str]] = None
    ) -> List[TabInfo]:
        try:
            tabs = await self.client.rpc.list_recipient_tabs(
                self._recipient_address, settlement_statuses
            )
        except RpcError as exc:
            raise RecipientQueryError(str(exc), status_code=exc.status_code) from exc
        return [TabInfo.from_rpc(tab) for tab in tabs]

    async def get_tab_guarantees(self, tab_id: int) -> List[GuaranteeInfo]:
        try:
            guarantees = await self.client.rpc.get_tab_guarantees(tab_id)
        except RpcError as exc:
            raise RecipientQueryError(str(exc), status_code=exc.status_code) from exc
        return [GuaranteeInfo.from_rpc(g) for g in guarantees]

    async def get_latest_guarantee(self, tab_id: int) -> Optional[GuaranteeInfo]:
        try:
            result = await self.client.rpc.get_latest_guarantee(tab_id)
        except RpcError as exc:
            raise RecipientQueryError(str(exc), status_code=exc.status_code) from exc
        return GuaranteeInfo.from_rpc(result) if result else None

    async def get_guarantee(self, tab_id: int, req_id: int) -> Optional[GuaranteeInfo]:
        try:
            result = await self.client.rpc.get_guarantee(tab_id, req_id)
        except RpcError as exc:
            raise RecipientQueryError(str(exc), status_code=exc.status_code) from exc
        return GuaranteeInfo.from_rpc(result) if result else None

    async def list_recipient_payments(self) -> List[RecipientPaymentInfo]:
        try:
            payments = await self.client.rpc.list_recipient_payments(
                self._recipient_address
            )
        except RpcError as exc:
            raise RecipientQueryError(str(exc), status_code=exc.status_code) from exc
        return [RecipientPaymentInfo.from_rpc(p) for p in payments]

    async def get_collateral_events_for_tab(
        self, tab_id: int
    ) -> List[CollateralEventInfo]:
        try:
            events = await self.client.rpc.get_collateral_events_for_tab(tab_id)
        except RpcError as exc:
            raise RecipientQueryError(str(exc), status_code=exc.status_code) from exc
        return [CollateralEventInfo.from_rpc(ev) for ev in events]

    async def get_user_asset_balance(
        self, user_address: str, asset_address: str
    ) -> Optional[AssetBalanceInfo]:
        try:
            balance = await self.client.rpc.get_user_asset_balance(
                user_address, asset_address
            )
        except RpcError as exc:
            raise RecipientQueryError(str(exc), status_code=exc.status_code) from exc
        return AssetBalanceInfo.from_rpc(balance) if balance else None
