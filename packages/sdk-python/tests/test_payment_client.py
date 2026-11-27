from types import SimpleNamespace
from typing import Any

import pytest
from eth_account import Account
from stubs import (
    CLEARING_HOUSE_ADDRESS,
    TEST_ADDRESS,
    TEST_PRIVATE_KEY,
    TOKEN_ADDRESS,
    make_ctx,
)

import fourmica_sdk.client.ctx as ctx_module
import fourmica_sdk.client.payment as payment_module
from fourmica_sdk.client.model import Asset
from fourmica_sdk.client.payment import PaymentClient, checkpoint_payload
from fourmica_sdk.errors import (
    CheckpointMismatchError,
    CheckpointRequiredError,
    CycleMismatchError,
    FutureTimestampError,
    RpcError,
    StaleTimestampError,
    TimestampNotPastCutoffError,
    UntrustedCheckpointBatchError,
)
from fourmica_sdk.guarantee import clearing_house_domain_separator
from fourmica_sdk.models import (
    ActiveCycleResponse,
    CheckpointAcceptedResponse,
    CheckpointBatchResponse,
    CheckpointPayload,
    PaymentRequest,
    PaymentRequestPayload,
    SignedCheckpoint,
)
from fourmica_sdk.utils import ValidationError

ZERO = "0x0000000000000000000000000000000000000000"
RECIPIENT = "0x00000000000000000000000000000000000000Be"
STRANGER = "0x00000000000000000000000000000000000000aA"
CYCLE = "0x" + "11" * 32
NEXT_CYCLE = "0x" + "22" * 32
PAYER = Account.from_key(TEST_PRIVATE_KEY)
DOMAIN = clearing_house_domain_separator(84532, CLEARING_HOUSE_ADDRESS)


def payment(timestamp: int, amount: int = 10, **overrides) -> PaymentRequestPayload:
    values: dict = {
        "user_address": PAYER.address,
        "recipient_address": RECIPIENT,
        "cycle_id": CYCLE,
        "req_id": timestamp,
        "amount": amount,
        "asset_address": ZERO,
        "timestamp": timestamp,
        "salt": "0x" + "22" * 32,
    }
    values.update(overrides)
    return PaymentRequestPayload(**values)


def signed(payload: PaymentRequestPayload) -> PaymentRequest:
    signature = PAYER.unsafe_sign_hash(payload.signing_digest(DOMAIN))
    return PaymentRequest(payload=payload, signature="0x" + signature.signature.hex())


def previous_checkpoint(gross: int, cutoff: int) -> SignedCheckpoint:
    payload = CheckpointPayload(
        payer=PAYER.address,
        cycle_id=CYCLE,
        asset_address=ZERO,
        cumulative_gross=gross,
        timestamp_cutoff=cutoff,
    )
    signature = PAYER.unsafe_sign_hash(payload.signing_digest(DOMAIN))
    return SignedCheckpoint(payload=payload, signature="0x" + signature.signature.hex())


def batch(*authorizations, previous=None, **overrides) -> CheckpointBatchResponse:
    values: dict = {
        "cycle_id": CYCLE,
        "cycle_id_text": "text",
        "asset_address": ZERO,
        "payer": PAYER.address,
        "previous": previous,
        "authorizations": list(authorizations),
    }
    values.update(overrides)
    return CheckpointBatchResponse(**values)


def accepted(cutoff: int, covered: int = 1) -> CheckpointAcceptedResponse:
    return CheckpointAcceptedResponse(
        cycle_id=CYCLE,
        cycle_id_text="text",
        asset_address=ZERO,
        payer=PAYER.address,
        cumulative_gross=10,
        timestamp_cutoff=cutoff,
        covered=covered,
    )


def cycle(server_time: int = 0, period_start: int = 1_700_000_000):
    return ActiveCycleResponse(
        cycle_id=CYCLE,
        cycle_id_text="text",
        asset_address=ZERO,
        period_start=period_start,
        period_end=2**40,
        server_time=server_time,
    )


