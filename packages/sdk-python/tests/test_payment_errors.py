"""How the payment client reacts to core's coded refusals, what it caches
between payments, and which cycle it checkpoints. Port of
``sdk-rust/tests/payment_errors.rs``.

Offline against a mock core reached through the real ``RpcProxy`` over an
``httpx.MockTransport``, so error bodies are decoded exactly as in production.
The refusals are the payer's whole recovery story — each must arrive as a
typed error carrying what the caller needs to act on, and several also settle
what the client may keep reusing.
"""

import asyncio
import json
import time
from typing import List, Optional

import httpx
import pytest
from eth_account import Account
from stubs import (
    CLEARING_HOUSE_ADDRESS,
    MOCK_CORE_CHAIN_ID,
    TEST_PRIVATE_KEY,
    Handler,
    MockCore,
    connect,
    ok,
)

from fourmica_sdk import Client
from fourmica_sdk.errors import (
    CheckpointMismatchError,
    CheckpointRequiredError,
    CoreRefusalError,
    CycleMismatchError,
    FutureTimestampError,
    RpcError,
    StaleTimestampError,
    TimestampNotPastCutoffError,
)
from fourmica_sdk.guarantee import clearing_house_domain_separator
from fourmica_sdk.models import (
    CheckpointPayload,
    PaymentRequestPayload,
    SignedCheckpoint,
)

CHAIN_ID = MOCK_CORE_CHAIN_ID
ZERO = "0x0000000000000000000000000000000000000000"
RECIPIENT = "0x00000000000000000000000000000000000000Be"
STRANGER = "0x00000000000000000000000000000000000000aA"
FIRST_CYCLE = "0x" + "11" * 32
NEXT_CYCLE = "0x" + "22" * 32
PAYER = Account.from_key(TEST_PRIVATE_KEY)
DOMAIN = clearing_house_domain_separator(CHAIN_ID, CLEARING_HOUSE_ADDRESS)


def unix_now() -> int:
    return int(time.time())


def active_cycle(cycle_id: str, period_end: Optional[int] = None) -> dict:
    """A cycle still open for the next day unless told otherwise, so only a
    refusal can expire it."""
    return {
        "cycle_id": cycle_id,
        "cycle_id_text": "0x0:1700000000",
        "asset_address": ZERO,
        "period_start": 1_700_000_000,
        "period_end": period_end if period_end is not None else unix_now() + 86_400,
    }


def active_cycle_at(server_time: int, period_start: int) -> dict:
    """The active cycle as a core whose clock reads *server_time* reports it."""
    return {
        **active_cycle(FIRST_CYCLE, server_time + 86_400),
        "period_start": period_start,
        "server_time": server_time,
    }


def refusing(body: dict, status: int = 409) -> Handler:
    return lambda request: httpx.Response(status, json=body)


def cycle_reads_alternating() -> Handler:
    """The first read reports FIRST_CYCLE and every later one NEXT_CYCLE, so a
    test can tell a cached answer from a fresh one."""
    reads = {"n": 0}

    def handler(request):
        reads["n"] += 1
        return ok(active_cycle(FIRST_CYCLE if reads["n"] == 1 else NEXT_CYCLE))

    return handler


async def client_refusing_with(monkeypatch, refusal: dict, status: int = 409):
    """A core that always serves a cycle and always refuses issuance."""
    core = MockCore(
        {
            ("GET", "/core/cycles/active"): cycle_reads_alternating(),
            ("POST", "/core/guarantees"): refusing(refusal, status),
        }
    )
    return await connect(monkeypatch, core), core


async def refused(client: Client) -> Exception:
    payload = await client.payment.new_payment(RECIPIENT, 10)
    request = await client.payment.sign_request(payload)
    with pytest.raises(RpcError) as excinfo:
        await client.payment.issue_guarantee(request)
    return excinfo.value


async def test_a_checkpoint_requirement_names_what_is_outstanding(monkeypatch):
    client, _ = await client_refusing_with(
        monkeypatch,
        {
            "error": "payer must submit a checkpoint before more guarantees are "
            "accepted",
            "code": "CHECKPOINT_REQUIRED",
            "details": {
                "cycle_id": FIRST_CYCLE,
                "cycle_id_text": "0x0:1700000000",
                "asset_address": ZERO,
                "payer": RECIPIENT,
                "uncheckpointed": 64,
                "max_uncheckpointed": 64,
            },
        },
    )

    err = await refused(client)
    assert isinstance(err, CheckpointRequiredError)
    assert err.details.uncheckpointed == 64
    assert err.details.max_uncheckpointed == 64
    assert err.details.cycle_id == FIRST_CYCLE


