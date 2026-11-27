from __future__ import annotations

from typing import Any

from ..authorizations import Eip2612Permit, Permit2Authorization, ReceiveAuthorization
from ..errors import (
    Erc20AllowanceRequiredError,
    InvalidParamsError,
    MissingTokenDomainSeparatorError,
    OutcomeUnknownError,
    Permit2AllowanceRequiredError,
)
from ..models import (
    ZERO_ADDRESS,
    ClearingPosition,
    ClearingSettlementActionResponse,
    TxReceiptWaitOptions,
)
from ..utils import normalize_address
from . import sig
from .ctx import ClientCtx
from .facilitator import (
    NAMES_THE_CLAIM,
    NAMES_THE_PAYMENT,
    confirm_facilitator_echo,
    refuses_the_authorization,
    rejection_error,
    sponsorship_unavailable,
)
from .model import ClaimReceipt, PayReceipt, Route, TokenRoute, confirm_echoed


class SettlementClient:
    def __init__(self, ctx: ClientCtx) -> None:
        self._ctx = ctx

    def is_gasless_available(self) -> bool:
        return self._ctx.facilitator.is_configured()

    async def positions(self) -> list[ClearingPosition]:
        """Soonest payment deadline first. Pass a position's ``cycle_id_text``
        to :meth:`pay` or :meth:`claim`."""
        return await self._ctx.rpc.list_participant_positions(self._ctx.signer_address)

    def pay(self, cycle_id: str) -> PayBuilder:
        """*cycle_id* is the text id (``cycle_id_text``); core does not resolve
        the on-chain bytes32 id."""
        return PayBuilder(self._ctx, str(cycle_id))

    def claim(self, cycle_id: str) -> ClaimBuilder:
        """*cycle_id* as for :meth:`pay`. Claims the signer's own credit unless
        ``creditor(...)`` redirects it."""
        return ClaimBuilder(self._ctx, str(cycle_id))


def _checked_pay_call(
    action: ClearingSettlementActionResponse, debtor: str
) -> ClearingSettlementActionResponse:
    confirm_echoed("participant", action.participant, debtor)
    if action.function_name != "payNetDebit":
        raise InvalidParamsError(
            f"core prepared {action.function_name}, expected payNetDebit"
        )
    return action


def _checked_claim_call(
    action: ClearingSettlementActionResponse, creditor: str
) -> ClearingSettlementActionResponse:
    confirm_echoed("participant", action.participant, creditor)
    if action.function_name != "claimNetCreditFor":
        raise InvalidParamsError(
            f"core prepared {action.function_name}, expected claimNetCreditFor"
        )
    return action


def _checked_gasless_pay(
    action: ClearingSettlementActionResponse, debtor: str
) -> ClearingSettlementActionResponse:
    _checked_pay_call(action, debtor)
    if action.asset_address.lower() == ZERO_ADDRESS:
        raise InvalidParamsError(
            "native-asset debits cannot be paid gaslessly; use the self-funded route"
        )
    return action


def _cycle_id_bytes(action: ClearingSettlementActionResponse) -> bytes:
    return bytes.fromhex(action.cycle_id.removeprefix("0x"))


def _proof_bytes(action: ClearingSettlementActionResponse) -> list[bytes]:
    return [bytes.fromhex(item.removeprefix("0x")) for item in action.proof]


async def _pay_action(
    ctx: ClientCtx, cycle_id: str
) -> ClearingSettlementActionResponse:
    return await ctx.rpc.get_clearing_pay_net_debit_action(cycle_id, ctx.signer_address)


