from __future__ import annotations

from typing import Any

from ..authorizations import Eip2612Permit, Permit2Authorization, ReceiveAuthorization
from ..errors import (
    AmountZeroError,
    Erc20AllowanceRequiredError,
    InvalidParamsError,
    MissingTokenDomainSeparatorError,
    OutcomeUnknownError,
    Permit2AllowanceRequiredError,
)
from ..models import TxReceiptWaitOptions
from . import sig
from .ctx import ClientCtx
from .facilitator import (
    confirm_facilitator_echo,
    refuses_the_authorization,
    rejection_error,
)
from .model import Asset, DepositReceipt, TokenRoute, base_units


class DepositClient:
    def __init__(self, ctx: ClientCtx) -> None:
        self._ctx = ctx

    def is_gasless_available(self) -> bool:
        return self._ctx.facilitator.is_configured()

    def of(self, asset: Asset | str | None, amount: int) -> DepositBuilder:
        """*amount* in base units; *asset* ``None`` for native ETH. Nothing is
        sent until a terminal runs."""
        return DepositBuilder(self._ctx, Asset.coerce(asset), base_units(amount))


class _DepositBase:
    def __init__(self, ctx: ClientCtx, asset: Asset, amount: int) -> None:
        if amount <= 0:
            raise AmountZeroError("deposit amount must be positive")
        self._ctx = ctx
        self._asset = asset
        self._amount = amount

    def _erc20_token(self) -> str:
        if self._asset.is_native:
            raise InvalidParamsError(
                "native ETH has no gasless route; deposit it self-funded"
            )
        return self._asset.address


class DepositBuilder(_DepositBase):
    def gasless(self) -> GaslessDeposit:
        """EIP-3009, then Permit2 with the approval sponsored; never
        self-funded."""
        return GaslessDeposit(self._ctx, self._asset, self._amount)

    def eip3009(self) -> Eip3009Deposit:
        return Eip3009Deposit(self._ctx, self._asset, self._amount)

    def permit2(self) -> Permit2Deposit:
        return Permit2Deposit(self._ctx, self._asset, self._amount)

    def self_funded(self) -> SelfFundedDeposit:
        return SelfFundedDeposit(self._ctx, self._asset, self._amount)

    async def send(
        self, wait_options: TxReceiptWaitOptions | None = None
    ) -> DepositReceipt:
        """Cheapest route first: EIP-3009, then Permit2 with the approval
        sponsored, then the payer's own transaction."""
        if self._asset.is_native or not self._ctx.facilitator.is_configured():
            return await self.self_funded().send(wait_options)
        token = self._asset.address

        # Only a rejection reveals whether a token implements EIP-3009.
        try:
            return await _send_eip3009(self._ctx, token, self._amount)
        except Exception as rejection:
            if not refuses_the_authorization(rejection):
                raise

        try:
            return await _send_sponsored_permit2(self._ctx, token, self._amount)
        except Permit2AllowanceRequiredError:
            return await _fallback_to_self_funded(
                self._ctx, token, self._amount, wait_options
            )


class GaslessDeposit(_DepositBase):
    async def send(self) -> DepositReceipt:
        """Never falls back to the payer's own transaction."""
        token = self._erc20_token()
        try:
            return await _send_eip3009(self._ctx, token, self._amount)
        except Exception as rejection:
            if not refuses_the_authorization(rejection):
                raise
        return await _send_sponsored_permit2(self._ctx, token, self._amount)


class Eip3009Deposit(_DepositBase):
    async def sign(self) -> ReceiveAuthorization:
        """Signs without submitting. Redeem with
        ``deposit.of(asset, amount).eip3009().authorization(auth).send()``."""
        return await sig.eip3009_authorization(
            self._ctx, self._erc20_token(), self._amount
        )

    def authorization(
        self, authorization: ReceiveAuthorization
    ) -> AuthorizedEip3009Deposit:
        return AuthorizedEip3009Deposit(
            self._ctx, self._asset, self._amount, authorization
        )

    async def send(self) -> DepositReceipt:
        """Needs a token implementing EIP-3009 (USDC and similar); for anything
        else pin ``permit2()``."""
        return await _send_eip3009(self._ctx, self._erc20_token(), self._amount)