async def test_a_cutoff_refusal_names_the_cutoff(monkeypatch):
    client, _ = await client_refusing_with(
        monkeypatch,
        {
            "error": "request timestamp must be past the payer's latest checkpoint "
            "cutoff",
            "code": "TIMESTAMP_NOT_PAST_CUTOFF",
            "details": {
                "cycle_id": FIRST_CYCLE,
                "cycle_id_text": "0x0:1700000000",
                "asset_address": ZERO,
                "payer": RECIPIENT,
                "timestamp": 1_700_000_000,
                "timestamp_cutoff": 1_700_000_000,
                "cumulative_gross": "500",
                "server_time": 1_700_000_001,
            },
        },
    )

    err = await refused(client)
    assert isinstance(err, TimestampNotPastCutoffError)
    assert err.details.timestamp_cutoff == 1_700_000_000
    assert err.details.cumulative_gross == 500


async def test_the_payers_own_cutoff_holds_its_next_payment_past_it(monkeypatch):
    """The cutoff comes back with the refusal, and the client keeps it so the
    next payment is stamped past it rather than repeating the mistake."""
    cutoff = unix_now()
    client, _ = await client_refusing_with(
        monkeypatch,
        {
            "error": "request timestamp must be past the payer's latest checkpoint "
            "cutoff",
            "code": "TIMESTAMP_NOT_PAST_CUTOFF",
            "details": {
                "cycle_id": FIRST_CYCLE,
                "cycle_id_text": "0x0:1700000000",
                "asset_address": ZERO,
                "payer": PAYER.address.lower(),
                "timestamp": cutoff,
                "timestamp_cutoff": cutoff,
                "cumulative_gross": "500",
                "server_time": cutoff,
            },
        },
    )

    assert isinstance(await refused(client), TimestampNotPastCutoffError)
    nxt = await asyncio.wait_for(client.payment.new_payment(RECIPIENT, 10), 5)
    assert nxt.timestamp > cutoff


async def test_a_cycle_mismatch_is_what_expires_the_cached_cycle(monkeypatch):
    """A cycle is held until core rejects a payment signed against it, so the
    next payment is scoped to the cycle core will actually accept."""
    client, core = await client_refusing_with(
        monkeypatch,
        {
            "error": "request was signed for a cycle other than the active "
            "settlement cycle",
            "code": "CYCLE_MISMATCH",
            "details": {
                "signed_cycle_id": FIRST_CYCLE,
                "active_cycle_id": NEXT_CYCLE,
                "active_cycle_id_text": "0x0:1700086400",
                "active_period_end": 1_700_172_800,
            },
        },
    )

    first = await client.payment.new_payment(RECIPIENT, 10)
    second = await client.payment.new_payment(RECIPIENT, 10)
    assert first.cycle_id == second.cycle_id == FIRST_CYCLE
    assert core.count("GET", "/core/cycles/active") == 1, "the cycle must be cached"

    err = await refused(client)
    assert isinstance(err, CycleMismatchError)
    assert err.details.active_cycle_id == NEXT_CYCLE

    after = await client.payment.new_payment(RECIPIENT, 10)
    assert after.cycle_id == NEXT_CYCLE, "the refusal must expire the cached cycle"


async def test_a_cycle_is_reread_once_its_period_ends(monkeypatch):
    """Once a cycle's period ends core opens the next one, so the client stops
    reusing it."""
    core = MockCore(
        {
            ("GET", "/core/cycles/active"): lambda r: ok(
                active_cycle(FIRST_CYCLE, unix_now() - 1)
            )
        }
    )
    client = await connect(monkeypatch, core)

    for _ in range(2):
        await client.payment.new_payment(RECIPIENT, 10)
    assert core.count("GET", "/core/cycles/active") == 2, "an ended cycle is re-read"


async def test_cycles_are_cached_per_asset(monkeypatch):
    core = MockCore(
        {("GET", "/core/cycles/active"): lambda r: ok(active_cycle(FIRST_CYCLE))}
    )
    client = await connect(monkeypatch, core)
    token = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"

    await client.payment.new_payment(RECIPIENT, 10)
    await client.payment.new_payment(RECIPIENT, 10, token)
    await client.payment.new_payment(RECIPIENT, 10, token.lower())

    assets = [
        r.url.params["asset"] for r in core.requests if r.url.path.endswith("active")
    ]
    assert assets == [ZERO, token]