class PayBuilder:
    def __init__(self, ctx: ClientCtx, cycle_id: str) -> None:
        self._ctx = ctx
        self._cycle_id = cycle_id

    async def action(self) -> ClearingSettlementActionResponse:
        return await _pay_action(self._ctx, self._cycle_id)

    def gasless(self) -> GaslessPay:
        """EIP-3009, then Permit2 with the approval sponsored; never
        self-funded."""
        return GaslessPay(self._ctx, self._cycle_id)

    def eip3009(self) -> Eip3009Pay:
        return Eip3009Pay(self._ctx, self._cycle_id)

    def permit2(self) -> Permit2Pay:
        return Permit2Pay(self._ctx, self._cycle_id)

    def self_funded(self) -> SelfFundedPay:
        return SelfFundedPay(self._ctx, self._cycle_id)

    async def send(
        self, wait_options: TxReceiptWaitOptions | None = None
    ) -> PayReceipt:
        """Gasless where possible, else the caller's own transaction, where a
        missing allowance raises Erc20AllowanceRequiredError. A rejection naming
        the payment, or an unknown outcome, is not retried: a second payment
        would revert as AlreadyPaid after paying gas."""
        action = await _pay_action(self._ctx, self._cycle_id)
        if (
            not self._ctx.facilitator.is_configured()
            or action.asset_address.lower() == ZERO_ADDRESS
        ):
            return await _pay_self_funded(self._ctx, action, wait_options)
        try:
            return await _pay_gasless_with(self._ctx, self._cycle_id, action)
        except Permit2AllowanceRequiredError:
            return await _fallback_to_self_funded(self._ctx, action, wait_options)
        except Exception as exc:
            if sponsorship_unavailable(exc, NAMES_THE_PAYMENT):
                return await _fallback_to_self_funded(self._ctx, action, wait_options)
            raise


class GaslessPay:
    def __init__(self, ctx: ClientCtx, cycle_id: str) -> None:
        self._ctx = ctx
        self._cycle_id = cycle_id

    async def send(self) -> PayReceipt:
        """ERC-20 cycles only. Never falls back to the caller's own transaction."""
        action = await _pay_action(self._ctx, self._cycle_id)
        return await _pay_gasless_with(self._ctx, self._cycle_id, action)


class Eip3009Pay:
    def __init__(self, ctx: ClientCtx, cycle_id: str) -> None:
        self._ctx = ctx
        self._cycle_id = cycle_id

    async def sign(self) -> ReceiveAuthorization:
        """Signs without submitting; binds the ClearingHouse, the exact amount
        and the cycle. Redeem with
        ``settlement.pay(cycle_id).eip3009().authorization(auth).send()``."""
        action = _checked_gasless_pay(
            await _pay_action(self._ctx, self._cycle_id), self._ctx.signer_address
        )
        return await sig.debit_authorization(
            self._ctx,
            action.asset_address,
            action.contract_address,
            action.amount,
            action.cycle_id,
        )

    def authorization(self, authorization: ReceiveAuthorization) -> AuthorizedPay:
        return AuthorizedPay(
            self._ctx,
            self._cycle_id,
            {
                "assetTransferMethod": "eip3009",
                "authorization": authorization.to_payload(),
            },
            TokenRoute.EIP3009,
            authorization.from_address,
        )

    async def send(self) -> PayReceipt:
        action = await _pay_action(self._ctx, self._cycle_id)
        return await _pay_eip3009_with(self._ctx, self._cycle_id, action)


class Permit2Pay:
    def __init__(self, ctx: ClientCtx, cycle_id: str) -> None:
        self._ctx = ctx
        self._cycle_id = cycle_id

    def sponsor_approval(self) -> SponsoredPermit2Pay:
        """Signs the missing Permit2 approval (EIP-2612) instead of failing on it."""
        return SponsoredPermit2Pay(self._ctx, self._cycle_id)

    async def sign(self) -> Permit2Authorization:
        action = _checked_gasless_pay(
            await _pay_action(self._ctx, self._cycle_id), self._ctx.signer_address
        )
        return await sig.debit_permit2_authorization(
            self._ctx,
            action.asset_address,
            action.contract_address,
            action.amount,
            action.cycle_id,
        )

    def authorization(self, authorization: Permit2Authorization) -> AuthorizedPay:
        return AuthorizedPay(
            self._ctx,
            self._cycle_id,
            {
                "assetTransferMethod": "permit2",
                "permit2Authorization": authorization.to_payload(),
            },
            TokenRoute.PERMIT2,
            authorization.from_address,
        )

    async def send(self) -> PayReceipt:
        """Without the debtor's one-time ``approve(PERMIT2, ...)`` this raises
        Permit2AllowanceRequiredError."""
        action = await _pay_action(self._ctx, self._cycle_id)
        return await _submit_permit2_pay(self._ctx, self._cycle_id, action, None)


