"""Depositing collateral, over whichever route is cheapest for the payer.

``deposit.of(asset, amount)`` captures the intent, a route pin (``gasless()``,
``eip3009()``, ``permit2()``, ``self_funded()``) narrows how, and a terminal
(``send()``, ``sign()``, ``verify()``, ``approve()``) does it. Gasless routes
have the payer sign an authorization that the facilitator redeems and pays gas
for — attach one signed elsewhere with ``authorization(...)`` — while the
self-funded route is the payer's own transaction. Every route credits the
authorization's signer, so the choice only changes who pays;
``DepositReceipt.route`` reports which one ran. Port of
``sdk-rust/src/client/deposit.rs``.
"""

from __future__ import annotations

from typing import Any, Dict, Optional, Union

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
from .model import Asset, DepositReceipt, TokenRoute


class DepositClient:
    def __init__(self, ctx: ClientCtx) -> None:
        self._ctx = ctx

    def is_gasless_available(self) -> bool:
        """Whether a gasless route is available at all — callers that want to
        decide for themselves rather than let the auto route fall back can
        branch on this instead of on an error."""
        return self._ctx.facilitator.is_configured()

    def of(self, asset: Union[Asset, str, None], amount: int) -> "DepositBuilder":
        """Starts a deposit of *amount* in *asset* (``None`` for native ETH)."""
        return DepositBuilder(self._ctx, Asset.coerce(asset), int(amount))


class _DepositBase:
    def __init__(self, ctx: ClientCtx, asset: Asset, amount: int) -> None:
        if amount <= 0:
            raise AmountZeroError("deposit amount must be positive")
        self._ctx = ctx
        self._asset = asset
        self._amount = amount

    def _erc20_token(self) -> str:
        """The ERC-20 behind a gasless pin. Native ETH has no gasless route —
        no authorization scheme covers it."""
        if self._asset.is_native:
            raise InvalidParamsError(
                "native ETH has no gasless route; deposit it self-funded"
            )
        return self._asset.address


class DepositBuilder(_DepositBase):
    """A deposit being built; nothing happens until a terminal runs."""

    def gasless(self) -> "GaslessDeposit":
        """Pins "any gasless scheme": EIP-3009 first, then Permit2 with the
        approval sponsored, with no self-funded fallback."""
        return GaslessDeposit(self._ctx, self._asset, self._amount)

    def eip3009(self) -> "Eip3009Deposit":
        """Pins the EIP-3009 route, failing rather than trying another scheme."""
        return Eip3009Deposit(self._ctx, self._asset, self._amount)

    def permit2(self) -> "Permit2Deposit":
        """Pins the Permit2 route, failing rather than trying another scheme."""
        return Permit2Deposit(self._ctx, self._asset, self._amount)

    def self_funded(self) -> "SelfFundedDeposit":
        """Pins the payer's own transaction."""
        return SelfFundedDeposit(self._ctx, self._asset, self._amount)

    async def send(
        self, wait_options: Optional[TxReceiptWaitOptions] = None
    ) -> DepositReceipt:
        """Deposits over the cheapest route available: EIP-3009, then Permit2
        with the approval sponsored where the token allows it, then the
        payer's own transaction when no gasless route applies — native ETH, no
        facilitator configured, or a token whose Permit2 approval cannot be
        sponsored."""
        if self._asset.is_native or not self._ctx.facilitator.is_configured():
            return await self.self_funded().send(wait_options)
        token = self._asset.address

        # EIP-3009 is the cheapest route, but nothing says up front whether a
        # token implements it — a domain separator only proves EIP-712, which
        # EIP-2612 has too. So try it and read the answer off the rejection,
        # which costs no gas.
        try:
            return await _send_eip3009(self._ctx, token, self._amount)
        except Exception as rejection:
            if not refuses_the_authorization(rejection):
                raise

        try:
            return await _send_sponsored_permit2(self._ctx, token, self._amount)
        except Permit2AllowanceRequiredError:
            # The approval cannot be sponsored, so gaslessness is off the
            # table either way; paying for the deposit directly is one
            # transaction rather than an approval plus a deposit.
            return await _fallback_to_self_funded(
                self._ctx, token, self._amount, wait_options
            )


class GaslessDeposit(_DepositBase):
    async def send(self) -> DepositReceipt:
        """Deposits gaslessly, over whichever scheme the token supports.
        Fails rather than falling back to the payer's own transaction."""
        token = self._erc20_token()
        try:
            return await _send_eip3009(self._ctx, token, self._amount)
        except Exception as rejection:
            if not refuses_the_authorization(rejection):
                raise
        return await _send_sponsored_permit2(self._ctx, token, self._amount)


