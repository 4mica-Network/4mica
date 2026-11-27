import os

import pytest
from live_stack import (
    cycle_text_ids,
    ensure_collateral,
    is_pending_cycle_error,
    poll,
    requires_live_stack,
    signed_payment,
    wait_for_onchain_cycle,
)

from fourmica_sdk import ClearingSettlementAction, RpcError
from fourmica_sdk.client.model import Route, TokenRoute

pytestmark = [
    pytest.mark.integration,
    requires_live_stack,
    pytest.mark.skipif(
        os.environ.get("E2E_CLEARING") != "1",
        reason="set E2E_CLEARING=1 to run the slow clearing-settlement test",
    ),
]

COLLATERAL = 10**15


async def test_cycle_settles_through_pay_and_claim(payer, recipient):
    await ensure_collateral(payer, None, COLLATERAL)

    request = await signed_payment(payer, recipient)
    receipt = await recipient.payment.issue_guarantee(request)
    verified = recipient.payment.verify_guarantee(receipt)

    candidates = cycle_text_ids(None, request.payload.timestamp)
    timeout = int(os.environ.get("E2E_CLEARING_TIMEOUT", "1500"))

    async def committed_pay_action():
        for cycle_id in candidates:
            try:
                action = await payer.settlement.pay(cycle_id).action()
            except RpcError as exc:
                if is_pending_cycle_error(exc):
                    continue
                raise
            return cycle_id, action
        return None

    prepared = await poll(committed_pay_action, timeout=timeout, interval=15)
    assert prepared is not None, (
        f"no committed cycle among {candidates} within {timeout}s; is the "
        "settlement scheduler running with short windows?"
    )
    cycle_id, pay_action = prepared

    assert pay_action.function_name == "payNetDebit"
    assert pay_action.action == ClearingSettlementAction.PAY_NET_DEBIT
    assert pay_action.participant.lower() == payer.signer_address.lower()
    assert int(pay_action.cycle_id, 16) == verified.cycle_id
    assert pay_action.amount >= verified.amount
    assert pay_action.proof, "committed cycle carries no Merkle proof"

    onchain_cycle = await wait_for_onchain_cycle(payer, pay_action, timeout=timeout)
    assert onchain_cycle is not None, (
        "the scheduler never committed the cycle on the ClearingHouse"
    )

    pay_receipt = await payer.settlement.pay(cycle_id).send()
    assert pay_receipt.route == TokenRoute.SELF_FUNDED
    assert pay_receipt.account == payer.signer_address
    assert pay_receipt.tx_hash.startswith("0x")

    claim_action = await recipient.settlement.claim(cycle_id).action()
    assert claim_action.function_name == "claimNetCreditFor"
    assert claim_action.participant.lower() == recipient.signer_address.lower()
    assert claim_action.amount >= verified.amount

    claim_receipt = await recipient.settlement.claim(cycle_id).send()
    assert claim_receipt.route == Route.SELF_FUNDED
    assert claim_receipt.account == recipient.signer_address
    assert claim_receipt.tx_hash.startswith("0x")

    proof = await recipient._ctx.rpc.get_clearing_participant_proof(
        cycle_id, recipient.signer_address
    )
    assert proof.net_credit >= verified.amount
    assert proof.merkle_root.startswith("0x")
