"""Withdrawing collateral. A request opens a waiting period, after which it
can be finalized — or cancelled at any point before that.

Each step is an intent builder: ``request``, ``cancel`` and ``finalize``
capture what to do, a route pin (``gasless()``, ``self_funded()``) narrows
how, and a terminal (``send()``, ``sign()``, ``verify()``) does it. Unpinned,
``send()`` prefers the gasless route and falls back to the user's own
transaction. Unlike a deposit, gasless withdrawal works for ETH too:
Core4Mica verifies the signature itself rather than leaning on what the
asset implements.

Finalization is the exception: it offers no ``sign()``, because it needs no
signature at all — the payout goes to the user and the amount was fixed when
they requested it. Port of ``sdk-rust/src/client/withdraw.rs``.
"""

from __future__ import annotations

from typing import Any, Dict, Optional, Union

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
from .model import Asset, Route, WithdrawReceipt


class WithdrawClient:
    def __init__(self, ctx: ClientCtx) -> None:
        self._ctx = ctx

    def is_gasless_available(self) -> bool:
        return self._ctx.facilitator.is_configured()

    def request(self, asset: Union[Asset, str, None], amount: int) -> "RequestBuilder":
        """Starts a withdrawal request for *amount* of *asset*. The grace
        period runs from the request; finalize once it elapses."""
        if int(amount) <= 0:
            raise AmountZeroError("withdrawal amount must be positive")
        return RequestBuilder(self._ctx, Asset.coerce(asset), int(amount))

    def cancel(self, asset: Union[Asset, str, None]) -> "CancelBuilder":
        """Starts a cancellation of the pending withdrawal request for *asset*."""
        return CancelBuilder(self._ctx, Asset.coerce(asset))

    def finalize(self, asset: Union[Asset, str, None]) -> "FinalizeBuilder":
        """Starts a finalization of the elapsed withdrawal request for *asset*."""
        return FinalizeBuilder(self._ctx, Asset.coerce(asset))


# --- request -------------------------------------------------------------


class RequestBuilder:
    def __init__(self, ctx: ClientCtx, asset: Asset, amount: int) -> None:
        self._ctx = ctx
        self._asset = asset
        self._amount = amount

    def gasless(self) -> "GaslessRequest":
        """Pins the gasless route: the facilitator submits and pays, with no
        self-funded fallback."""
        return GaslessRequest(self._ctx, self._asset, self._amount)

    def self_funded(self) -> "SelfFundedRequest":
        """Pins the user's own transaction."""
        return SelfFundedRequest(self._ctx, self._asset, self._amount)

    async def send(
        self, wait_options: Optional[TxReceiptWaitOptions] = None
    ) -> WithdrawReceipt:
        """Requests the withdrawal, gaslessly where possible. A rejection that
        names the request itself is returned rather than retried, and so is an
        unknown outcome: the facilitator may already have submitted, and
        requesting again would overwrite it and restart the grace period."""
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
        """Signs the request without submitting it. Redeem by attaching it to
        a fresh builder:
        ``withdraw.request(asset, amount).gasless().authorization(auth).send()``."""
        return await sig.request_withdrawal_authorization(
            self._ctx, self._asset.address, self._amount
        )

    def authorization(
        self, authorization: WithdrawalRequestAuthorization
    ) -> "AuthorizedRequest":
        """Attaches a request authorization signed elsewhere."""
        return AuthorizedRequest(self._ctx, self._asset, self._amount, authorization)

    async def send(self) -> WithdrawReceipt:
        """Requests the withdrawal gaslessly. The user needs no native balance
        and makes no transaction."""
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
        """The authorization names its asset and amount, so a builder that
        disagrees with it would submit terms the caller never stated."""
        if (
            self._auth.asset.lower() != self._asset.address.lower()
            or self._auth.amount != self._amount
        ):
            raise InvalidParamsError(
                f"authorization signs {self._auth.amount} of {self._auth.asset}, "
                f"but the builder asks {self._amount} of {self._asset.address}"
            )

    async def verify(self) -> None:
        """Preflight: runs every check a real submission would run, without
        spending anyone's gas."""
        self._checked()
        await _verify(
            self._ctx, {"action": "request", "authorization": self._auth.to_payload()}
        )

    async def send(self) -> WithdrawReceipt:
        """Requests the withdrawal with the attached authorization. The
        submitter needs no signer of their own."""
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
        self, wait_options: Optional[TxReceiptWaitOptions] = None
    ) -> WithdrawReceipt:
        gateway = await self._ctx.gateway()
        receipt = await gateway.request_withdrawal(
            self._amount, self._asset.erc20_token, wait_options=wait_options
        )
        return _self_funded_receipt(self._ctx, receipt, self._asset)


