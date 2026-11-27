from __future__ import annotations

from typing import Any

from ..authorizations import (
    WithdrawalCancelAuthorization,
    WithdrawalRequestAuthorization,
)
from ..errors import AmountZeroError, InvalidParamsError, OutcomeUnknownError
from ..models import TxReceiptWaitOptions
from . import sig
from .ctx import ClientCtx
from .facilitator import (
    NAMES_THE_REQUEST,
    confirm_facilitator_echo,
    rejection_error,
    sponsorship_unavailable,
)
from .model import Asset, Route, WithdrawReceipt, base_units


class WithdrawClient:
    def __init__(self, ctx: ClientCtx) -> None:
        self._ctx = ctx

    def is_gasless_available(self) -> bool:
        return self._ctx.facilitator.is_configured()

    def request(self, asset: Asset | str | None, amount: int) -> RequestBuilder:
        """The grace period runs from the request; finalize once it elapses."""
        units = base_units(amount)
        if units <= 0:
            raise AmountZeroError("withdrawal amount must be positive")
        return RequestBuilder(self._ctx, Asset.coerce(asset), units)

    def cancel(self, asset: Asset | str | None) -> CancelBuilder:
        return CancelBuilder(self._ctx, Asset.coerce(asset))

    def finalize(self, asset: Asset | str | None) -> FinalizeBuilder:
        return FinalizeBuilder(self._ctx, Asset.coerce(asset))


class RequestBuilder:
    def __init__(self, ctx: ClientCtx, asset: Asset, amount: int) -> None:
        self._ctx = ctx
        self._asset = asset
        self._amount = amount

    def gasless(self) -> GaslessRequest:
        """Never falls back to the user's own transaction."""
        return GaslessRequest(self._ctx, self._asset, self._amount)

    def self_funded(self) -> SelfFundedRequest:
        return SelfFundedRequest(self._ctx, self._asset, self._amount)

    async def send(
        self, wait_options: TxReceiptWaitOptions | None = None
    ) -> WithdrawReceipt:
        """Gasless where possible. A rejection naming the request, or an unknown
        outcome, is not retried: requesting again restarts the grace period."""
        if not self._ctx.facilitator.is_configured():
            return await self.self_funded().send(wait_options)
        try:
            return await self.gasless().send()
        except Exception as exc:
            if sponsorship_unavailable(exc, NAMES_THE_REQUEST):
                return await self.self_funded().send(wait_options)
            raise


class GaslessRequest:
    def __init__(self, ctx: ClientCtx, asset: Asset, amount: int) -> None:
        self._ctx = ctx
        self._asset = asset
        self._amount = amount

    async def sign(self) -> WithdrawalRequestAuthorization:
        """Signs without submitting. Redeem with
        ``withdraw.request(asset, amount).gasless().authorization(auth).send()``."""
        return await sig.request_withdrawal_authorization(
            self._ctx, self._asset.address, self._amount
        )

    def authorization(
        self, authorization: WithdrawalRequestAuthorization
    ) -> AuthorizedRequest:
        return AuthorizedRequest(self._ctx, self._asset, self._amount, authorization)

    async def send(self) -> WithdrawReceipt:
        authorization = await sig.request_withdrawal_authorization(
            self._ctx, self._asset.address, self._amount
        )
        return await _submit(
            self._ctx,
            {"action": "request", "authorization": authorization.to_payload()},
            authorization.user,
            authorization.asset,
        )


class AuthorizedRequest:
    def __init__(
        self,
        ctx: ClientCtx,
        asset: Asset,
        amount: int,
        auth: WithdrawalRequestAuthorization,
    ) -> None:
        self._ctx = ctx
        self._asset = asset
        self._amount = amount
        self._auth = auth

    def _checked(self) -> None:
        if (
            self._auth.asset.lower() != self._asset.address.lower()
            or self._auth.amount != self._amount
        ):
            raise InvalidParamsError(
                f"authorization signs {self._auth.amount} of {self._auth.asset}, "
                f"but the builder asks {self._amount} of {self._asset.address}"
            )

    async def verify(self) -> None:
        """Runs every check a submission would, spending no gas."""
        self._checked()
        await _verify(
            self._ctx, {"action": "request", "authorization": self._auth.to_payload()}
        )

    async def send(self) -> WithdrawReceipt:
        self._checked()
        return await _submit(
            self._ctx,
            {"action": "request", "authorization": self._auth.to_payload()},
            self._auth.user,
            self._auth.asset,
        )


class SelfFundedRequest:
    def __init__(self, ctx: ClientCtx, asset: Asset, amount: int) -> None:
        self._ctx = ctx
        self._asset = asset
        self._amount = amount

    async def send(
        self, wait_options: TxReceiptWaitOptions | None = None
    ) -> WithdrawReceipt:
        gateway = await self._ctx.gateway()
        receipt = await gateway.request_withdrawal(
            self._amount, self._asset.erc20_token, wait_options=wait_options
        )
        return _self_funded_receipt(self._ctx, receipt, self._asset)


class CancelBuilder:
    def __init__(self, ctx: ClientCtx, asset: Asset) -> None:
        self._ctx = ctx
        self._asset = asset

    def gasless(self) -> GaslessCancel:
        return GaslessCancel(self._ctx, self._asset)

    def self_funded(self) -> SelfFundedCancel:
        return SelfFundedCancel(self._ctx, self._asset)

    async def send(
        self, wait_options: TxReceiptWaitOptions | None = None
    ) -> WithdrawReceipt:
        if not self._ctx.facilitator.is_configured():
            return await self.self_funded().send(wait_options)
        try:
            return await self.gasless().send()
        except Exception as exc:
            if sponsorship_unavailable(exc, NAMES_THE_REQUEST):
                return await self.self_funded().send(wait_options)
            raise


