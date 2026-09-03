"""Full settlement-cycle clearing against a live stack, riding the real
scheduler: issue a guarantee, wait for its cycle to close, net, and commit
on-chain, then settle both sides through the SDK — the debtor pays the net
debit, the creditor claims the net credit.

Slow by construction (a full cycle window plus netting and commit — roughly
SETTLEMENT_CYCLE_SECS + resolution cutoff + commit delay), so it is gated
behind E2E_CLEARING=1 on top of the usual SDK_LOCAL_E2E=1. Run the stack with
short windows (e.g. SETTLEMENT_CYCLE_SECS=600) and give pytest no global
timeout. Unlike 4mica-core's own integration tests, no backdated cycle is
injected into the DB — what settles here is exactly what the scheduler
committed.

See live_stack.py for environment and the required WalletRole grant.
"""

import os

import pytest
from live_stack import (
    build_claims,
    cycle_text_ids,
    ensure_collateral,
    is_pending_cycle_error,
    poll,
    requires_live_stack,
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

    claims = build_claims(payer, recipient)
    signature = await payer.payment.sign_request(claims)
    cert = await recipient.payment.issue_guarantee(claims, signature)
    verified = recipient.payment.verify_guarantee(cert)

    candidates = cycle_text_ids(None, claims.timestamp)
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

    # Core prepared the debit for this debtor, in the cycle the certificate
    # named, covering at least the guarantee issued above (earlier guarantees
    # in the same window aggregate into the same net position).
    assert pay_action.function_name == "payNetDebit"
    assert pay_action.action == ClearingSettlementAction.PAY_NET_DEBIT
    assert pay_action.participant.lower() == payer.signer_address.lower()
    assert int(pay_action.cycle_id, 16) == verified.cycle_id
    assert pay_action.amount >= claims.amount
    assert pay_action.proof, "committed cycle carries no Merkle proof"

    # The action can be served before commitCycle lands on-chain; pay only
    # once the ClearingHouse knows the cycle, or the preflight reverts
    # CycleNotFound.
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
    assert claim_action.amount >= claims.amount

    claim_receipt = await recipient.settlement.claim(cycle_id).send()
    assert claim_receipt.route == Route.SELF_FUNDED
    assert claim_receipt.account == recipient.signer_address
    assert claim_receipt.tx_hash.startswith("0x")

    # Reconciliation read: the recipient can fetch its own committed proof.
    proof = await recipient._ctx.rpc.get_clearing_participant_proof(
        cycle_id, recipient.signer_address
    )
    assert proof.net_credit >= claims.amount
    assert proof.merkle_root.startswith("0x")