class SponsoredPermit2Pay:
    def __init__(self, ctx: ClientCtx, cycle_id: str) -> None:
        self._ctx = ctx
        self._cycle_id = cycle_id

    async def send(self) -> PayReceipt:
        action = await _pay_action(self._ctx, self._cycle_id)
        return await _pay_sponsored_permit2_with(self._ctx, self._cycle_id, action)


class AuthorizedPay:
    def __init__(
        self,
        ctx: ClientCtx,
        cycle_id: str,
        method_payload: dict[str, Any],
        route: TokenRoute,
        debtor: str,
    ) -> None:
        self._ctx = ctx
        self._cycle_id = cycle_id
        self._method_payload = method_payload
        self._route = route
        self._debtor = debtor

    def _request(self) -> dict[str, Any]:
        return {"cycleId": self._cycle_id, **self._method_payload}

    async def verify(self) -> None:
        """Runs every check a submission would, spending no gas."""
        response = await self._ctx.facilitator.post(
            "clearing/pay/verify", self._request()
        )
        if response.get("isValid"):
            return
        raise rejection_error(
            response, response.get("invalidReason"), response.get("invalidMessage")
        )

    async def send(self) -> PayReceipt:
        return await _submit_pay(self._ctx, self._request(), self._route, self._debtor)


class SelfFundedPay:
    def __init__(self, ctx: ClientCtx, cycle_id: str) -> None:
        self._ctx = ctx
        self._cycle_id = cycle_id

    async def approve(
        self, wait_options: TxReceiptWaitOptions | None = None
    ) -> dict[str, Any] | None:
        """Approves the ClearingHouse to pull exactly the committed debit."""
        action = _checked_pay_call(
            await _pay_action(self._ctx, self._cycle_id), self._ctx.signer_address
        )
        if action.asset_address.lower() == ZERO_ADDRESS:
            raise InvalidParamsError(
                "a native-asset debit needs no approval; its value rides with "
                "the transaction"
            )
        gateway = await self._ctx.gateway()
        return await gateway.approve_erc20(
            action.asset_address,
            action.amount,
            spender=action.contract_address,
            wait_options=wait_options,
        )

    async def send(
        self, wait_options: TxReceiptWaitOptions | None = None
    ) -> PayReceipt:
        """ERC-20 cycles need :meth:`approve` first; a missing allowance raises
        Erc20AllowanceRequiredError."""
        action = await _pay_action(self._ctx, self._cycle_id)
        return await _pay_self_funded(self._ctx, action, wait_options)


async def _pay_gasless_with(
    ctx: ClientCtx, cycle_id: str, action: ClearingSettlementActionResponse
) -> PayReceipt:
    # Only a rejection reveals whether the token implements EIP-3009.
    try:
        return await _pay_eip3009_with(ctx, cycle_id, action)
    except Exception as rejection:
        if not refuses_the_authorization(rejection):
            raise
    return await _pay_sponsored_permit2_with(ctx, cycle_id, action)


async def _pay_eip3009_with(
    ctx: ClientCtx, cycle_id: str, action: ClearingSettlementActionResponse
) -> PayReceipt:
    action = _checked_gasless_pay(action, ctx.signer_address)
    authorization = await sig.debit_authorization(
        ctx,
        action.asset_address,
        action.contract_address,
        action.amount,
        action.cycle_id,
    )
    return await _submit_pay(
        ctx,
        {
            "cycleId": cycle_id,
            "assetTransferMethod": "eip3009",
            "authorization": authorization.to_payload(),
        },
        TokenRoute.EIP3009,
        authorization.from_address,
    )


