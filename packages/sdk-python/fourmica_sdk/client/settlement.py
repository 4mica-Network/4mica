"""Settling a clearing cycle: the debtor pays what they owe, the creditor
claims what they are owed. Both sides live here because they share a cycle's
terms and its proof format.

``settlement.pay(cycle_id)`` and ``settlement.claim(cycle_id)`` capture the
intent; a route pin (``self_funded()`` — gasless routes arrive with facilitator
sponsorship) narrows how; a terminal (``send()``, ``approve()``, ``action()``)
does it. Terms always come from core's prepared action, never from the caller:
this code can only name *which* cycle to settle, not what it pays.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from ..errors import Erc20AllowanceRequiredError, InvalidParamsError
from ..models import (
    ZERO_ADDRESS,
    ClearingSettlementActionResponse,
    TxReceiptWaitOptions,
)
from .ctx import ClientCtx
from .model import ClaimReceipt, PayReceipt, Route, TokenRoute, confirm_echoed


class SettlementClient:
    def __init__(self, ctx: ClientCtx) -> None:
        self._ctx = ctx

    def pay(self, cycle_id: str) -> "PayBuilder":
        """Starts a net-debit payment for *cycle_id* (the text id or the
        0x-prefixed on-chain id). Nothing happens until a terminal runs."""
        return PayBuilder(self._ctx, str(cycle_id))

    def claim(self, cycle_id: str) -> "ClaimBuilder":
        """Starts a net-credit claim for *cycle_id*, for the signer's own
        credit unless ``creditor(...)`` redirects it."""
        return ClaimBuilder(self._ctx, str(cycle_id))


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


def _cycle_id_bytes(action: ClearingSettlementActionResponse) -> bytes:
    return bytes.fromhex(action.cycle_id.removeprefix("0x"))


def _proof_bytes(action: ClearingSettlementActionResponse) -> List[bytes]:
    return [bytes.fromhex(item.removeprefix("0x")) for item in action.proof]


class PayBuilder:
    """A net-debit payment being built."""

    def __init__(self, ctx: ClientCtx, cycle_id: str) -> None:
        self._ctx = ctx
        self._cycle_id = cycle_id

    async def action(self) -> ClearingSettlementActionResponse:
        """The terms of the caller's net debit: where to pay, how much, and
        the proof the contract will check."""
        return await self._ctx.rpc.get_clearing_pay_net_debit_action(
            self._cycle_id, self._ctx.signer_address
        )

    def self_funded(self) -> "SelfFundedPay":
        """Pins the caller's own transaction."""
        return SelfFundedPay(self._ctx, self._cycle_id)

    async def send(
        self, wait_options: Optional[TxReceiptWaitOptions] = None
    ) -> PayReceipt:
        """Pays the caller's committed net debit with their own transaction.
        (Facilitator-sponsored gasless routes arrive in a later release; until
        then the auto route is self-funded.)"""
        return await self.self_funded().send(wait_options)


class SelfFundedPay:
    def __init__(self, ctx: ClientCtx, cycle_id: str) -> None:
        self._ctx = ctx
        self._cycle_id = cycle_id

    async def _action(self) -> ClearingSettlementActionResponse:
        action = await self._ctx.rpc.get_clearing_pay_net_debit_action(
            self._cycle_id, self._ctx.signer_address
        )
        return _checked_pay_call(action, self._ctx.signer_address)

    async def approve(
        self, wait_options: Optional[TxReceiptWaitOptions] = None
    ) -> Optional[Dict[str, Any]]:
        """Approves the settling ClearingHouse to pull exactly the committed
        debit, which a self-funded ERC-20 pay needs before ``send()``. Token,
        spender and amount all come from the cycle's prepared action."""
        action = await self._action()
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
        For ERC-20 cycles, grant the allowance with :meth:`approve` first —
        a missing one is refused here rather than left to revert inside the
        token."""
        action = await self._action()
        gateway = await self._ctx.gateway()

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
            account=self._ctx.signer_address,
            raw=receipt,
        )


class ClaimBuilder:
    """A net-credit claim being built. Takes no signature: the on-chain payout
    goes to the address the committed leaf names, for the amount that leaf
    fixes, so a submitter can neither redirect the payout nor inflate it."""

    def __init__(
        self, ctx: ClientCtx, cycle_id: str, creditor: Optional[str] = None
    ) -> None:
        self._ctx = ctx
        self._cycle_id = cycle_id
        self._creditor = creditor

    def creditor(self, creditor: str) -> "ClaimBuilder":
        """Claims *creditor*'s committed net credit rather than the signer's
        own, paying them rather than anyone else."""
        from ..utils import normalize_address

        self._creditor = normalize_address(creditor)
        return self

    def _resolved_creditor(self) -> str:
        return self._creditor or self._ctx.signer_address

    async def action(self) -> ClearingSettlementActionResponse:
        """The terms of the creditor's net credit for this cycle."""
        return await self._ctx.rpc.get_clearing_claim_net_credit_action(
            self._cycle_id, self._resolved_creditor()
        )

    def self_funded(self) -> "SelfFundedClaim":
        """Pins the caller's own transaction."""
        return SelfFundedClaim(self._ctx, self._cycle_id, self._resolved_creditor())

    async def send(
        self, wait_options: Optional[TxReceiptWaitOptions] = None
    ) -> ClaimReceipt:
        """Claims the committed net credit with the caller's own transaction.
        (Facilitator-sponsored gasless routes arrive in a later release.)"""
        return await self.self_funded().send(wait_options)


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
