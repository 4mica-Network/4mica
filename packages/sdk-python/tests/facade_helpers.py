from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

from fourmica_sdk.amounts import Token
from fourmica_sdk.client.model import DepositReceipt, Route, TokenRoute, WithdrawReceipt
from fourmica_sdk.facade.session import NetworkSession
from fourmica_sdk.models import PaymentRequest, PaymentRequestPayload
from fourmica_sdk.networks import NETWORKS

USER = "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A"
SELLER = "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
USDC = "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f"
USDT = "0x0a215D8ba66387DCA84B284D18c3B4ec3de6E54a"
TX_HASH = "0x" + "ab" * 32
KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

TOKENS = [
    Token(symbol="USDC", address=USDC, decimals=6),
    Token(symbol="USDT", address=USDT, decimals=6),
]


def fake_gateway(**overrides):
    gateway = SimpleNamespace(
        erc20_balance=AsyncMock(return_value=100_000_000),
        native_balance=AsyncMock(return_value=10**18),
        withdrawal_grace_period=AsyncMock(return_value=3600),
    )
    for name, value in overrides.items():
        setattr(gateway, name, value)
    return gateway


def fake_builder(route: TokenRoute = TokenRoute.EIP3009):
    def receipt(taken: TokenRoute) -> DepositReceipt:
        return DepositReceipt(
            tx_hash=TX_HASH, route=taken, account=USER, asset=USDC, amount=0
        )

    self_funded = SimpleNamespace(
        approve=AsyncMock(return_value=None),
        send=AsyncMock(return_value=receipt(TokenRoute.SELF_FUNDED)),
    )
    return SimpleNamespace(
        send=AsyncMock(return_value=receipt(route)),
        self_funded=MagicMock(return_value=self_funded),
        self_funded_builder=self_funded,
    )


class FakeClient:
    def __init__(
        self,
        chain_id: int = 84532,
        tokens: list[Token] | None = None,
        gateway=None,
        builder=None,
        totals: list[int | None] | None = None,
        positions: list | None = None,
        private_key: str | None = KEY,
        gasless: bool = True,
    ) -> None:
        self.signer_address = USER
        self.public_params = SimpleNamespace(chain_id=chain_id)
        self.gateway = gateway or fake_gateway()
        self.builder = builder or fake_builder()
        self._totals = list(totals) if totals is not None else [0]
        self.ctx = SimpleNamespace(
            cfg=SimpleNamespace(wallet_private_key=private_key),
            gateway=AsyncMock(return_value=self.gateway),
        )
        self.account = SimpleNamespace(
            asset_balance=AsyncMock(side_effect=self._asset_balance),
            assets=AsyncMock(return_value=positions or []),
        )
        self.tokens = SimpleNamespace(
            supported=AsyncMock(
                return_value=SimpleNamespace(
                    tokens=TOKENS if tokens is None else tokens
                )
            )
        )
        self.deposit = SimpleNamespace(
            of=MagicMock(return_value=self.builder),
            is_gasless_available=MagicMock(return_value=gasless),
        )
        withdrawn = WithdrawReceipt(
            tx_hash=TX_HASH, route=Route.GASLESS, account=USER, asset=USDC
        )
        self.withdraw = SimpleNamespace(
            **{
                step: MagicMock(
                    return_value=SimpleNamespace(send=AsyncMock(return_value=withdrawn))
                )
                for step in ("request", "cancel", "finalize")
            }
        )
        self.settlement = SimpleNamespace(
            positions=AsyncMock(return_value=[]), pay=MagicMock(), claim=MagicMock()
        )
        self.new_payment = AsyncMock(side_effect=self._new_payment)
        self.sign_payment = AsyncMock(side_effect=self._sign_payment)
        self.aclose = AsyncMock(return_value=None)

    async def _asset_balance(self, asset):
        total = self._totals.pop(0) if len(self._totals) > 1 else self._totals[0]
        return None if total is None else SimpleNamespace(total=total, locked=0)

    async def _new_payment(self, recipient, amount, asset):
        return PaymentRequestPayload.new(
            user_address=USER,
            recipient_address=recipient,
            cycle_id="0x" + "11" * 32,
            req_id=7,
            amount=amount,
            timestamp=1_700_000_000,
            erc20_token=asset.erc20_token,
        )

    async def _sign_payment(self, payload):
        return PaymentRequest(payload=payload, signature="0x" + "11" * 65)


def fake_session(
    client: FakeClient | None = None, name: str = "base-sepolia"
) -> NetworkSession:
    info = NETWORKS[name]
    return NetworkSession(name, info.caip2, info, client or FakeClient())
