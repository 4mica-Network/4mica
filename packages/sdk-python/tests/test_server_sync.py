import asyncio

import httpx
import pytest
from eth_account import Account
from stubs import (
    FACILITATOR_URL,
    TEST_ADDRESS,
    TEST_PRIVATE_KEY,
    TOKEN_ADDRESS,
    FakeGateway,
    FakeRpc,
    MockCore,
    attach_facilitator,
    connect,
    make_ctx,
    supported_tokens,
)

import fourmica_sdk.client.ctx as ctx_module
from fourmica_sdk import Client, ConfigBuilder
from fourmica_sdk.client.facilitator import (
    NAMES_THE_CLAIM,
    NAMES_THE_REQUEST,
    Facilitator,
    rejection_error,
    sponsorship_unavailable,
)
from fourmica_sdk.client.model import base_units
from fourmica_sdk.client.withdraw import WithdrawClient
from fourmica_sdk.contract import ContractGateway
from fourmica_sdk.errors import (
    ClientInitializationError,
    FacilitatorNotConfiguredError,
    FacilitatorRejectedError,
    InvalidParamsError,
    OutcomeUnknownError,
    SigningError,
    SponsorshipTransportError,
)
from fourmica_sdk.rpc import RpcProxy
from fourmica_sdk.signing import (
    _SECP256K1_ORDER,
    LocalAccountSigner,
    PayerSigner,
    _normalize_signature,
)
from fourmica_sdk.x402 import PaymentRequirementsV2

OTHER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
DIGEST = bytes.fromhex("11" * 32)


def signed_parts():
    signed = Account._sign_hash(DIGEST, TEST_PRIVATE_KEY)
    return signed.r, signed.s, signed.v


def assemble(r: int, s: int, v: int) -> str:
    return "0x" + (r.to_bytes(32, "big") + s.to_bytes(32, "big") + bytes([v])).hex()


def recover(signature: str) -> str:
    return Account._recover_hash(DIGEST, signature=signature)


def test_a_local_key_already_signs_in_the_accepted_form():
    r, s, v = signed_parts()
    assert v in (27, 28)
    assert s <= _SECP256K1_ORDER // 2
    canonical = assemble(r, s, v)
    assert _normalize_signature(canonical) == canonical
    assert _normalize_signature(bytes.fromhex(canonical[2:])) == canonical


def test_a_remote_signers_v_of_0_or_1_becomes_27_or_28():
    r, s, v = signed_parts()
    assert _normalize_signature(assemble(r, s, v - 27)) == assemble(r, s, v)


def test_a_high_s_signature_is_rewritten_as_its_low_s_twin():
    r, s, v = signed_parts()
    twin = assemble(r, _SECP256K1_ORDER - s, 55 - v)
    assert recover(twin) == TEST_ADDRESS
    normal = _normalize_signature(twin)
    assert normal == assemble(r, s, v)
    assert recover(normal) == TEST_ADDRESS


@pytest.mark.parametrize(
    ("signature", "reason"),
    [
        ("not hex", "not hex"),
        ("0x" + "zz" * 65, "not hex"),
        ("0xabc", "not hex"),
        ("0xabcd", "2-byte"),
        ("", "0-byte"),
        ("0x" + "11" * 64, "64-byte"),
        (b"\x11" * 66, "66-byte"),
    ],
)
def test_what_is_not_a_65_byte_hex_signature_is_a_signing_error(signature, reason):
    with pytest.raises(SigningError, match=reason):
        _normalize_signature(signature)


@pytest.mark.parametrize(
    ("r", "s", "v"),
    [
        (1, _SECP256K1_ORDER, 27),
        (1, _SECP256K1_ORDER + 1, 27),
        (1, 2**256 - 1, 28),
        (1, 0, 27),
        (0, 1, 27),
        (_SECP256K1_ORDER, 1, 27),
        (1, 1, 2),
        (1, 1, 29),
        (1, 1, 37),
    ],
)
def test_65_bytes_that_cannot_be_a_signature_are_a_signing_error(r, s, v):
    with pytest.raises(SigningError, match="signer returned a signature"):
        _normalize_signature(assemble(r, s, v))