class Rpc:
    def __init__(self, **behaviour: Any) -> None:
        self.behaviour = behaviour
        self.calls: list[tuple] = []

    def _answer(self, name: str, *args: Any) -> Any:
        self.calls.append((name, *args))
        value = self.behaviour[name]
        if isinstance(value, list):
            value = value.pop(0)
        if isinstance(value, Exception):
            raise value
        return value

    async def issue_guarantee(self, request):
        return self._answer("issue_guarantee", request)

    async def submit_checkpoint(self, signed_checkpoint):
        return self._answer("submit_checkpoint", signed_checkpoint)

    async def get_checkpoint_batch(self, payer, asset, cycle_id=None):
        return self._answer("checkpoint_batch", payer, asset, cycle_id)

    async def get_active_cycle(self, asset):
        return self._answer("active_cycle", asset)

    async def list_recipient_payments(self, recipient):
        return self._answer("recipient_payments", recipient)

    async def list_payer_guarantees(self, payer, cycle_id, limit=None, after=None):
        return self._answer("payer_guarantees", payer, cycle_id, limit, after)


def client(rpc: Rpc | None = None) -> PaymentClient:
    return PaymentClient(make_ctx(rpc=rpc or Rpc()))


def clock(monkeypatch, seconds: float) -> None:
    monkeypatch.setattr(ctx_module, "_local_now_ms", lambda: int(seconds * 1000))


def refusal(code: str | None, details: Any = None, message: str = "refused"):
    return RpcError(message, status_code=409, code=code, details=details)


async def test_checkpoint_batch_reads_the_signers_batch_for_the_active_cycle():
    expected = batch()
    rpc = Rpc(checkpoint_batch=expected)
    assert await client(rpc).checkpoint_batch(TOKEN_ADDRESS.lower()) is expected
    assert rpc.calls == [("checkpoint_batch", TEST_ADDRESS, TOKEN_ADDRESS, None)]


async def test_checkpoint_batch_defaults_to_the_native_asset():
    rpc = Rpc(checkpoint_batch=batch())
    await client(rpc).checkpoint_batch()
    assert rpc.calls == [("checkpoint_batch", TEST_ADDRESS, ZERO, None)]


async def test_checkpoint_batch_takes_an_asset_object():
    rpc = Rpc(checkpoint_batch=batch())
    await client(rpc).checkpoint_batch(Asset.erc20(TOKEN_ADDRESS))
    assert rpc.calls[0][2] == TOKEN_ADDRESS


async def test_checkpoint_batch_refuses_a_malformed_asset_before_reading():
    rpc = Rpc(checkpoint_batch=batch())
    with pytest.raises(ValidationError):
        await client(rpc).checkpoint_batch("0x1234")
    assert rpc.calls == []


async def test_checkpoint_batch_for_cycle_names_the_cycle():
    rpc = Rpc(checkpoint_batch=batch())
    await client(rpc).checkpoint_batch_for_cycle(None, NEXT_CYCLE)
    assert rpc.calls == [("checkpoint_batch", TEST_ADDRESS, ZERO, NEXT_CYCLE)]


async def test_list_received_lists_payments_to_the_signer():
    rpc = Rpc(recipient_payments=[[]])
    assert await client(rpc).list_received() == []
    assert rpc.calls == [("recipient_payments", TEST_ADDRESS)]


async def test_list_issued_passes_the_page_cursor_through():
    rpc = Rpc(payer_guarantees="page")
    assert await client(rpc).list_issued(CYCLE, limit=5, after="cur") == "page"
    assert rpc.calls == [("payer_guarantees", TEST_ADDRESS, CYCLE, 5, "cur")]


async def test_active_cycle_reads_fresh_and_syncs_the_clock(monkeypatch):
    clock(monkeypatch, 1_000)
    response = cycle(server_time=2_000)
    rpc = Rpc(active_cycle=[response, cycle(server_time=2_001)])
    payments = client(rpc)
    assert await payments.active_cycle() is response
    assert payments._ctx.core_now() == 2_000
    await payments.active_cycle(TOKEN_ADDRESS)
    assert rpc.calls == [("active_cycle", ZERO), ("active_cycle", TOKEN_ADDRESS)]