async def test_another_payers_cutoff_does_not_hold_this_client_back(monkeypatch):
    """Issuance is the recipient's call, so a cutoff refusal usually names a
    payer this client is not. Taking that cutoff as its own would hold back
    its next payment for someone else's schedule."""
    far_future = unix_now() + 3_600
    client, _ = await client_refusing_with(
        monkeypatch,
        {
            "error": "request timestamp must be past the payer's latest checkpoint "
            "cutoff",
            "code": "TIMESTAMP_NOT_PAST_CUTOFF",
            "details": {
                "cycle_id": FIRST_CYCLE,
                "cycle_id_text": "0x0:1700000000",
                "asset_address": ZERO,
                "payer": STRANGER,
                "timestamp": far_future - 1,
                "timestamp_cutoff": far_future,
                "cumulative_gross": "500",
                "server_time": unix_now(),
            },
        },
    )

    assert isinstance(await refused(client), TimestampNotPastCutoffError)
    await asyncio.wait_for(client.payment.new_payment(RECIPIENT, 10), 5)


async def test_an_uncoded_refusal_is_not_reinterpreted(monkeypatch):
    """A refusal core does not code stays an RPC error rather than being
    forced into a typed one."""
    client, _ = await client_refusing_with(
        monkeypatch, {"error": "another guarantee with req_id 7 already exists"}
    )

    err = await refused(client)
    assert type(err) is RpcError
    assert "already exists" in str(err)
    assert err.status_code == 409


async def test_a_coded_refusal_with_unreadable_details_stays_an_rpc_error(
    monkeypatch,
):
    client, _ = await client_refusing_with(
        monkeypatch,
        {"error": "checkpoint required", "code": "CHECKPOINT_REQUIRED", "details": {}},
    )

    err = await refused(client)
    assert type(err) is RpcError
    assert err.code == "CHECKPOINT_REQUIRED"


async def test_typed_refusals_are_still_rpc_errors(monkeypatch):
    """Code written against core's plain errors keeps catching them."""
    client, _ = await client_refusing_with(
        monkeypatch,
        {
            "error": "request timestamp is later than the server clock",
            "code": "FUTURE_TIMESTAMP",
            "details": {"timestamp": unix_now(), "server_time": unix_now()},
        },
        status=400,
    )

    err = await refused(client)
    assert isinstance(err, CoreRefusalError)
    assert isinstance(err, RpcError)
    assert err.status_code == 400
    assert err.code == "FUTURE_TIMESTAMP"


async def test_issuance_posts_the_tagged_payload_and_its_signature(monkeypatch):
    client, core = await client_refusing_with(monkeypatch, {"error": "nope"})
    await refused(client)

    post = next(r for r in core.requests if r.method == "POST")
    body = json.loads(post.content)
    assert set(body) == {"payload", "signature"}
    assert body["payload"]["version"] == "v1"
    assert body["payload"]["cycle_id"] == FIRST_CYCLE
    assert body["payload"]["user_address"] == PAYER.address
    assert post.headers["authorization"] == "Bearer test-token"

    payload = PaymentRequestPayload.from_rpc(body["payload"])
    recovered = Account._recover_hash(
        payload.signing_digest(DOMAIN), signature=body["signature"]
    )
    assert recovered == PAYER.address


async def test_each_checkpoint_names_the_cycle_it_covers(monkeypatch):
    """Each checkpoint asks core for exactly the cycle it covers: the active
    one, or the one named."""
    empty_batch = {
        "cycle_id": FIRST_CYCLE,
        "cycle_id_text": "0x0:1700000000",
        "asset_address": ZERO,
        "payer": ZERO,
        "previous": None,
        "authorizations": [],
        "max_uncheckpointed": 64,
    }
    core = MockCore(
        {
            ("GET", "/core/cycles/active"): lambda r: ok(active_cycle(NEXT_CYCLE)),
            ("GET", "/core/payers/{payer}/checkpoint-batch"): lambda r: ok(empty_batch),
        }
    )
    client = await connect(monkeypatch, core)

    assert await client.payment.checkpoint_active_cycle() is None
    assert await client.payment.checkpoint_cycle(None, FIRST_CYCLE) is None

    asked = [r for r in core.requests if r.url.path.endswith("/checkpoint-batch")]
    assert len(asked) == 2
    assert asked[0].url.path == f"/core/payers/{PAYER.address}/checkpoint-batch"
    assert asked[0].url.params["cycle_id"] == NEXT_CYCLE
    assert asked[1].url.params["cycle_id"] == FIRST_CYCLE
    assert asked[1].url.params["asset"] == ZERO


