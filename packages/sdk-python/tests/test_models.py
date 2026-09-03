import pytest

from fourmica_sdk.errors import InvalidParamsError
from fourmica_sdk.models import (
    ClearingParticipantProof,
    ClearingSettlementActionResponse,
    CorePublicParameters,
    PaymentGuaranteeRequestClaims,
    SupportedTokensResponse,
    ValidationRequirement,
)

ACTION_SNAKE = {
    "contract_address": "0x2222222222222222222222222222222222222222",
    "function_name": "payNetDebit",
    "action": "pay_net_debit",
    "cycle_id": "0x" + "aa" * 32,
    "cycle_id_text": "cycle",
    "asset_address": "0x0000000000000000000000000000000000000000",
    "participant": "0x1234567890123456789012345678901234567890",
    "amount": "10",
    "payable_value": "10",
    "proof": [],
}


def test_action_parses_camel_case_too():
    camel = {
        "contractAddress": ACTION_SNAKE["contract_address"],
        "functionName": "claimNetCreditFor",
        "action": "claim_net_credit",
        "cycleId": ACTION_SNAKE["cycle_id"],
        "cycleIdText": "cycle",
        "assetAddress": ACTION_SNAKE["asset_address"],
        "participant": ACTION_SNAKE["participant"],
        "amount": "10",
        "payableValue": "0",
        "proof": ["0x" + "dd" * 32],
    }
    action = ClearingSettlementActionResponse.from_rpc(camel)
    assert action.function_name == "claimNetCreditFor"
    assert action.payable_value == 0


def test_action_rejects_bad_cycle_id():
    bad = dict(ACTION_SNAKE, cycle_id="not-a-cycle")
    with pytest.raises(InvalidParamsError):
        ClearingSettlementActionResponse.from_rpc(bad)


def test_proof_rejects_unknown_role():
    raw = {
        "cycle_id": "0x" + "aa" * 32,
        "cycle_id_text": "cycle",
        "asset_address": "0x0000000000000000000000000000000000000000",
        "participant": "0x1234567890123456789012345678901234567890",
        "role": "FLAT",
        "amount": "0",
        "net_debit": "0",
        "net_credit": "0",
        "leaf": "0x" + "bb" * 32,
        "merkle_root": "0x" + "cc" * 32,
        "proof": [],
    }
    with pytest.raises(InvalidParamsError):
        ClearingParticipantProof.from_rpc(raw)


def test_public_params_public_key_accepts_byte_list_and_hex():
    base = {
        "contract_address": "0x2222222222222222222222222222222222222222",
        "eip712_name": "4mica",
        "eip712_version": "1",
        "chain_id": 84532,
    }
    from_list = CorePublicParameters.from_rpc(dict(base, public_key=[1, 2, 3]))
    assert from_list.public_key == b"\x01\x02\x03"
    from_hex = CorePublicParameters.from_rpc(dict(base, public_key="0x010203"))
    assert from_hex.public_key == b"\x01\x02\x03"
    # Defaults when core omits the optional fields.
    assert from_list.supported_guarantee_versions == [1]
    assert from_list.guarantee_domains == []
    assert from_list.ethereum_http_rpc_url == ""


def test_public_params_parses_guarantee_domains():
    params = CorePublicParameters.from_rpc(
        {
            "public_key": "0x" + "00" * 48,
            "contract_address": "0x2222222222222222222222222222222222222222",
            "eip712_name": "4mica",
            "eip712_version": "1",
            "chain_id": 84532,
            "supported_guarantee_versions": [1],
            "guarantee_domains": [{"version": 1, "domain_separator": "0x" + "11" * 32}],
        }
    )
    assert params.guarantee_domains[0].version == 1
    assert params.guarantee_domains[0].domain_separator == "0x" + "11" * 32


def test_request_claims_payload_is_v1_tagged_hex():
    claims = PaymentGuaranteeRequestClaims.new(
        user_address="0x1234567890123456789012345678901234567890",
        recipient_address="0x00000000000000000000000000000000000000Be",
        req_id=7,
        amount=1000,
        timestamp=1_700_000_000,
    )
    payload = claims.to_payload()
    assert payload["version"] == "v1"
    assert payload["req_id"] == "0x7"
    assert payload["amount"] == "0x3e8"
    assert payload["asset_address"] == "0x0000000000000000000000000000000000000000"
    assert "validation" not in payload


def test_validation_payload_omits_empty_optionals():
    validation = ValidationRequirement(
        validator="validator-id", subject="0x" + "42" * 32
    )
    payload = validation.to_payload()
    assert "deadline" not in payload
    assert "params" not in payload

    full = ValidationRequirement(
        validator="validator-id",
        subject="0x" + "42" * 32,
        deadline=123,
        params="0xdeadbeef",
    )
    assert full.to_payload()["deadline"] == 123
    assert full.to_payload()["params"] == "0xdeadbeef"


def test_supported_tokens_carry_domain_separator():
    tokens = SupportedTokensResponse.from_rpc(
        {
            "chain_id": 84532,
            "tokens": [
                {
                    "symbol": "USDC",
                    "address": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                    "decimals": 6,
                    "domain_separator": "0x" + "aa" * 32,
                },
                {"symbol": "ODD", "address": "0x" + "11" * 20},
            ],
        }
    )
    assert tokens.tokens[0].domain_separator == "0x" + "aa" * 32
    assert tokens.tokens[1].domain_separator is None