async def test_a_malformed_remote_signature_fails_the_payment_as_a_signing_error():
    class BrokenSigner:
        address = TEST_ADDRESS

        async def sign_hash(self, message_hash):
            return assemble(1, _SECP256K1_ORDER + 1, 27)

    signer = PayerSigner(BrokenSigner())
    with pytest.raises(SigningError, match="s out of range"):
        await signer._sign(lambda: DIGEST)


@pytest.mark.parametrize("output", ["0xdeadbeef", "garbage", b"\x00" * 64])
async def test_a_remote_signer_returning_no_signature_fails_as_a_signing_error(
    output,
):
    class BrokenSigner:
        address = TEST_ADDRESS

        async def sign_hash(self, message_hash):
            return output

    with pytest.raises(SigningError, match="signer returned a"):
        await PayerSigner(BrokenSigner())._sign(lambda: DIGEST)


def test_requirements_echo_an_empty_extra_only_when_one_was_advertised():
    raw = {
        "scheme": "4mica-credit",
        "network": "eip155:84532",
        "asset": TOKEN_ADDRESS,
        "amount": "1",
        "payTo": TEST_ADDRESS,
    }
    assert "extra" not in PaymentRequirementsV2.from_raw(raw).to_payload()
    assert PaymentRequirementsV2.from_raw({**raw, "extra": {}}).to_payload() == {
        **raw,
        "extra": {},
    }
    assert PaymentRequirementsV2.from_raw({**raw, "extra": None}).to_payload() == raw


@pytest.mark.parametrize("error", [httpx.ConnectTimeout, httpx.PoolTimeout])
async def test_a_request_that_never_left_is_not_an_unknown_outcome(error):
    def refuse(request: httpx.Request) -> httpx.Response:
        raise error("timed out", request=request)

    facilitator = Facilitator(
        FACILITATOR_URL,
        client=httpx.AsyncClient(transport=httpx.MockTransport(refuse)),
    )
    with pytest.raises(SponsorshipTransportError):
        await facilitator.post("deposit", {})