async def _pay_sponsored_permit2_with(
    ctx: ClientCtx, cycle_id: str, action: ClearingSettlementActionResponse
) -> PayReceipt:
    try:
        return await _submit_permit2_pay(ctx, cycle_id, action, None)
    except Permit2AllowanceRequiredError as rejection:
        if rejection.eip2612_nonce is None:
            raise
        try:
            permit = await sig.eip2612_permit(
                ctx, action.asset_address, rejection.eip2612_nonce
            )
        except MissingTokenDomainSeparatorError:
            raise Permit2AllowanceRequiredError(str(rejection), None) from None
        return await _submit_permit2_pay(ctx, cycle_id, action, permit)


async def _submit_permit2_pay(
    ctx: ClientCtx,
    cycle_id: str,
    action: ClearingSettlementActionResponse,
    permit: Eip2612Permit | None,
) -> PayReceipt:
    action = _checked_gasless_pay(action, ctx.signer_address)
    authorization = await sig.debit_permit2_authorization(
        ctx,
        action.asset_address,
        action.contract_address,
        action.amount,
        action.cycle_id,
    )
    request: dict[str, Any] = {
        "cycleId": cycle_id,
        "assetTransferMethod": "permit2",
        "permit2Authorization": authorization.to_payload(),
    }
    route = TokenRoute.PERMIT2
    if permit is not None:
        request["eip2612Permit"] = permit.to_payload()
        route = TokenRoute.SPONSORED_PERMIT2
    return await _submit_pay(ctx, request, route, authorization.from_address)


async def _submit_pay(
    ctx: ClientCtx, request: dict[str, Any], route: TokenRoute, debtor: str
) -> PayReceipt:
    response = await ctx.facilitator.post("clearing/pay", request)
    if not response.get("success"):
        raise rejection_error(
            response, response.get("errorReason"), response.get("errorMessage")
        )

    tx_hash = response.get("transaction")
    if not isinstance(tx_hash, str) or not tx_hash.startswith("0x"):
        raise OutcomeUnknownError("facilitator reported success without a transaction")

    return PayReceipt(
        tx_hash=tx_hash,
        route=route,
        account=confirm_facilitator_echo("debtor", response.get("debtor"), debtor),
        network=response.get("network"),
        raw=response,
    )


async def _fallback_to_self_funded(
    ctx: ClientCtx,
    action: ClearingSettlementActionResponse,
    wait_options: TxReceiptWaitOptions | None,
) -> PayReceipt:
    return await _pay_self_funded(ctx, action, wait_options)


async def _pay_self_funded(
    ctx: ClientCtx,
    action: ClearingSettlementActionResponse,
    wait_options: TxReceiptWaitOptions | None,
) -> PayReceipt:
    action = _checked_pay_call(action, ctx.signer_address)
    gateway = await ctx.gateway()

    if action.asset_address.lower() != ZERO_ADDRESS:
        allowance = await gateway.erc20_allowance(
            action.asset_address, action.contract_address
        )
        if allowance < action.amount:
            raise Erc20AllowanceRequiredError(
                token=action.asset_address,
                spender=action.contract_address,
                allowance=allowance,
                needed=action.amount,
            )

    receipt = await gateway.pay_net_debit(
        clearing_house=action.contract_address,
        cycle_id=_cycle_id_bytes(action),
        amount=action.amount,
        proof=_proof_bytes(action),
        payable_value=action.payable_value,
        wait_options=wait_options,
    )
    return PayReceipt(
        tx_hash=receipt["transactionHash"],
        route=TokenRoute.SELF_FUNDED,
        account=ctx.signer_address,
        raw=receipt,
    )