async def test_new_payment_is_stamped_no_earlier_than_the_cycle_start(monkeypatch):
    clock(monkeypatch, 1_000)
    rpc = Rpc(active_cycle=cycle(period_start=5_000))
    payload = await client(rpc).new_payment(RECIPIENT.lower(), 10)
    assert payload.timestamp == 5_000
    assert payload.recipient_address == RECIPIENT
    assert payload.user_address == TEST_ADDRESS
    assert payload.cycle_id == CYCLE
    assert payload.asset_address == ZERO
    assert 0 <= payload.req_id < 2**256


async def test_new_payment_uses_core_time_when_the_cycle_has_started(monkeypatch):
    clock(monkeypatch, 1_000)
    rpc = Rpc(active_cycle=cycle(server_time=9_000, period_start=1))
    payload = await client(rpc).new_payment(RECIPIENT, 10, TOKEN_ADDRESS)
    assert payload.timestamp == 9_000
    assert payload.asset_address == TOKEN_ADDRESS


async def test_new_payment_refuses_a_malformed_recipient(monkeypatch):
    clock(monkeypatch, 1_000)
    with pytest.raises(ValidationError, match="recipient"):
        await client(Rpc(active_cycle=cycle())).new_payment("0xnope", 10)


async def test_new_payment_waits_until_past_the_last_checkpoint_cutoff(monkeypatch):
    now = {"ms": 1_000_400}
    monkeypatch.setattr(ctx_module, "_local_now_ms", lambda: now["ms"])
    slept: list[float] = []
    shortfalls = [100, 0]

    async def sleep(seconds: float) -> None:
        slept.append(seconds)
        now["ms"] += round(seconds * 1000) - shortfalls.pop(0)

    monkeypatch.setattr(payment_module, "asyncio", SimpleNamespace(sleep=sleep))
    payments = client(Rpc(active_cycle=cycle(period_start=1)))
    payments._ctx.record_payment_cutoff(ZERO, 1_000)
    payload = await payments.new_payment(RECIPIENT, 10)
    assert payload.timestamp == 1_001
    assert slept == [0.6, 0.1]


async def test_new_payment_does_not_wait_once_past_the_cutoff(monkeypatch):
    clock(monkeypatch, 1_001)

    async def never(seconds: float) -> None:
        raise AssertionError(seconds)

    monkeypatch.setattr(payment_module, "asyncio", SimpleNamespace(sleep=never))
    payments = client(Rpc(active_cycle=cycle(period_start=1)))
    payments._ctx.record_payment_cutoff(ZERO, 1_000)
    assert (await payments.new_payment(RECIPIENT, 10)).timestamp == 1_001


async def test_submit_checkpoint_records_the_accepted_cutoff():
    payments = client(Rpc(submit_checkpoint=accepted(cutoff=1_234)))
    checkpoint = previous_checkpoint(10, 1_234)
    assert (await payments.submit_checkpoint(checkpoint)).timestamp_cutoff == 1_234
    assert payments._ctx.payment_cutoff(ZERO) == 1_234


async def test_a_refused_checkpoint_records_no_cutoff():
    payments = client(Rpc(submit_checkpoint=refusal("SOMETHING_ELSE")))
    with pytest.raises(RpcError):
        await payments.submit_checkpoint(previous_checkpoint(10, 1_234))
    assert payments._ctx.payment_cutoff(ZERO) is None


async def test_checkpoint_cycle_signs_and_submits_the_batch():
    rpc = Rpc(
        checkpoint_batch=batch(signed(payment(100)), signed(payment(105, 5))),
        submit_checkpoint=accepted(cutoff=105, covered=2),
    )
    assert (await client(rpc).checkpoint_cycle(None, CYCLE)).covered == 2
    submitted = rpc.calls[-1][1]
    assert submitted.payload.cumulative_gross == 15
    assert submitted.payload.timestamp_cutoff == 105
    digest = submitted.payload.signing_digest(DOMAIN)
    assert Account._recover_hash(digest, signature=submitted.signature) == TEST_ADDRESS