class Permit2Deposit(_DepositBase):
    def sponsor_approval(self) -> SponsoredPermit2Deposit:
        """Signs the missing Permit2 approval (EIP-2612) instead of failing on it."""
        return SponsoredPermit2Deposit(self._ctx, self._asset, self._amount)

    async def sign(self) -> Permit2Authorization:
        return await sig.permit2_authorization(
            self._ctx, self._erc20_token(), self._amount
        )

    def authorization(
        self, authorization: Permit2Authorization
    ) -> AuthorizedPermit2Deposit:
        return AuthorizedPermit2Deposit(
            self._ctx, self._asset, self._amount, authorization
        )

    async def send(self) -> DepositReceipt:
        """Without the payer's one-time ``approve(PERMIT2, ...)`` this raises
        Permit2AllowanceRequiredError; ``sponsor_approval()`` signs it instead."""
        token = self._erc20_token()
        authorization = await sig.permit2_authorization(self._ctx, token, self._amount)
        return await _submit(
            self._ctx,
            _permit2_request(token, self._amount, authorization, None),
            TokenRoute.PERMIT2,
            authorization.from_address,
            token,
            self._amount,
        )


class SponsoredPermit2Deposit(_DepositBase):
    async def send(self) -> DepositReceipt:
        """Raises Permit2AllowanceRequiredError for tokens with no EIP-2612
        surface."""
        return await _send_sponsored_permit2(
            self._ctx, self._erc20_token(), self._amount
        )


class AuthorizedEip3009Deposit(_DepositBase):
    def __init__(
        self, ctx: ClientCtx, asset: Asset, amount: int, auth: ReceiveAuthorization
    ) -> None:
        super().__init__(ctx, asset, amount)
        self._auth = auth

    async def verify(self) -> None:
        """Runs every check a submission would, spending no gas."""
        await _verify(
            self._ctx,
            _eip3009_request(self._erc20_token(), self._amount, self._auth),
        )

    async def send(self) -> DepositReceipt:
        token = self._erc20_token()
        return await _submit(
            self._ctx,
            _eip3009_request(token, self._amount, self._auth),
            TokenRoute.EIP3009,
            self._auth.from_address,
            token,
            self._amount,
        )


class AuthorizedPermit2Deposit(_DepositBase):
    def __init__(
        self, ctx: ClientCtx, asset: Asset, amount: int, auth: Permit2Authorization
    ) -> None:
        super().__init__(ctx, asset, amount)
        self._auth = auth

    async def verify(self) -> None:
        """Runs every check a submission would, spending no gas."""
        await _verify(
            self._ctx,
            _permit2_request(self._erc20_token(), self._amount, self._auth, None),
        )

    async def send(self) -> DepositReceipt:
        token = self._erc20_token()
        return await _submit(
            self._ctx,
            _permit2_request(token, self._amount, self._auth, None),
            TokenRoute.PERMIT2,
            self._auth.from_address,
            token,
            self._amount,
        )


class SelfFundedDeposit(_DepositBase):
    async def approve(
        self, wait_options: TxReceiptWaitOptions | None = None
    ) -> dict[str, Any] | None:
        """``None`` when the standing allowance already covers the deposit."""
        if self._asset.is_native:
            raise InvalidParamsError(
                "a native deposit needs no approval; its value rides with the "
                "transaction"
            )
        gateway = await self._ctx.gateway()
        return await gateway.approve_erc20(
            self._asset.address, self._amount, wait_options=wait_options
        )

    async def send(
        self, wait_options: TxReceiptWaitOptions | None = None
    ) -> DepositReceipt:
        """ERC-20 deposits need :meth:`approve` first."""
        gateway = await self._ctx.gateway()
        receipt = await gateway.deposit(
            self._amount, self._asset.erc20_token, wait_options=wait_options
        )
        return DepositReceipt(
            tx_hash=receipt["transactionHash"],
            route=TokenRoute.SELF_FUNDED,
            account=self._ctx.signer_address,
            asset=self._asset.address,
            amount=self._amount,
            raw=receipt,
        )


