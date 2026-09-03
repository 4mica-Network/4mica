"""Settling a clearing cycle: the debtor pays what they owe, the creditor
claims what they are owed. Both sides live here because they share a cycle's
terms and its proof format.

``settlement.pay(cycle_id)`` and ``settlement.claim(cycle_id)`` capture the
intent, a route pin (``gasless()``, ``eip3009()``, ``permit2()``,
``self_funded()``) narrows how, and a terminal (``send()``, ``sign()``,
``verify()``, ``approve()``, ``action()``) does it. A debit authorization
signed elsewhere attaches with ``authorization(...)``. The claim side
addresses someone else's credit with ``creditor(...)`` — an input, not a
different method: the payout goes to the address the committed leaf names
either way. Terms always come from core's prepared action, never from the
caller. Port of ``sdk-rust/src/client/settlement.rs``.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

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
        """Whether the gasless route is available at all."""
        return self._ctx.facilitator.is_configured()

    def pay(self, cycle_id: str) -> "PayBuilder":
        """Starts a net-debit payment for *cycle_id* (the text id or the
        0x-prefixed on-chain id). Nothing happens until a terminal runs."""
        return PayBuilder(self._ctx, str(cycle_id))

    def claim(self, cycle_id: str) -> "ClaimBuilder":
        """Starts a net-credit claim for *cycle_id*, for the signer's own
        credit unless ``creditor(...)`` redirects it."""
        return ClaimBuilder(self._ctx, str(cycle_id))


# --- shared validation ---------------------------------------------------


def _checked_pay_call(
    action: ClearingSettlementActionResponse, debtor: str
) -> ClearingSettlementActionResponse:
    """Core must have prepared a debit for this debtor, not some other action
    or participant — checked before any money moves."""
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
    """Validations shared by every gasless debit route: the terms must name
    this signer, and the cycle must settle in an ERC-20 — a native debit
    cannot be pulled by signature."""
    _checked_pay_call(action, debtor)
    if action.asset_address.lower() == ZERO_ADDRESS:
        raise InvalidParamsError(
            "native-asset debits cannot be paid gaslessly; use the self-funded route"
        )
    return action


def _cycle_id_bytes(action: ClearingSettlementActionResponse) -> bytes:
    return bytes.fromhex(action.cycle_id.removeprefix("0x"))


def _proof_bytes(action: ClearingSettlementActionResponse) -> List[bytes]:
    return [bytes.fromhex(item.removeprefix("0x")) for item in action.proof]


async def _pay_action(
    ctx: ClientCtx, cycle_id: str
) -> ClearingSettlementActionResponse:
    return await ctx.rpc.get_clearing_pay_net_debit_action(cycle_id, ctx.signer_address)


# --- pay -----------------------------------------------------------------


class PayBuilder:
    """A net-debit payment being built."""

    def __init__(self, ctx: ClientCtx, cycle_id: str) -> None:
        self._ctx = ctx
        self._cycle_id = cycle_id

    async def action(self) -> ClearingSettlementActionResponse:
        """The terms of the caller's net debit: where to pay, how much, and
        the proof the contract will check."""
        return await _pay_action(self._ctx, self._cycle_id)

    def gasless(self) -> "GaslessPay":
        """Pins "any gasless scheme": EIP-3009 first, then Permit2 with the
        approval sponsored, with no self-funded fallback."""
        return GaslessPay(self._ctx, self._cycle_id)

    def eip3009(self) -> "Eip3009Pay":
        """Pins the EIP-3009 route, failing rather than trying another scheme."""
        return Eip3009Pay(self._ctx, self._cycle_id)

    def permit2(self) -> "Permit2Pay":
        """Pins the Permit2 route, failing rather than trying another scheme."""
        return Permit2Pay(self._ctx, self._cycle_id)

    def self_funded(self) -> "SelfFundedPay":
        """Pins the caller's own transaction."""
        return SelfFundedPay(self._ctx, self._cycle_id)

    async def send(
        self, wait_options: Optional[TxReceiptWaitOptions] = None
    ) -> PayReceipt:
        """Pays the caller's committed net debit, gaslessly where possible.

        For an ERC-20 cycle with a facilitator configured, the caller signs an
        authorization for the exact amount and the facilitator submits and
        pays gas. Otherwise — a native-asset cycle, no facilitator, or no
        gasless scheme left — the caller's own transaction runs; a missing
        allowance is refused as Erc20AllowanceRequiredError rather than left
        to revert. A rejection that names the payment itself is returned
        rather than retried, and so is an unknown outcome: the facilitator may
        already have submitted, and a second payment would revert as
        AlreadyPaid after paying gas."""
        action = await _pay_action(self._ctx, self._cycle_id)
        if (
            not self._ctx.facilitator.is_configured()
            or action.asset_address.lower() == ZERO_ADDRESS
        ):
            return await _pay_self_funded(self._ctx, action, wait_options)
        try:
            return await _pay_gasless_with(self._ctx, self._cycle_id, action)
        except Permit2AllowanceRequiredError:
            # The approval cannot be sponsored, so gaslessness is off the
            # table either way; paying the debit directly is one transaction
            # rather than an approval plus a payment.
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
        """Pays gaslessly, over whichever signature scheme the cycle's token
        supports. ERC-20 cycles only: a native-asset debit cannot be pulled by
        signature. Fails rather than falling back to the caller's own
        transaction."""
        action = await _pay_action(self._ctx, self._cycle_id)
        return await _pay_gasless_with(self._ctx, self._cycle_id, action)