async def test_checkpoint_cycle_with_nothing_to_cover_submits_nothing():
    rpc = Rpc(checkpoint_batch=batch())
    assert await client(rpc).checkpoint_cycle(None, CYCLE) is None
    assert [call[0] for call in rpc.calls] == ["checkpoint_batch"]


def mismatch() -> RpcError:
    return refusal(
        "CHECKPOINT_MISMATCH",
        {
            "cycle_id": CYCLE,
            "cycle_id_text": "text",
            "asset_address": ZERO,
            "payer": TEST_ADDRESS,
        },
        "checkpoint refused: cumulative gross is stale",
    )


async def test_a_mismatched_checkpoint_is_rebuilt_and_sent_once_more():
    rpc = Rpc(
        checkpoint_batch=[batch(signed(payment(100))), batch(signed(payment(101)))],
        submit_checkpoint=[mismatch(), accepted(cutoff=101)],
    )
    assert (await client(rpc).checkpoint_cycle(None, CYCLE)).timestamp_cutoff == 101
    assert [call[0] for call in rpc.calls] == [
        "checkpoint_batch",
        "submit_checkpoint",
        "checkpoint_batch",
        "submit_checkpoint",
    ]


async def test_a_second_mismatch_is_raised_rather_than_looping():
    rpc = Rpc(
        checkpoint_batch=batch(signed(payment(100))),
        submit_checkpoint=mismatch(),
    )
    with pytest.raises(CheckpointMismatchError) as raised:
        await client(rpc).checkpoint_cycle(None, CYCLE)
    assert raised.value.reason == "cumulative gross is stale"
    assert raised.value.status_code == 409
    assert raised.value.code == "CHECKPOINT_MISMATCH"
    assert [call[0] for call in rpc.calls].count("submit_checkpoint") == 2


async def test_checkpoint_active_cycle_checkpoints_the_cached_cycle(monkeypatch):
    clock(monkeypatch, 1_000)
    rpc = Rpc(active_cycle=cycle(), checkpoint_batch=batch())
    assert await client(rpc).checkpoint_active_cycle() is None
    assert rpc.calls == [
        ("active_cycle", ZERO),
        ("checkpoint_batch", TEST_ADDRESS, ZERO, CYCLE),
    ]


async def issue_refused_with(error: RpcError, payments: PaymentClient | None = None):
    payments = payments or client(Rpc(issue_guarantee=error))
    with pytest.raises(RpcError) as raised:
        await payments.issue_guarantee(signed(payment(100)))
    return raised.value, payments


@pytest.mark.parametrize(
    "code",
    [
        "CYCLE_MISMATCH",
        "FUTURE_TIMESTAMP",
        "STALE_TIMESTAMP",
        "TIMESTAMP_NOT_PAST_CUTOFF",
        "CHECKPOINT_REQUIRED",
        "CHECKPOINT_MISMATCH",
    ],
)
@pytest.mark.parametrize("details", [None, "text", [], {}, {"timestamp": "x"}])
async def test_a_coded_refusal_without_readable_details_stays_a_plain_rpc_error(
    code, details
):
    error = refusal(code, details)
    raised, _ = await issue_refused_with(error)
    assert raised is error
    assert type(raised) is RpcError


@pytest.mark.parametrize("code", [None, "", "SOMETHING_NEW", "cycle_mismatch"])
async def test_an_unknown_or_missing_code_is_raised_unchanged(code):
    error = refusal(code, {"server_time": 5})
    raised, _ = await issue_refused_with(error)
    assert raised is error


async def test_a_cycle_mismatch_forgets_the_cycle_even_without_details(monkeypatch):
    clock(monkeypatch, 1_000)
    rpc = Rpc(active_cycle=cycle(), issue_guarantee=refusal("CYCLE_MISMATCH"))
    payments = client(rpc)
    await payments._ctx.active_cycle(ZERO)
    await issue_refused_with(refusal("CYCLE_MISMATCH"), payments)
    assert payments._ctx._active_cycles == {}