async def _send_eip3009(ctx: ClientCtx, token: str, amount: int) -> DepositReceipt:
    authorization = await sig.eip3009_authorization(ctx, token, amount)
    return await _submit(
        ctx,
        _eip3009_request(token, amount, authorization),
        TokenRoute.EIP3009,
        authorization.from_address,
        token,
        amount,
    )


async def _send_sponsored_permit2(
    ctx: ClientCtx, token: str, amount: int
) -> DepositReceipt:
    authorization = await sig.permit2_authorization(ctx, token, amount)
    try:
        return await _submit(
            ctx,
            _permit2_request(token, amount, authorization, None),
            TokenRoute.PERMIT2,
            authorization.from_address,
            token,
            amount,
        )
    except Permit2AllowanceRequiredError as rejection:
        if rejection.eip2612_nonce is None:
            raise

        try:
            permit = await sig.eip2612_permit(ctx, token, rejection.eip2612_nonce)
        except MissingTokenDomainSeparatorError:
            raise Permit2AllowanceRequiredError(str(rejection), None) from None

        return await _submit(
            ctx,
            _permit2_request(token, amount, authorization, permit),
            TokenRoute.SPONSORED_PERMIT2,
            authorization.from_address,
            token,
            amount,
        )


async def _fallback_to_self_funded(
    ctx: ClientCtx,
    token: str,
    amount: int,
    wait_options: TxReceiptWaitOptions | None,
) -> DepositReceipt:
    gateway = await ctx.gateway()
    allowance = await gateway.erc20_allowance(token, ctx.contract_address)
    if allowance < amount:
        raise Erc20AllowanceRequiredError(
            token=token,
            spender=ctx.contract_address,
            allowance=allowance,
            needed=amount,
        )
    receipt = await gateway.deposit(amount, token, wait_options=wait_options)
    return DepositReceipt(
        tx_hash=receipt["transactionHash"],
        route=TokenRoute.SELF_FUNDED,
        account=ctx.signer_address,
        asset=token,
        amount=amount,
        raw=receipt,
    )


def _eip3009_request(
    token: str, amount: int, authorization: ReceiveAuthorization
) -> dict[str, Any]:
    return {
        "asset": token,
        "amount": str(amount),
        "assetTransferMethod": "eip3009",
        "authorization": authorization.to_payload(),
    }


def _permit2_request(
    token: str,
    amount: int,
    authorization: Permit2Authorization,
    permit: Eip2612Permit | None,
) -> dict[str, Any]:
    request: dict[str, Any] = {
        "asset": token,
        "amount": str(amount),
        "assetTransferMethod": "permit2",
        "permit2Authorization": authorization.to_payload(),
    }
    if permit is not None:
        request["eip2612Permit"] = permit.to_payload()
    return request


async def _submit(
    ctx: ClientCtx,
    request: dict[str, Any],
    route: TokenRoute,
    payer: str,
    asset: str,
    amount: int,
) -> DepositReceipt:
    response = await ctx.facilitator.post("deposit", request)
    if not response.get("success"):
        raise rejection_error(
            response, response.get("errorReason"), response.get("errorMessage")
        )

    tx_hash = response.get("transaction")
    if not isinstance(tx_hash, str) or not tx_hash.startswith("0x"):
        raise OutcomeUnknownError("facilitator reported success without a transaction")

    echoed_amount = response.get("amount")
    if echoed_amount is not None:
        # An echo that cannot be read is no confirmation.
        try:
            parsed_amount = int(str(echoed_amount), 0)
        except ValueError:
            parsed_amount = None
        if parsed_amount != amount:
            raise OutcomeUnknownError(
                f"facilitator echoed amount {echoed_amount}, expected {amount}"
            )

    return DepositReceipt(
        tx_hash=tx_hash,
        route=route,
        account=confirm_facilitator_echo("from", response.get("from"), payer),
        asset=confirm_facilitator_echo("asset", response.get("asset"), asset),
        amount=amount,
        network=response.get("network"),
        raw=response,
    )


async def _verify(ctx: ClientCtx, request: dict[str, Any]) -> None:
    response = await ctx.facilitator.post("deposit/verify", request)
    if response.get("isValid"):
        return
    raise rejection_error(
        response, response.get("invalidReason"), response.get("invalidMessage")
    )