def signed_payment(amount: int, timestamp: int) -> dict:
    """A payment the payer signed in the first cycle, as core lists it."""
    payload = PaymentRequestPayload.new(
        user_address=PAYER.address,
        recipient_address=RECIPIENT,
        cycle_id=FIRST_CYCLE,
        req_id=timestamp,
        amount=amount,
        timestamp=timestamp,
        salt=b"\x33" * 32,
    )
    signature = PAYER.unsafe_sign_hash(payload.signing_digest(DOMAIN))
    return {
        "payload": payload.to_payload(),
        "signature": "0x" + signature.signature.hex(),
    }


def core_racing_a_payment(refusals: int) -> tuple:
    """A core where a second payment lands right after the payer first reads
    its batch, and which refuses the first *refusals* checkpoints as no
    longer matching."""
    first = signed_payment(10, 1_700_000_100)
    late = signed_payment(7, 1_700_000_200)
    submitted: List[SignedCheckpoint] = []
    reads = {"n": 0}

    def batch(request):
        reads["n"] += 1
        return ok(
            {
                "cycle_id": FIRST_CYCLE,
                "cycle_id_text": "0x0:1700000000",
                "asset_address": ZERO,
                "payer": PAYER.address,
                "previous": None,
                "authorizations": [first] if reads["n"] == 1 else [first, late],
                "max_uncheckpointed": 64,
            }
        )

    def submit(request):
        signed = SignedCheckpoint.from_rpc(json.loads(request.content))
        submitted.append(signed)
        checkpoint = signed.payload
        if len(submitted) <= refusals:
            return httpx.Response(
                400,
                json={
                    "error": "checkpoint cumulative gross does not match the "
                    "covered authorizations",
                    "code": "CHECKPOINT_MISMATCH",
                    "details": {
                        "cycle_id": FIRST_CYCLE,
                        "cycle_id_text": "0x0:1700000000",
                        "asset_address": checkpoint.asset_address,
                        "payer": checkpoint.payer,
                    },
                },
            )
        return ok(
            {
                "cycle_id": FIRST_CYCLE,
                "cycle_id_text": "0x0:1700000000",
                "asset_address": checkpoint.asset_address,
                "payer": checkpoint.payer,
                "cumulative_gross": str(checkpoint.cumulative_gross),
                "timestamp_cutoff": checkpoint.timestamp_cutoff,
                "covered": 2,
            }
        )

    core = MockCore(
        {
            ("GET", "/core/payers/{payer}/checkpoint-batch"): batch,
            ("POST", "/core/checkpoints"): submit,
        }
    )
    return core, submitted, reads


async def test_a_checkpoint_overtaken_by_a_payment_is_signed_again(monkeypatch):
    """A payment landing mid-checkpoint makes the first one stale; the retry
    re-reads the batch and covers the late payment too."""
    core, submitted, reads = core_racing_a_payment(refusals=1)
    client = await connect(monkeypatch, core)

    accepted = await client.payment.checkpoint_cycle(None, FIRST_CYCLE)
    assert accepted.cumulative_gross == 17
    assert accepted.timestamp_cutoff == 1_700_000_200

    assert reads["n"] == 2, "the retry must re-read the batch"
    assert [s.payload.cumulative_gross for s in submitted] == [10, 17]
    for signed in submitted:
        recovered = Account._recover_hash(
            signed.payload.signing_digest(DOMAIN), signature=signed.signature
        )
        assert recovered == PAYER.address


async def test_a_checkpoint_refused_twice_reports_the_mismatch(monkeypatch):
    """A payer paid faster than it can checkpoint gets the refusal back rather
    than an endless retry."""
    core, submitted, _ = core_racing_a_payment(refusals=1_000)
    client = await connect(monkeypatch, core)

    with pytest.raises(CheckpointMismatchError) as excinfo:
        await client.payment.checkpoint_cycle(None, FIRST_CYCLE)
    assert excinfo.value.details.cycle_id == FIRST_CYCLE
    assert "cumulative gross" in excinfo.value.reason
    assert len(submitted) == 2