class Eip3009Pay:
    def __init__(self, ctx: ClientCtx, cycle_id: str) -> None:
        self._ctx = ctx
        self._cycle_id = cycle_id

    async def sign(self) -> ReceiveAuthorization:
        """Signs the debit authorization without submitting it. The signature
        binds the ClearingHouse, the exact amount, and — as its nonce — the
        cycle. Redeem with
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

    def authorization(self, authorization: ReceiveAuthorization) -> "AuthorizedPay":
        """Attaches a debit authorization signed elsewhere."""
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
        """Pays gaslessly with an EIP-3009 authorization, failing rather than
        trying another scheme."""
        action = await _pay_action(self._ctx, self._cycle_id)
        return await _pay_eip3009_with(self._ctx, self._cycle_id, action)


class Permit2Pay:
    def __init__(self, ctx: ClientCtx, cycle_id: str) -> None:
        self._ctx = ctx
        self._cycle_id = cycle_id

    def sponsor_approval(self) -> "SponsoredPermit2Pay":
        """Upgrades the pin to sign the missing Permit2 approval (EIP-2612)
        rather than fail on it."""
        return SponsoredPermit2Pay(self._ctx, self._cycle_id)

    async def sign(self) -> Permit2Authorization:
        """Signs the Permit2 debit authorization without submitting it."""
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

    def authorization(self, authorization: Permit2Authorization) -> "AuthorizedPay":
        """Attaches a Permit2 debit authorization signed elsewhere."""
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
        """Pays gaslessly through Permit2, failing rather than trying another
        scheme. Not gasless on its own: without the debtor's one-time
        ``approve(PERMIT2, ...)`` this fails with
        Permit2AllowanceRequiredError."""
        action = await _pay_action(self._ctx, self._cycle_id)
        return await _submit_permit2_pay(self._ctx, self._cycle_id, action, None)


class SponsoredPermit2Pay:
    def __init__(self, ctx: ClientCtx, cycle_id: str) -> None:
        self._ctx = ctx
        self._cycle_id = cycle_id

    async def send(self) -> PayReceipt:
        """Pays through Permit2, signing the missing approval rather than
        transacting for it. Still costs the debtor nothing."""
        action = await _pay_action(self._ctx, self._cycle_id)
        return await _pay_sponsored_permit2_with(self._ctx, self._cycle_id, action)


class AuthorizedPay:
    def __init__(
        self,
        ctx: ClientCtx,
        cycle_id: str,
        method_payload: Dict[str, Any],
        route: TokenRoute,
        debtor: str,
    ) -> None:
        self._ctx = ctx
        self._cycle_id = cycle_id
        self._method_payload = method_payload
        self._route = route
        self._debtor = debtor

    def _request(self) -> Dict[str, Any]:
        return {"cycleId": self._cycle_id, **self._method_payload}

    async def verify(self) -> None:
        """Preflight: runs every check a real submission would run, without
        spending anyone's gas."""
        response = await self._ctx.facilitator.post(
            "clearing/pay/verify", self._request()
        )
        if response.get("isValid"):
            return
        raise rejection_error(response, response.get("invalidReason"))

    async def send(self) -> PayReceipt:
        """Pays the committed net debit with the attached authorization. The
        submitter needs no signer of their own: the facilitator resolves the
        debit's terms from core, and the signature fixes whose funds move."""
        return await _submit_pay(self._ctx, self._request(), self._route, self._debtor)


class SelfFundedPay:
    def __init__(self, ctx: ClientCtx, cycle_id: str) -> None:
        self._ctx = ctx
        self._cycle_id = cycle_id

    async def approve(
        self, wait_options: Optional[TxReceiptWaitOptions] = None
    ) -> Optional[Dict[str, Any]]:
        """Approves the settling ClearingHouse to pull exactly the committed
        debit, which a self-funded ERC-20 pay needs before ``send()``. Token,
        spender and amount all come from the cycle's prepared action."""
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
        self, wait_options: Optional[TxReceiptWaitOptions] = None
    ) -> PayReceipt:
        """Pays the caller's committed net debit with their own transaction.
        For ERC-20 cycles, grant the allowance with :meth:`approve` first — a
        missing one is refused here rather than left to revert inside the
        token."""
        action = await _pay_action(self._ctx, self._cycle_id)
        return await _pay_self_funded(self._ctx, action, wait_options)