async def test_a_read_timeout_is_an_unknown_outcome():
    def stall(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timed out", request=request)

    facilitator = Facilitator(
        FACILITATOR_URL, client=httpx.AsyncClient(transport=httpx.MockTransport(stall))
    )
    with pytest.raises(OutcomeUnknownError):
        await facilitator.post("deposit", {})


def test_a_refusal_keeps_the_transaction_and_details_the_facilitator_sent():
    error = rejection_error(
        {
            "success": False,
            "transaction": "0x" + "ab" * 32,
            "extra": {"retryable": False, "details": {"spender": "0x1"}},
        },
        "settlement_pending",
        "receipt unavailable",
    )
    assert isinstance(error, FacilitatorRejectedError)
    assert error.transaction == "0x" + "ab" * 32
    assert error.details == {"spender": "0x1"}
    assert (
        rejection_error({"transaction": ""}, "rate_limited", None).transaction is None
    )


def test_a_facilitator_without_a_relayer_says_so_in_its_own_words():
    error = rejection_error(
        {}, "sponsorship_unavailable", "gas sponsorship is not enabled"
    )
    assert isinstance(error, FacilitatorNotConfiguredError)
    assert "gas sponsorship is not enabled" in str(error)
    assert "set FOURMICA_FACILITATOR_URL" in str(FacilitatorNotConfiguredError())


@pytest.mark.parametrize(
    "code", ["settlement_pending", "invalid_transaction_state", "duplicate_in_flight"]
)
def test_a_request_already_submitted_is_never_resent_self_funded(code):
    refusal = FacilitatorRejectedError(code, "after broadcast")
    for names in (NAMES_THE_REQUEST, NAMES_THE_CLAIM):
        assert not sponsorship_unavailable(refusal, names)
    throttled = FacilitatorRejectedError("rate_limited", "slow down")
    assert sponsorship_unavailable(throttled, NAMES_THE_REQUEST)


async def test_a_withdrawal_the_facilitator_broadcast_is_not_requested_again():
    gateway = FakeGateway()
    ctx = make_ctx(rpc=FakeRpc(supported_tokens=supported_tokens()), gateway=gateway)
    attach_facilitator(
        ctx,
        lambda request: httpx.Response(
            200,
            json={
                "success": False,
                "errorReason": "settlement_pending",
                "errorMessage": "receipt unavailable",
                "transaction": "0x" + "cd" * 32,
            },
        ),
    )
    with pytest.raises(FacilitatorRejectedError) as raised:
        await WithdrawClient(ctx).request(TOKEN_ADDRESS, 1_000_000).send()
    assert raised.value.transaction == "0x" + "cd" * 32
    assert gateway.calls == []


async def test_health_returns_an_unhealthy_cores_report():
    calls = []

    def unhealthy(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(503, json={"status": "unhealthy", "chain_rpc": "down"})

    rpc = RpcProxy("https://core.example/", transport=httpx.MockTransport(unhealthy))
    assert await rpc.health() == {"status": "unhealthy", "chain_rpc": "down"}
    assert len(calls) == 1
    assert "authorization" not in calls[0].headers
    await rpc.aclose()


async def test_a_key_and_a_signer_for_different_accounts_are_refused():
    cfg = (
        ConfigBuilder()
        .rpc_url("https://core.example/")
        .wallet_private_key(TEST_PRIVATE_KEY)
        .evm_signer(LocalAccountSigner(OTHER_KEY))
        .build()
    )
    with pytest.raises(ClientInitializationError, match="configure one account"):
        await Client.connect(cfg)


async def test_a_key_and_a_signer_for_the_same_account_connect(monkeypatch):
    transport = httpx.MockTransport(MockCore({}))
    monkeypatch.setattr(
        ctx_module, "RpcProxy", lambda url: RpcProxy(url, transport=transport)
    )
    cfg = (
        ConfigBuilder()
        .rpc_url("https://core.example/")
        .wallet_private_key(TEST_PRIVATE_KEY)
        .evm_signer(LocalAccountSigner(TEST_PRIVATE_KEY))
        .bearer_token("t")
        .build()
    )
    client = await Client.connect(cfg)
    assert client.signer_address == TEST_ADDRESS
    await client.aclose()


async def test_the_client_exposes_its_context_and_rpc(monkeypatch):
    client = await connect(monkeypatch, MockCore({}))
    assert client.ctx.signer_address == client.signer_address
    assert client.rpc is client.ctx.rpc
    await client.aclose()


async def test_transactions_are_sent_one_at_a_time():
    gateway = ContractGateway(
        eth_rpc_url="http://localhost:8545",
        private_key=TEST_PRIVATE_KEY,
        contract_address="0x00000000000000000000000000000000C04E4a1c",
        chain_id=84532,
    )
    events = []

    async def prepare(func, value=0):
        events.append(("nonce read", func))
        await asyncio.sleep(0.01)
        return {}

    async def build(func, tx):
        return {}

    async def send(built, wait_options=None):
        await asyncio.sleep(0.01)
        events.append(("mined", None))
        return {"transactionHash": "0x00"}

    gateway._prepare_tx, gateway._build_tx = prepare, build
    gateway._build_and_send = send
    await asyncio.gather(gateway._send("first"), gateway._send("second"))
    assert [name for name, _ in events] == ["nonce read", "mined"] * 2
    await gateway.aclose()


def test_base_unit_amounts_are_never_truncated():
    assert base_units(5) == 5
    assert base_units("5") == 5
    assert base_units("0xf4240") == 1_000_000
    for value in (1.9, None, "1.9", "five", True, False):
        with pytest.raises(InvalidParamsError):
            base_units(value)
