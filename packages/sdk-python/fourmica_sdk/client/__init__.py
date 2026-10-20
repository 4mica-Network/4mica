"""Entry point to the SDK.

Each field is an intent-builder client: an entry captures what to do
(``client.deposit.of(...)``), a route pin narrows how (``.self_funded()``),
and a terminal does it (``.send()``, ``.approve()``, ``.action()``).
"""

from __future__ import annotations

from typing import Union

from ..auth import AuthTokens
from ..config import Config
from ..models import PaymentRequest, PaymentRequestPayload
from .account import AccountClient
from .ctx import ClientCtx
from .deposit import DepositClient
from .model import Asset
from .payment import PaymentClient
from .settlement import SettlementClient
from .tokens import TokensClient
from .withdraw import WithdrawClient


class Client:
    """A connected 4Mica client. Build a :class:`~fourmica_sdk.Config` with
    :class:`~fourmica_sdk.ConfigBuilder`, then ``await Client.connect(cfg)`` —
    construction reaches core for its public parameters, which is why it is
    async and fallible."""

    def __init__(self, ctx: ClientCtx) -> None:
        self._ctx = ctx
        #: Depositing collateral.
        self.deposit = DepositClient(ctx)
        #: Requesting, cancelling and finalizing withdrawals.
        self.withdraw = WithdrawClient(ctx)
        #: Signing, issuing and verifying payment guarantees.
        self.payment = PaymentClient(ctx)
        #: Settling a clearing cycle, from either side.
        self.settlement = SettlementClient(ctx)
        #: Reading the signer's own balances and positions.
        self.account = AccountClient(ctx)
        #: Supported-token metadata and ERC-20 approvals.
        self.tokens = TokensClient(ctx)

    @classmethod
    async def connect(cls, cfg: Config) -> "Client":
        return cls(await ClientCtx.create(cfg))

    @property
    def signer_address(self) -> str:
        """The address this client signs as, and therefore the account every
        deposit credits."""
        return self._ctx.signer_address

    @property
    def public_params(self):
        """Core's public parameters, as fetched at connect time."""
        return self._ctx.public_params

    async def login(self) -> AuthTokens:
        return await self._ctx.login()

    async def logout(self) -> None:
        await self._ctx.logout()

    async def new_payment(
        self, recipient: str, amount: int, asset: Union[Asset, str, None] = None
    ) -> PaymentRequestPayload:
        """A payment scoped to the live settlement cycle — half of the
        ``FlowSigner`` surface :class:`~fourmica_sdk.X402Flow` consumes."""
        return await self.payment.new_payment(recipient, amount, asset)

    async def sign_payment(self, payload: PaymentRequestPayload) -> PaymentRequest:
        """Signs a payment as the payer — the other half of ``FlowSigner``."""
        return await self.payment.sign_request(payload)

    async def aclose(self) -> None:
        await self._ctx.aclose()

    async def __aenter__(self) -> "Client":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        await self.aclose()
