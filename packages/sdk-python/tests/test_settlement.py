import pytest
from stubs import TEST_ADDRESS, FakeGateway, FakeRpc, make_ctx

from fourmica_sdk.client.model import Route, TokenRoute
from fourmica_sdk.client.settlement import SettlementClient
from fourmica_sdk.errors import Erc20AllowanceRequiredError, InvalidParamsError
from fourmica_sdk.models import ClearingSettlementActionResponse

CYCLE_ID = "0x" + "aa" * 32
CLEARING_HOUSE = "0x2222222222222222222222222222222222222222"
TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
ZERO = "0x0000000000000000000000000000000000000000"


def action(**overrides) -> ClearingSettlementActionResponse:
    raw = {
        "contract_address": CLEARING_HOUSE,
        "function_name": "payNetDebit",
        "action": "pay_net_debit",
        "cycle_id": CYCLE_ID,
        "cycle_id_text": "cycle",
        "asset_address": TOKEN,
        "participant": TEST_ADDRESS,
        "amount": "10",
        "payable_value": "0",
        "proof": ["0x" + "dd" * 32],
    }
    raw.update(overrides)
    return ClearingSettlementActionResponse.from_rpc(raw)


def settlement(rpc: FakeRpc, gateway: FakeGateway) -> SettlementClient:
    return SettlementClient(make_ctx(rpc=rpc, gateway=gateway))


async def test_pay_self_funded_sends_prepared_call():
    gateway = FakeGateway(allowance=10)
    client = settlement(FakeRpc(pay_action=action()), gateway)

    receipt = await client.pay(CYCLE_ID).send()

    assert receipt.route == TokenRoute.SELF_FUNDED
    assert receipt.account == TEST_ADDRESS
    call = next(c for c in gateway.calls if c[0] == "pay_net_debit")
    assert call[1] == CLEARING_HOUSE
    assert call[2] == bytes.fromhex("aa" * 32)
    assert call[3] == 10
    assert call[4] == [bytes.fromhex("dd" * 32)]
    assert call[5] == 0


async def test_pay_passes_native_payable_value():
    gateway = FakeGateway()
    client = settlement(
        FakeRpc(pay_action=action(asset_address=ZERO, payable_value="10")), gateway
    )

    await client.pay(CYCLE_ID).send()

    call = next(c for c in gateway.calls if c[0] == "pay_net_debit")
    assert call[5] == 10
    # A native debit never consults the token allowance.
    assert all(c[0] != "erc20_allowance" for c in gateway.calls)


async def test_pay_refuses_missing_allowance_before_spending_gas():
    gateway = FakeGateway(allowance=3)
    client = settlement(FakeRpc(pay_action=action()), gateway)

    with pytest.raises(Erc20AllowanceRequiredError) as excinfo:
        await client.pay(CYCLE_ID).send()

    assert excinfo.value.allowance == 3
    assert excinfo.value.needed == 10
    assert excinfo.value.spender == CLEARING_HOUSE
    assert all(c[0] != "pay_net_debit" for c in gateway.calls)


async def test_pay_rejects_action_for_another_participant():
    other = "0x1111111111111111111111111111111111111111"
    client = settlement(FakeRpc(pay_action=action(participant=other)), FakeGateway())

    with pytest.raises(InvalidParamsError, match="participant"):
        await client.pay(CYCLE_ID).send()


async def test_pay_rejects_unexpected_function():
    client = settlement(
        FakeRpc(pay_action=action(function_name="claimNetCreditFor")), FakeGateway()
    )
    with pytest.raises(InvalidParamsError, match="expected payNetDebit"):
        await client.pay(CYCLE_ID).send()


async def test_pay_approve_targets_the_clearing_house():
    gateway = FakeGateway()
    client = settlement(FakeRpc(pay_action=action()), gateway)

    await client.pay(CYCLE_ID).self_funded().approve()

    call = next(c for c in gateway.calls if c[0] == "approve_erc20")
    assert call[1] == TOKEN
    assert call[2] == 10
    assert call[3] == CLEARING_HOUSE


async def test_pay_approve_refuses_native():
    client = settlement(FakeRpc(pay_action=action(asset_address=ZERO)), FakeGateway())
    with pytest.raises(InvalidParamsError, match="native"):
        await client.pay(CYCLE_ID).self_funded().approve()


async def test_claim_defaults_to_signer_and_sends():
    gateway = FakeGateway()
    rpc = FakeRpc(
        claim_action=action(
            function_name="claimNetCreditFor", action="claim_net_credit"
        )
    )
    client = settlement(rpc, gateway)

    receipt = await client.claim(CYCLE_ID).send()

    assert receipt.route == Route.SELF_FUNDED
    assert receipt.account == TEST_ADDRESS
    assert rpc.calls[0] == ("claim_action", CYCLE_ID, TEST_ADDRESS)
    call = next(c for c in gateway.calls if c[0] == "claim_net_credit_for")
    assert call[2] == TEST_ADDRESS


async def test_claim_for_another_creditor():
    creditor = "0x00000000000000000000000000000000000000Be"
    gateway = FakeGateway()
    rpc = FakeRpc(
        claim_action=action(
            function_name="claimNetCreditFor",
            action="claim_net_credit",
            participant=creditor,
        )
    )
    client = settlement(rpc, gateway)

    receipt = await client.claim(CYCLE_ID).creditor(creditor).send()

    assert receipt.account == creditor
    call = next(c for c in gateway.calls if c[0] == "claim_net_credit_for")
    assert call[2] == creditor


async def test_claim_rejects_unexpected_function():
    client = settlement(FakeRpc(claim_action=action()), FakeGateway())
    with pytest.raises(InvalidParamsError, match="expected claimNetCreditFor"):
        await client.claim(CYCLE_ID).send()


async def test_action_returns_core_terms_untouched():
    prepared = action()
    client = settlement(FakeRpc(pay_action=prepared), FakeGateway())
    assert await client.pay(CYCLE_ID).action() == prepared