async def test_an_accepted_checkpoint_holds_the_next_payment_past_its_cutoff(
    monkeypatch,
):
    """A payment stamped at or before an accepted cutoff could never be
    collected, so the next one waits until it can be stamped past it."""
    cutoff = unix_now()
    core = MockCore(
        {
            ("GET", "/core/cycles/active"): lambda r: ok(active_cycle(FIRST_CYCLE)),
            ("POST", "/core/checkpoints"): lambda r: ok(
                {
                    "cycle_id": FIRST_CYCLE,
                    "cycle_id_text": "0x0:1700000000",
                    "asset_address": ZERO,
                    "payer": PAYER.address,
                    "cumulative_gross": "10",
                    "timestamp_cutoff": cutoff,
                    "covered": 1,
                }
            ),
        }
    )
    client = await connect(monkeypatch, core)
    signed = await client._ctx.payer_signer.sign_checkpoint(
        DOMAIN,
        CheckpointPayload(
            payer=PAYER.address,
            cycle_id=FIRST_CYCLE,
            asset_address=ZERO,
            cumulative_gross=10,
            timestamp_cutoff=cutoff,
        ),
    )

    await client.payment.submit_checkpoint(signed)
    nxt = await asyncio.wait_for(client.payment.new_payment(RECIPIENT, 10), 5)
    assert nxt.timestamp > cutoff


@pytest.mark.parametrize("skew", [3_600, -3_600])
async def test_payments_are_stamped_by_cores_clock(monkeypatch, skew):
    """Core refuses a payment stamped past its own clock, so a payer whose
    clock runs ahead must stamp by core's, and one whose clock lags must not
    fall behind the cycle it signs for."""
    core_time = unix_now() + skew
    core = MockCore(
        {
            ("GET", "/core/cycles/active"): lambda r: ok(
                active_cycle_at(core_time, 1_700_000_000)
            )
        }
    )
    client = await connect(monkeypatch, core)

    timestamp = (await client.payment.new_payment(RECIPIENT, 10)).timestamp
    assert timestamp <= unix_now() + skew
    assert timestamp + 2 >= core_time


async def test_a_payment_in_a_cycle_that_just_opened_is_stamped_inside_it(
    monkeypatch,
):
    """Erring behind core's clock must not push a payment before the cycle it
    is signed for. Core's clock as the client knows it is a truncated lower
    bound, so it can read a moment before the cycle that is already open."""
    reported = unix_now()
    opened = reported + 2
    core = MockCore(
        {
            ("GET", "/core/cycles/active"): lambda r: ok(
                active_cycle_at(reported, opened)
            )
        }
    )
    client = await connect(monkeypatch, core)

    assert (await client.payment.new_payment(RECIPIENT, 10)).timestamp == opened


async def test_a_future_timestamp_reports_cores_clock_and_resets_ours(monkeypatch):
    core_time = unix_now() - 3_600
    client, _ = await client_refusing_with(
        monkeypatch,
        {
            "error": "request timestamp is later than the server clock",
            "code": "FUTURE_TIMESTAMP",
            "details": {"timestamp": unix_now(), "server_time": core_time},
        },
    )

    err = await refused(client)
    assert isinstance(err, FutureTimestampError)
    assert err.details.server_time == core_time

    nxt = await client.payment.new_payment(RECIPIENT, 10)
    assert nxt.timestamp <= core_time + 1, "stamped by the clock core reported"


async def test_a_stale_timestamp_names_the_cycle_it_missed(monkeypatch):
    client, _ = await client_refusing_with(
        monkeypatch,
        {
            "error": "request timestamp is before the active cycle started",
            "code": "STALE_TIMESTAMP",
            "details": {
                "cycle_id": FIRST_CYCLE,
                "cycle_id_text": "0x0:1700000000",
                "timestamp": 1_699_999_999,
                "period_start": 1_700_000_000,
                "period_end": 1_700_086_400,
                "server_time": unix_now(),
            },
        },
    )

    err = await refused(client)
    assert isinstance(err, StaleTimestampError)
    assert err.details.period_start == 1_700_000_000
    assert err.details.cycle_id == FIRST_CYCLE