class ClaimBuilder:
    """Takes no signature: the payout goes to the address the committed leaf
    names, for the amount it fixes."""

    def __init__(
        self, ctx: ClientCtx, cycle_id: str, creditor: str | None = None
    ) -> None:
        self._ctx = ctx
        self._cycle_id = cycle_id
        self._creditor = creditor

    def creditor(self, creditor: str) -> ClaimBuilder:
        """Claims *creditor*'s net credit instead of the signer's, paid to them."""
        self._creditor = normalize_address(creditor)
        return self

    def _resolved_creditor(self) -> str:
        return self._creditor or self._ctx.signer_address

    async def action(self) -> ClearingSettlementActionResponse:
        return await self._ctx.rpc.get_clearing_claim_net_credit_action(
            self._cycle_id, self._resolved_creditor()
        )

    def gasless(self) -> GaslessClaim:
        """Never falls back to the caller's own transaction."""
        return GaslessClaim(self._ctx, self._cycle_id, self._resolved_creditor())

    def self_funded(self) -> SelfFundedClaim:
        return SelfFundedClaim(self._ctx, self._cycle_id, self._resolved_creditor())

    async def send(
        self, wait_options: TxReceiptWaitOptions | None = None
    ) -> ClaimReceipt:
        """Gasless where possible. A rejection naming the claim itself is not
        retried self-funded: that would revert too, after paying gas."""
        if not self._ctx.facilitator.is_configured():
            return await self.self_funded().send(wait_options)
        try:
            return await self.gasless().send()
        except Exception as exc:
            if sponsorship_unavailable(exc, NAMES_THE_CLAIM):
                return await self.self_funded().send(wait_options)
            raise


class GaslessClaim:
    def __init__(self, ctx: ClientCtx, cycle_id: str, creditor: str) -> None:
        self._ctx = ctx
        self._cycle_id = cycle_id
        self._creditor = creditor

    def _request(self) -> dict[str, Any]:
        return {"cycleId": self._cycle_id, "creditor": self._creditor}

    async def verify(self) -> None:
        """Runs every check a submission would, spending no gas."""
        response = await self._ctx.facilitator.post(
            "clearing/claim/verify", self._request()
        )
        if response.get("isValid"):
            return
        raise rejection_error(
            response, response.get("invalidReason"), response.get("invalidMessage")
        )

    async def send(self) -> ClaimReceipt:
        response = await self._ctx.facilitator.post("clearing/claim", self._request())
        if not response.get("success"):
            raise rejection_error(
                response, response.get("errorReason"), response.get("errorMessage")
            )

        tx_hash = response.get("transaction")
        if not isinstance(tx_hash, str) or not tx_hash.startswith("0x"):
            raise OutcomeUnknownError(
                "facilitator reported success without a transaction"
            )

        return ClaimReceipt(
            tx_hash=tx_hash,
            route=Route.GASLESS,
            account=confirm_facilitator_echo(
                "creditor", response.get("creditor"), self._creditor
            ),
            network=response.get("network"),
            raw=response,
        )


class SelfFundedClaim:
    def __init__(self, ctx: ClientCtx, cycle_id: str, creditor: str) -> None:
        self._ctx = ctx
        self._cycle_id = cycle_id
        self._creditor = creditor

    async def send(
        self, wait_options: TxReceiptWaitOptions | None = None
    ) -> ClaimReceipt:
        action = await self._ctx.rpc.get_clearing_claim_net_credit_action(
            self._cycle_id, self._creditor
        )
        _checked_claim_call(action, self._creditor)
        gateway = await self._ctx.gateway()
        receipt = await gateway.claim_net_credit_for(
            clearing_house=action.contract_address,
            creditor=self._creditor,
            cycle_id=_cycle_id_bytes(action),
            amount=action.amount,
            proof=_proof_bytes(action),
            wait_options=wait_options,
        )
        return ClaimReceipt(
            tx_hash=receipt["transactionHash"],
            route=Route.SELF_FUNDED,
            account=self._creditor,
            raw=receipt,
        )