class GaslessCancel:
    def __init__(self, ctx: ClientCtx, asset: Asset) -> None:
        self._ctx = ctx
        self._asset = asset

    async def sign(self) -> WithdrawalCancelAuthorization:
        return await sig.cancel_withdrawal_authorization(self._ctx, self._asset.address)

    def authorization(
        self, authorization: WithdrawalCancelAuthorization
    ) -> AuthorizedCancel:
        return AuthorizedCancel(self._ctx, self._asset, authorization)

    async def send(self) -> WithdrawReceipt:
        authorization = await sig.cancel_withdrawal_authorization(
            self._ctx, self._asset.address
        )
        return await _submit(
            self._ctx,
            {"action": "cancel", "authorization": authorization.to_payload()},
            authorization.user,
            authorization.asset,
        )


class AuthorizedCancel:
    def __init__(
        self, ctx: ClientCtx, asset: Asset, auth: WithdrawalCancelAuthorization
    ) -> None:
        self._ctx = ctx
        self._asset = asset
        self._auth = auth

    def _checked(self) -> None:
        if self._auth.asset.lower() != self._asset.address.lower():
            raise InvalidParamsError(
                f"authorization cancels for {self._auth.asset}, but the builder "
                f"asks {self._asset.address}"
            )

    async def verify(self) -> None:
        self._checked()
        await _verify(
            self._ctx, {"action": "cancel", "authorization": self._auth.to_payload()}
        )

    async def send(self) -> WithdrawReceipt:
        self._checked()
        return await _submit(
            self._ctx,
            {"action": "cancel", "authorization": self._auth.to_payload()},
            self._auth.user,
            self._auth.asset,
        )


class SelfFundedCancel:
    def __init__(self, ctx: ClientCtx, asset: Asset) -> None:
        self._ctx = ctx
        self._asset = asset

    async def send(
        self, wait_options: TxReceiptWaitOptions | None = None
    ) -> WithdrawReceipt:
        gateway = await self._ctx.gateway()
        receipt = await gateway.cancel_withdrawal(
            self._asset.erc20_token, wait_options=wait_options
        )
        return _self_funded_receipt(self._ctx, receipt, self._asset)


class FinalizeBuilder:
    """No ``sign()``: ``finalizeWithdrawalFor`` is permissionless and pays
    the user."""

    def __init__(self, ctx: ClientCtx, asset: Asset) -> None:
        self._ctx = ctx
        self._asset = asset

    def gasless(self) -> GaslessFinalize:
        return GaslessFinalize(self._ctx, self._asset)

    def self_funded(self) -> SelfFundedFinalize:
        return SelfFundedFinalize(self._ctx, self._asset)

    async def send(
        self, wait_options: TxReceiptWaitOptions | None = None
    ) -> WithdrawReceipt:
        if not self._ctx.facilitator.is_configured():
            return await self.self_funded().send(wait_options)
        try:
            return await self.gasless().send()
        except Exception as exc:
            if sponsorship_unavailable(exc, NAMES_THE_REQUEST):
                return await self.self_funded().send(wait_options)
            raise


class GaslessFinalize:
    def __init__(self, ctx: ClientCtx, asset: Asset) -> None:
        self._ctx = ctx
        self._asset = asset

    async def verify(self) -> None:
        """Runs every check a submission would, spending no gas, including the
        grace period."""
        await _verify(self._ctx, self._finalize_request())

    async def send(self) -> WithdrawReceipt:
        return await _submit(
            self._ctx,
            self._finalize_request(),
            self._ctx.signer_address,
            self._asset.address,
        )

    def _finalize_request(self) -> dict[str, Any]:
        return {
            "action": "finalize",
            "user": self._ctx.signer_address,
            "asset": self._asset.address,
        }


class SelfFundedFinalize:
    def __init__(self, ctx: ClientCtx, asset: Asset) -> None:
        self._ctx = ctx
        self._asset = asset

    async def send(
        self, wait_options: TxReceiptWaitOptions | None = None
    ) -> WithdrawReceipt:
        gateway = await self._ctx.gateway()
        receipt = await gateway.finalize_withdrawal(
            self._asset.erc20_token, wait_options=wait_options
        )
        return _self_funded_receipt(self._ctx, receipt, self._asset)


def _self_funded_receipt(
    ctx: ClientCtx, receipt: dict[str, Any], asset: Asset
) -> WithdrawReceipt:
    return WithdrawReceipt(
        tx_hash=receipt["transactionHash"],
        route=Route.SELF_FUNDED,
        account=ctx.signer_address,
        asset=asset.address,
        raw=receipt,
    )


async def _submit(
    ctx: ClientCtx, request: dict[str, Any], user: str, asset: str
) -> WithdrawReceipt:
    response = await ctx.facilitator.post("withdraw", request)
    if not response.get("success"):
        raise rejection_error(
            response, response.get("errorReason"), response.get("errorMessage")
        )

    tx_hash = response.get("transaction")
    if not isinstance(tx_hash, str) or not tx_hash.startswith("0x"):
        raise OutcomeUnknownError("facilitator reported success without a transaction")

    return WithdrawReceipt(
        tx_hash=tx_hash,
        route=Route.GASLESS,
        account=confirm_facilitator_echo("user", response.get("user"), user),
        asset=confirm_facilitator_echo("asset", response.get("asset"), asset),
        network=response.get("network"),
        raw=response,
    )


async def _verify(ctx: ClientCtx, request: dict[str, Any]) -> None:
    response = await ctx.facilitator.post("withdraw/verify", request)
    if response.get("isValid"):
        return
    raise rejection_error(
        response, response.get("invalidReason"), response.get("invalidMessage")
    )