async def test_a_cycle_mismatch_is_typed_and_syncs_the_clock(monkeypatch):
    clock(monkeypatch, 1_000)
    details = {
        "signed_cycle_id": CYCLE,
        "active_cycle_id": NEXT_CYCLE,
        "active_cycle_id_text": "next",
        "active_period_end": "2000",
        "server_time": 1_500,
    }
    raised, payments = await issue_refused_with(refusal("CYCLE_MISMATCH", details))
    assert isinstance(raised, CycleMismatchError)
    assert raised.details.active_period_end == 2_000
    assert raised.status_code == 409
    assert payments._ctx.core_now() == 1_500


async def test_a_cycle_mismatch_without_server_time_leaves_the_clock(monkeypatch):
    clock(monkeypatch, 1_000)
    details = {
        "signed_cycle_id": CYCLE,
        "active_cycle_id": NEXT_CYCLE,
        "active_cycle_id_text": "next",
        "active_period_end": 2_000,
    }
    raised, payments = await issue_refused_with(refusal("CYCLE_MISMATCH", details))
    assert isinstance(raised, CycleMismatchError)
    assert raised.details.server_time == 0
    assert payments._ctx.core_now() == 1_000


async def test_a_future_timestamp_is_typed_and_syncs_the_clock(monkeypatch):
    clock(monkeypatch, 1_000)
    details = {"timestamp": 1_010, "server_time": 990}
    raised, payments = await issue_refused_with(refusal("FUTURE_TIMESTAMP", details))
    assert isinstance(raised, FutureTimestampError)
    assert "1010 is later than core's clock 990" in str(raised)
    assert payments._ctx.core_now() == 990


async def test_a_stale_timestamp_is_typed_and_syncs_the_clock(monkeypatch):
    clock(monkeypatch, 1_000)
    details = {
        "cycle_id": CYCLE,
        "cycle_id_text": "text",
        "timestamp": 5,
        "period_start": 10,
        "period_end": 20,
        "server_time": 15,
    }
    raised, payments = await issue_refused_with(refusal("STALE_TIMESTAMP", details))
    assert isinstance(raised, StaleTimestampError)
    assert raised.details.period_start == 10
    assert payments._ctx.core_now() == 15


def cutoff_details(payer: str) -> dict:
    return {
        "cycle_id": CYCLE,
        "cycle_id_text": "text",
        "asset_address": ZERO,
        "payer": payer,
        "timestamp": 100,
        "timestamp_cutoff": 150,
        "cumulative_gross": 10,
        "server_time": 160,
    }


@pytest.mark.parametrize("payer", [TEST_ADDRESS, TEST_ADDRESS.lower()])
async def test_a_cutoff_refusal_for_the_signer_records_the_cutoff(payer, monkeypatch):
    clock(monkeypatch, 1_000)
    raised, payments = await issue_refused_with(
        refusal("TIMESTAMP_NOT_PAST_CUTOFF", cutoff_details(payer))
    )
    assert isinstance(raised, TimestampNotPastCutoffError)
    assert payments._ctx.payment_cutoff(ZERO) == 150
    assert payments._ctx.core_now() == 160


@pytest.mark.parametrize("payer", [STRANGER, "not-an-address"])
async def test_a_cutoff_refusal_for_another_payer_records_no_cutoff(payer, monkeypatch):
    clock(monkeypatch, 1_000)
    raised, payments = await issue_refused_with(
        refusal("TIMESTAMP_NOT_PAST_CUTOFF", cutoff_details(payer))
    )
    assert isinstance(raised, TimestampNotPastCutoffError)
    assert payments._ctx.payment_cutoff(ZERO) is None


async def test_a_checkpoint_requirement_is_typed():
    details = {
        "cycle_id": CYCLE,
        "cycle_id_text": "text",
        "asset_address": ZERO,
        "payer": TEST_ADDRESS,
        "uncheckpointed": 64,
        "max_uncheckpointed": 64,
    }
    raised, _ = await issue_refused_with(refusal("CHECKPOINT_REQUIRED", details))
    assert isinstance(raised, CheckpointRequiredError)
    assert raised.code == "CHECKPOINT_REQUIRED"
    assert raised.details.uncheckpointed == 64


