import asyncio

import pytest

from fourmica_x402.recovery import recover_refused_payment

pytest.importorskip("fourmica_sdk")

USDC = "0x2222222222222222222222222222222222222222"
CYCLE = "0x" + "33" * 32
PAYER = "0x9999999999999999999999999999999999999999"


class StubPayment:
    def __init__(self):
        self.calls = []

    async def active_cycle(self, asset=None):
        self.calls.append(("active_cycle", asset))

    async def checkpoint_active_cycle(self, asset=None):
        self.calls.append(("checkpoint_active_cycle", asset))

    async def checkpoint_cycle(self, asset, cycle_id):
        self.calls.append(("checkpoint_cycle", asset, cycle_id))


class StubWait:
    def __init__(self):
        self.calls = []

    async def __call__(self, seconds):
        self.calls.append(seconds)


def recover(payment, reason, details=None, wait=None):
    extra = {"retryable": False, "details": details} if details is not None else None
    return asyncio.run(recover_refused_payment(payment, USDC, reason, extra, wait or StubWait()))


def cutoff_details(timestamp_cutoff, server_time):
    return {
        "cycle_id": CYCLE,
        "cycle_id_text": "7",
        "asset_address": USDC,
        "payer": PAYER,
        "timestamp": 1_700_000_000,
        "timestamp_cutoff": timestamp_cutoff,
        "cumulative_gross": "10",
        "server_time": server_time,
    }


def test_checkpoints_the_cycle_core_names():
    payment = StubPayment()
    details = {
        "cycle_id": CYCLE,
        "cycle_id_text": "7",
        "asset_address": USDC,
        "payer": PAYER,
        "uncheckpointed": 64,
        "max_uncheckpointed": 64,
    }

    assert recover(payment, "invalid_4mica_credit_checkpoint_required", details) is True
    assert payment.calls == [("checkpoint_cycle", USDC, CYCLE)]


def test_checkpoints_the_active_cycle_when_the_refusal_carries_no_details():
    payment = StubPayment()

    assert recover(payment, "invalid_4mica_credit_checkpoint_required") is True
    assert payment.calls == [("checkpoint_active_cycle", USDC)]


@pytest.mark.parametrize(
    "reason",
    [
        "invalid_4mica_credit_cycle_mismatch",
        "invalid_4mica_credit_future_timestamp",
        "invalid_4mica_credit_stale_timestamp",
    ],
)
def test_relearns_the_cycle_and_clock(reason):
    payment = StubPayment()

    assert recover(payment, reason) is True
    assert payment.calls == [("active_cycle", USDC)]


def test_waits_out_a_checkpoint_cutoff_before_signing_again():
    payment = StubPayment()
    wait = StubWait()

    recovered = recover(
        payment,
        "invalid_4mica_credit_timestamp_not_past_cutoff",
        cutoff_details(1_700_000_000, 1_700_000_000),
        wait,
    )

    assert recovered is True
    assert wait.calls == [2]
    assert payment.calls == [("active_cycle", USDC)]


def test_gives_up_on_a_cutoff_too_far_ahead():
    payment = StubPayment()
    wait = StubWait()

    recovered = recover(
        payment,
        "invalid_4mica_credit_timestamp_not_past_cutoff",
        cutoff_details(1_700_000_060, 1_700_000_000),
        wait,
    )

    assert recovered is False
    assert wait.calls == []
    assert payment.calls == []


@pytest.mark.parametrize(
    "reason",
    [
        "insufficient_funds",
        "invalid_4mica_credit_amount_mismatch",
        "invalid_4mica_credit_payer_suspended",
        "unexpected_settle_error",
        None,
    ],
)
def test_leaves_other_refusals_alone(reason):
    payment = StubPayment()

    assert recover(payment, reason) is False
    assert payment.calls == []