class Eip3009Deposit(_DepositBase):
    async def sign(self) -> ReceiveAuthorization:
        """Signs the EIP-3009 authorization without submitting it. Redeem by
        attaching it to a fresh builder:
        ``deposit.of(asset, amount).eip3009().authorization(auth).send()``."""
        return await sig.eip3009_authorization(
            self._ctx, self._erc20_token(), self._amount
        )

    def authorization(
        self, authorization: ReceiveAuthorization
    ) -> "AuthorizedEip3009Deposit":
        """Attaches an EIP-3009 authorization signed elsewhere — a hardware
        wallet, another process, or an earlier session."""
        return AuthorizedEip3009Deposit(
            self._ctx, self._asset, self._amount, authorization
        )

    async def send(self) -> DepositReceipt:
        """Deposits gaslessly with an EIP-3009 authorization. Requires a token
        implementing EIP-3009 (USDC and similar); for anything else pin
        ``permit2()``."""
        return await _send_eip3009(self._ctx, self._erc20_token(), self._amount)


class Permit2Deposit(_DepositBase):
    def sponsor_approval(self) -> "SponsoredPermit2Deposit":
        """Upgrades the pin to sign the missing Permit2 approval (EIP-2612)
        rather than fail on it."""
        return SponsoredPermit2Deposit(self._ctx, self._asset, self._amount)

    async def sign(self) -> Permit2Authorization:
        """Signs the Permit2 authorization without submitting it."""
        return await sig.permit2_authorization(
            self._ctx, self._erc20_token(), self._amount
        )

    def authorization(
        self, authorization: Permit2Authorization
    ) -> "AuthorizedPermit2Deposit":
        """Attaches a Permit2 authorization signed elsewhere."""
        return AuthorizedPermit2Deposit(
            self._ctx, self._asset, self._amount, authorization
        )

    async def send(self) -> DepositReceipt:
        """Deposits gaslessly through Permit2. Works for any ERC-20, but is
        not gasless on its own: without the payer's one-time on-chain
        ``approve(PERMIT2, ...)`` this fails with
        Permit2AllowanceRequiredError; ``sponsor_approval()`` covers that
        approval too, where the token allows it."""
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
        """Deposits through Permit2, signing the missing approval rather than
        transacting for it. Fails with Permit2AllowanceRequiredError for
        tokens with no EIP-2612 surface. No ``sign()`` on this pin: the permit
        needs the payer's current EIP-2612 nonce, which only arrives with the
        facilitator's rejection."""
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
        """Preflight: runs every check a real submission would run, without
        spending anyone's gas — worth doing before handing an authorization to
        a user-facing flow, since it tells a permanently unusable
        authorization apart from a transient failure."""
        await _verify(
            self._ctx,
            _eip3009_request(self._erc20_token(), self._amount, self._auth),
        )

    async def send(self) -> DepositReceipt:
        """Deposits with the attached authorization. The submitter needs no
        signer of their own."""
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
        """Preflight: runs every check a real submission would run, without
        spending anyone's gas."""
        await _verify(
            self._ctx,
            _permit2_request(self._erc20_token(), self._amount, self._auth, None),
        )

    async def send(self) -> DepositReceipt:
        """Deposits with the attached authorization. The submitter needs no
        signer of their own."""
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
        self, wait_options: Optional[TxReceiptWaitOptions] = None
    ) -> Optional[Dict[str, Any]]:
        """Grants the Core4Mica contract the allowance a self-funded ERC-20
        deposit pulls. Returns ``None`` when the standing allowance covers it."""
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
        self, wait_options: Optional[TxReceiptWaitOptions] = None
    ) -> DepositReceipt:
        """Deposits with the payer's own transaction, reported in the same
        shape as a gasless one. For ERC-20 deposits, grant the allowance with
        :meth:`approve` first."""
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
    # Try the plain route first: the payer may already have approved, in which
    # case a permit is pointless and only costs the submitter a no-op.
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
            # The permit digest needs the token's domain separator; without
            # one the approval cannot be sponsored from here — the nonce
            # advertised that sponsoring *could* work, which has just been
            # disproven, so it is stripped.
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
    wait_options: Optional[TxReceiptWaitOptions],
) -> DepositReceipt:
    """Taken only after every gasless route was refused. Pre-checks the ERC-20
    allowance the fallback needs and the gasless routes never did, so a payer
    who has not approved the contract is told exactly that instead of getting
    an opaque revert from inside the token."""
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
) -> Dict[str, Any]:
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
    permit: Optional[Eip2612Permit],
) -> Dict[str, Any]:
    request: Dict[str, Any] = {
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
    request: Dict[str, Any],
    route: TokenRoute,
    payer: str,
    asset: str,
    amount: int,
) -> DepositReceipt:
    response = await ctx.facilitator.post("deposit", request)
    if not response.get("success"):
        raise rejection_error(response, response.get("error"))

    tx_hash = response.get("txHash")
    if not isinstance(tx_hash, str) or not tx_hash.startswith("0x"):
        raise OutcomeUnknownError("facilitator reported success without a txHash")

    # from/asset/amount are echoed for reconciliation; a facilitator that
    # omits them has not changed what the contract did, but one that echoes a
    # different deposit has, and the receipt is refused rather than made to
    # describe it.
    echoed_amount = response.get("amount")
    if echoed_amount is not None:
        # An echo that cannot be read is no confirmation that it matched.
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


async def _verify(ctx: ClientCtx, request: Dict[str, Any]) -> None:
    response = await ctx.facilitator.post("deposit/verify", request)
    if response.get("isValid"):
        return
    raise rejection_error(response, response.get("invalidReason"))