async def test_a_mismatch_reason_without_a_prefix_is_the_whole_message():
    details = mismatch().details
    raised, _ = await issue_refused_with(
        refusal("CHECKPOINT_MISMATCH", details, "stale")
    )
    assert isinstance(raised, CheckpointMismatchError)
    assert raised.reason == "stale"


def test_a_malformed_domain_separator_makes_the_previous_checkpoint_untrusted():
    with pytest.raises(UntrustedCheckpointBatchError, match="previous checkpoint:"):
        checkpoint_payload(
            PAYER.address,
            ZERO,
            CYCLE,
            "0x1234",
            batch(signed(payment(200)), previous=previous_checkpoint(10, 100)),
        )


def test_a_malformed_domain_separator_makes_an_authorization_untrusted():
    with pytest.raises(UntrustedCheckpointBatchError, match="authorization 200:"):
        checkpoint_payload(
            PAYER.address, ZERO, CYCLE, "0x1234", batch(signed(payment(200)))
        )


def test_a_batch_naming_a_malformed_asset_is_untrusted():
    with pytest.raises(UntrustedCheckpointBatchError, match="batch is for asset"):
        checkpoint_payload(
            PAYER.address,
            ZERO,
            CYCLE,
            DOMAIN,
            batch(signed(payment(200)), asset_address="garbage"),
        )


def test_a_batch_with_a_mixed_case_asset_keeps_the_batch_spelling():
    token_payment = signed(payment(200, asset_address=TOKEN_ADDRESS))
    result = checkpoint_payload(
        PAYER.address,
        TOKEN_ADDRESS.lower(),
        CYCLE.upper().replace("0X", "0x"),
        DOMAIN,
        batch(token_payment, asset_address=TOKEN_ADDRESS.lower()),
    )
    assert result is not None
    assert result.asset_address == TOKEN_ADDRESS.lower()
    assert result.cycle_id == CYCLE


def test_a_malformed_payer_argument_is_refused():
    with pytest.raises(ValidationError, match="payer"):
        checkpoint_payload("0x12", ZERO, CYCLE, DOMAIN, batch(signed(payment(1))))


def test_a_malformed_cycle_argument_is_refused():
    with pytest.raises(ValidationError, match="bytes32"):
        checkpoint_payload(
            PAYER.address, ZERO, "0x12", DOMAIN, batch(signed(payment(1)))
        )


def test_an_empty_batch_is_accepted_whatever_its_other_fields_say():
    assert (
        checkpoint_payload(
            PAYER.address, ZERO, CYCLE, DOMAIN, batch(cycle_id=NEXT_CYCLE)
        )
        is None
    )


def test_a_zero_amount_payment_still_moves_the_cutoff():
    result = checkpoint_payload(
        PAYER.address,
        ZERO,
        CYCLE,
        DOMAIN,
        batch(signed(payment(300, 0)), previous=previous_checkpoint(10, 100)),
    )
    assert result is not None
    assert result.cumulative_gross == 10
    assert result.timestamp_cutoff == 300


def test_a_payment_at_exactly_the_previous_cutoff_is_already_covered():
    with pytest.raises(UntrustedCheckpointBatchError, match="already covered"):
        checkpoint_payload(
            PAYER.address,
            ZERO,
            CYCLE,
            DOMAIN,
            batch(signed(payment(100)), previous=previous_checkpoint(10, 100)),
        )


def test_a_previous_checkpoint_in_another_asset_is_untrusted():
    other = previous_checkpoint(10, 100)
    other.payload.asset_address = TOKEN_ADDRESS
    with pytest.raises(UntrustedCheckpointBatchError, match="another payer"):
        checkpoint_payload(
            PAYER.address,
            ZERO,
            CYCLE,
            DOMAIN,
            batch(signed(payment(200)), previous=other),
        )


def test_a_previous_checkpoint_from_another_payer_is_untrusted():
    other = previous_checkpoint(10, 100)
    other.payload.payer = STRANGER
    with pytest.raises(UntrustedCheckpointBatchError, match="another payer"):
        checkpoint_payload(
            PAYER.address,
            ZERO,
            CYCLE,
            DOMAIN,
            batch(signed(payment(200)), previous=other),
        )
