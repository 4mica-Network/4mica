import secrets

from eth_account import Account
from fourmica_sdk import GuaranteeReceipt
from stack import Stack, settlement_of


def test_pays_for_a_request_and_hands_back_a_receipt_that_verifies(stack: Stack, seller: str):
    response = stack.buyer(stack.payer_key).get(seller)

    assert response.status_code == 200
    assert response.json() == {"paid": True}
    settlement = settlement_of(response)
    assert settlement is not None and settlement.success

    receipt = GuaranteeReceipt.from_rpc(settlement.extra["receipt"])
    guarantee, payer = stack.on_core(
        stack.payer_key,
        lambda client: (client.payment.verify_guarantee(receipt), client.signer_address),
    )
    assert guarantee.client.lower() == payer.lower()
    assert guarantee.recipient.lower() == stack.pay_to.lower()
    assert guarantee.amount == 1


def test_hands_the_facilitators_refusal_to_the_payer(stack: Stack, seller: str):
    # Signs a valid payment, but has never deposited anything.
    stranger = "0x" + secrets.token_hex(32)
    response = stack.buyer(stranger).get(seller)

    assert response.status_code == 402
    settlement = settlement_of(response)
    assert settlement is not None
    assert settlement.success is False
    assert settlement.error_reason == "invalid_4mica_credit_payer_not_registered"
    assert settlement.error_message
    assert settlement.extra["retryable"] is False
    assert settlement.extra["details"]["user"].lower() == Account.from_key(stranger).address.lower()


def test_checkpoints_when_core_asks_for_one_then_pays_on_the_retry(stack: Stack, seller: str):
    session = stack.buyer(stack.payer_key)
    limit = stack.max_uncheckpointed
    cycle = stack.on_core(stack.payer_key, lambda client: client.payment.active_cycle(stack.asset))
    assert cycle.max_uncheckpointed == limit
    # Core counts uncheckpointed payments per cycle, so start on one this payer has not paid in.
    stack.await_next_cycle(stack.payer_key)

    for _ in range(limit):
        assert session.get(seller).status_code == 200
    before = stack.on_core(
        stack.payer_key, lambda client: client.payment.checkpoint_batch(stack.asset)
    )
    assert len(before.authorizations) == limit

    # One past the limit: core refuses it until the payer checkpoints.
    response = session.get(seller)

    assert response.status_code == 200
    assert settlement_of(response).success
    after = stack.on_core(
        stack.payer_key, lambda client: client.payment.checkpoint_batch(stack.asset)
    )
    assert after.cycle_id == before.cycle_id
    assert after.previous is not None
    assert len(after.authorizations) == 1