async def _pay_gasless_with(
    ctx: ClientCtx, cycle_id: str, action: ClearingSettlementActionResponse
) -> PayReceipt:
    # EIP-3009 is the cheaper route, but nothing says up front whether the
    # token implements it — so try it and read the answer off the rejection,
    # which costs no gas.
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
    # Try the plain route first: the debtor may already have approved, in
    # which case a permit is pointless and only costs the submitter a no-op.
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
            # Without a token domain separator the approval cannot be
            # sponsored from here — the same dead end as a token with no
            # EIP-2612 surface, and reported the same way.
            raise Permit2AllowanceRequiredError(str(rejection), None) from None
        return await _submit_permit2_pay(ctx, cycle_id, action, permit)


async def _submit_permit2_pay(
    ctx: ClientCtx,
    cycle_id: str,
    action: ClearingSettlementActionResponse,
    permit: Optional[Eip2612Permit],
) -> PayReceipt:
    action = _checked_gasless_pay(action, ctx.signer_address)
    authorization = await sig.debit_permit2_authorization(
        ctx,
        action.asset_address,
        action.contract_address,
        action.amount,
        action.cycle_id,
    )
    request: Dict[str, Any] = {
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
    ctx: ClientCtx, request: Dict[str, Any], route: TokenRoute, debtor: str
) -> PayReceipt:
    response = await ctx.facilitator.post("clearing/pay", request)
    if not response.get("success"):
        raise rejection_error(response, response.get("error"))

    tx_hash = response.get("txHash")
    if not isinstance(tx_hash, str) or not tx_hash.startswith("0x"):
        raise OutcomeUnknownError("facilitator reported success without a txHash")

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
    wait_options: Optional[TxReceiptWaitOptions],
) -> PayReceipt:
    return await _pay_self_funded(ctx, action, wait_options)


async def _pay_self_funded(
    ctx: ClientCtx,
    action: ClearingSettlementActionResponse,
    wait_options: Optional[TxReceiptWaitOptions],
) -> PayReceipt:
    action = _checked_pay_call(action, ctx.signer_address)
    gateway = await ctx.gateway()

    # Pre-check the ERC-20 allowance the token pull needs, so a debtor who
    # has not approved the ClearingHouse is told exactly that instead of
    # getting an opaque revert from inside the token.
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


# --- claim ---------------------------------------------------------------


class ClaimBuilder:
    """A net-credit claim being built. Takes no signature on any route: the
    on-chain payout goes to the address the committed leaf names, for the
    amount that leaf fixes, so a submitter can neither redirect the payout nor
    inflate it. The only question is who pays the gas."""

    def __init__(
        self, ctx: ClientCtx, cycle_id: str, creditor: Optional[str] = None
    ) -> None:
        self._ctx = ctx
        self._cycle_id = cycle_id
        self._creditor = creditor

    def creditor(self, creditor: str) -> "ClaimBuilder":
        """Claims *creditor*'s committed net credit rather than the signer's
        own, paying them rather than anyone else."""
        self._creditor = normalize_address(creditor)
        return self

    def _resolved_creditor(self) -> str:
        return self._creditor or self._ctx.signer_address

    async def action(self) -> ClearingSettlementActionResponse:
        """The terms of the creditor's net credit for this cycle."""
        return await self._ctx.rpc.get_clearing_claim_net_credit_action(
            self._cycle_id, self._resolved_creditor()
        )

    def gasless(self) -> "GaslessClaim":
        """Pins the gasless route: the facilitator submits and pays, with no
        self-funded fallback."""
        return GaslessClaim(self._ctx, self._cycle_id, self._resolved_creditor())

    def self_funded(self) -> "SelfFundedClaim":
        """Pins the caller's own transaction."""
        return SelfFundedClaim(self._ctx, self._cycle_id, self._resolved_creditor())

    async def send(
        self, wait_options: Optional[TxReceiptWaitOptions] = None
    ) -> ClaimReceipt:
        """Claims the committed net credit, gaslessly where possible. A
        rejection that names the claim itself — an unfunded cycle, say — is
        returned rather than retried, since the caller's own transaction would
        revert for the same reason after paying for the privilege."""
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

    def _request(self) -> Dict[str, Any]:
        return {"cycleId": self._cycle_id, "creditor": self._creditor}

    async def verify(self) -> None:
        """Preflight: runs every check a real submission would run, without
        spending anyone's gas."""
        response = await self._ctx.facilitator.post(
            "clearing/claim/verify", self._request()
        )
        if response.get("isValid"):
            return
        raise rejection_error(response, response.get("invalidReason"))

    async def send(self) -> ClaimReceipt:
        """Claims the committed net credit gaslessly. Nothing is signed and
        nothing local is trusted: the facilitator asks core for the committed
        leaf's terms, so this call can only name *which* claim to submit, not
        what it pays."""
        response = await self._ctx.facilitator.post("clearing/claim", self._request())
        if not response.get("success"):
            raise rejection_error(response, response.get("error"))

        tx_hash = response.get("txHash")
        if not isinstance(tx_hash, str) or not tx_hash.startswith("0x"):
            raise OutcomeUnknownError("facilitator reported success without a txHash")

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
        self, wait_options: Optional[TxReceiptWaitOptions] = None
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
