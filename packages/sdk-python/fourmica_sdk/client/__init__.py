from __future__ import annotations

from ..auth import AuthTokens
from ..config import Config
from ..models import CorePublicParameters, PaymentRequest, PaymentRequestPayload
from ..rpc import RpcProxy
from .account import AccountClient
from .ctx import ClientCtx
from .deposit import DepositClient
from .model import Asset
from .payment import PaymentClient
from .settlement import SettlementClient
from .tokens import TokensClient
from .withdraw import WithdrawClient


class Client:
    """Build with ``await Client.connect(cfg)``; connecting fetches core's
    public parameters."""

    def __init__(self, ctx: ClientCtx) -> None:
        self._ctx = ctx
        self.deposit = DepositClient(ctx)
        self.withdraw = WithdrawClient(ctx)
        self.payment = PaymentClient(ctx)
        self.settlement = SettlementClient(ctx)
        self.account = AccountClient(ctx)
        self.tokens = TokensClient(ctx)

    @classmethod
    async def connect(cls, cfg: Config) -> Client:
        return cls(await ClientCtx.create(cfg))

    @property
    def ctx(self) -> ClientCtx:
        return self._ctx

    @property
    def rpc(self) -> RpcProxy:
        return self._ctx.rpc

    @property
    def signer_address(self) -> str:
        """The address this client signs as, and the account every deposit
        credits."""
        return self._ctx.signer_address

    @property
    def public_params(self) -> CorePublicParameters:
        return self._ctx.public_params

    async def login(self) -> AuthTokens:
        return await self._ctx.login()

    async def logout(self) -> None:
        await self._ctx.logout()

    async def new_payment(
        self, recipient: str, amount: int, asset: Asset | str | None = None
    ) -> PaymentRequestPayload:
        return await self.payment.new_payment(recipient, amount, asset)

    async def sign_payment(self, payload: PaymentRequestPayload) -> PaymentRequest:
        return await self.payment.sign_request(payload)

    async def aclose(self) -> None:
        await self._ctx.aclose()

    async def __aenter__(self) -> Client:
        return self

    async def __aexit__(self, *_: object) -> None:
        await self.aclose()