# --- cancel --------------------------------------------------------------


class CancelBuilder:
    def __init__(self, ctx: ClientCtx, asset: Asset) -> None:
        self._ctx = ctx
        self._asset = asset

    def gasless(self) -> "GaslessCancel":
        return GaslessCancel(self._ctx, self._asset)

    def self_funded(self) -> "SelfFundedCancel":
        return SelfFundedCancel(self._ctx, self._asset)

    async def send(
        self, wait_options: Optional[TxReceiptWaitOptions] = None
    ) -> WithdrawReceipt:
        """Cancels the pending withdrawal request, gaslessly where possible."""
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
        """Signs the cancellation without submitting it."""
        return await sig.cancel_withdrawal_authorization(self._ctx, self._asset.address)

    def authorization(
        self, authorization: WithdrawalCancelAuthorization
    ) -> "AuthorizedCancel":
        """Attaches a cancellation authorization signed elsewhere."""
        return AuthorizedCancel(self._ctx, self._asset, authorization)

    async def send(self) -> WithdrawReceipt:
        """Cancels the pending withdrawal request gaslessly."""
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
        self, wait_options: Optional[TxReceiptWaitOptions] = None
    ) -> WithdrawReceipt:
        gateway = await self._ctx.gateway()
        receipt = await gateway.cancel_withdrawal(
            self._asset.erc20_token, wait_options=wait_options
        )
        return _self_funded_receipt(self._ctx, receipt, self._asset)


# --- finalize ------------------------------------------------------------


class FinalizeBuilder:
    """No ``sign()`` on any route: ``finalizeWithdrawalFor`` is permissionless
    because it pays the user, so there is nothing to sign."""

    def __init__(self, ctx: ClientCtx, asset: Asset) -> None:
        self._ctx = ctx
        self._asset = asset

    def gasless(self) -> "GaslessFinalize":
        return GaslessFinalize(self._ctx, self._asset)

    def self_funded(self) -> "SelfFundedFinalize":
        return SelfFundedFinalize(self._ctx, self._asset)

    async def send(
        self, wait_options: Optional[TxReceiptWaitOptions] = None
    ) -> WithdrawReceipt:
        """Pays out the elapsed withdrawal request, gaslessly where possible."""
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
        """Preflight — worth more here than elsewhere, since finalization is
        the one step that can be refused purely by the clock."""
        await _verify(self._ctx, self._finalize_request())

    async def send(self) -> WithdrawReceipt:
        """Finalizes gaslessly. Takes no signature: ``finalizeWithdrawalFor``
        pays the user whoever submits it."""
        return await _submit(
            self._ctx,
            self._finalize_request(),
            self._ctx.signer_address,
            self._asset.address,
        )

    def _finalize_request(self) -> Dict[str, Any]:
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
        self, wait_options: Optional[TxReceiptWaitOptions] = None
    ) -> WithdrawReceipt:
        gateway = await self._ctx.gateway()
        receipt = await gateway.finalize_withdrawal(
            self._asset.erc20_token, wait_options=wait_options
        )
        return _self_funded_receipt(self._ctx, receipt, self._asset)


# --- shared --------------------------------------------------------------


def _self_funded_receipt(
    ctx: ClientCtx, receipt: Dict[str, Any], asset: Asset
) -> WithdrawReceipt:
    return WithdrawReceipt(
        tx_hash=receipt["transactionHash"],
        route=Route.SELF_FUNDED,
        account=ctx.signer_address,
        asset=asset.address,
        raw=receipt,
    )


async def _submit(
    ctx: ClientCtx, request: Dict[str, Any], user: str, asset: str
) -> WithdrawReceipt:
    response = await ctx.facilitator.post("withdraw", request)
    if not response.get("success"):
        raise rejection_error(response, response.get("error"))

    tx_hash = response.get("txHash")
    if not isinstance(tx_hash, str) or not tx_hash.startswith("0x"):
        raise OutcomeUnknownError("facilitator reported success without a txHash")

    return WithdrawReceipt(
        tx_hash=tx_hash,
        route=Route.GASLESS,
        account=confirm_facilitator_echo("user", response.get("user"), user),
        asset=confirm_facilitator_echo("asset", response.get("asset"), asset),
        network=response.get("network"),
        raw=response,
    )


async def _verify(ctx: ClientCtx, request: Dict[str, Any]) -> None:
    response = await ctx.facilitator.post("withdraw/verify", request)
    if response.get("isValid"):
        return
    raise rejection_error(response, response.get("invalidReason"))
