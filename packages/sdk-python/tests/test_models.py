"""Tests for model from_rpc parsers and data-model edge cases."""

from __future__ import annotations

import pytest

from fourmica_sdk.models import (
    AssetBalanceInfo,
    CollateralEventInfo,
    GuaranteeInfo,
    PaymentGuaranteeRequestClaimsV2,
    PendingRemunerationInfo,
    RecipientPaymentInfo,
    SupportedTokensResponse,
)
from fourmica_sdk.signing import CorePublicParameters

ADDR1 = "0x0000000000000000000000000000000000000001"
ADDR2 = "0x0000000000000000000000000000000000000002"
USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"

_TAB_RAW = {
    "tab_id": "1",
    "user_address": ADDR1,
    "recipient_address": ADDR2,
    "asset_address": USDC,
    "start_timestamp": 100,
    "ttl_seconds": 3600,
    "status": "OPEN",
    "settlement_status": "PENDING",
    "created_at": 100,
    "updated_at": 200,
    "total_amount": "1000",
    "paid_amount": "0",
}

_GUARANTEE_RAW = {
    "tab_id": "1",
    "req_id": "1",
    "from_address": ADDR1,
    "to_address": ADDR2,
    "asset_address": USDC,
    "amount": "1000",
    "timestamp": 100,
    "certificate": None,
}


# ---------------------------------------------------------------------------
# GuaranteeInfo.from_rpc
# ---------------------------------------------------------------------------


def test_guarantee_info_from_rpc_snake_case():
    raw = {
        "tab_id": "42",
        "req_id": "3",
        "from_address": ADDR1,
        "to_address": ADDR2,
        "asset_address": USDC,
        "amount": "1000",
        "timestamp": 9999,
        "certificate": "0xdeadbeef",
    }
    g = GuaranteeInfo.from_rpc(raw)
    assert g.tab_id == 42
    assert g.req_id == 3
    assert g.from_address == ADDR1
    assert g.to_address == ADDR2
    assert g.asset_address == USDC
    assert g.amount == 1000
    assert g.timestamp == 9999
    assert g.certificate == "0xdeadbeef"


def test_guarantee_info_from_rpc_camel_case():
    raw = {
        "tabId": "10",
        "reqId": "2",
        "fromAddress": ADDR1,
        "toAddress": ADDR2,
        "assetAddress": USDC,
        "amount": "500",
        "startTimestamp": 1234,
        "certificate": None,
    }
    g = GuaranteeInfo.from_rpc(raw)
    assert g.tab_id == 10
    assert g.req_id == 2
    assert g.timestamp == 1234
    assert g.certificate is None


# ---------------------------------------------------------------------------
# CollateralEventInfo.from_rpc
# ---------------------------------------------------------------------------


def test_collateral_event_from_rpc_optional_ids_absent():
    raw = {
        "id": "evt-1",
        "user_address": ADDR1,
        "asset_address": USDC,
        "amount": "500",
        "event_type": "DEPOSIT",
        "created_at": 1000,
    }
    ev = CollateralEventInfo.from_rpc(raw)
    assert ev.id == "evt-1"
    assert ev.user_address == ADDR1
    assert ev.amount == 500
    assert ev.event_type == "DEPOSIT"
    assert ev.tab_id is None
    assert ev.req_id is None
    assert ev.tx_id is None
    assert ev.created_at == 1000


def test_collateral_event_from_rpc_with_ids():
    raw = {
        "id": "evt-2",
        "userAddress": ADDR1,
        "assetAddress": USDC,
        "amount": "200",
        "eventType": "LOCK",
        "tabId": "99",
        "reqId": "7",
        "txId": "0xabcd",
        "createdAt": 2000,
    }
    ev = CollateralEventInfo.from_rpc(raw)
    assert ev.tab_id == 99
    assert ev.req_id == 7
    assert ev.tx_id == "0xabcd"
    assert ev.event_type == "LOCK"


# ---------------------------------------------------------------------------
# AssetBalanceInfo.from_rpc
# ---------------------------------------------------------------------------


def test_asset_balance_info_from_rpc():
    raw = {
        "user_address": ADDR1,
        "asset_address": USDC,
        "total": "9000",
        "locked": "3000",
        "version": "2",
        "updated_at": 5000,
    }
    b = AssetBalanceInfo.from_rpc(raw)
    assert b.user_address == ADDR1
    assert b.asset_address == USDC
    assert b.total == 9000
    assert b.locked == 3000
    assert b.version == 2
    assert b.updated_at == 5000


# ---------------------------------------------------------------------------
# PendingRemunerationInfo.from_rpc
# ---------------------------------------------------------------------------


def test_pending_remuneration_info_from_rpc_with_guarantee():
    raw = {"tab": _TAB_RAW, "latest_guarantee": _GUARANTEE_RAW}
    pr = PendingRemunerationInfo.from_rpc(raw)
    assert pr.tab.tab_id == 1
    assert pr.latest_guarantee is not None
    assert pr.latest_guarantee.req_id == 1


def test_pending_remuneration_info_from_rpc_null_guarantee():
    raw = {"tab": _TAB_RAW, "latest_guarantee": None}
    pr = PendingRemunerationInfo.from_rpc(raw)
    assert pr.tab.tab_id == 1
    assert pr.latest_guarantee is None


# ---------------------------------------------------------------------------
# RecipientPaymentInfo.from_rpc
# ---------------------------------------------------------------------------


def test_recipient_payment_info_from_rpc():
    raw = {
        "user_address": ADDR1,
        "recipient_address": ADDR2,
        "tx_hash": "0xdeadbeef",
        "amount": "750",
        "verified": True,
        "finalized": False,
        "failed": False,
        "created_at": 3000,
    }
    p = RecipientPaymentInfo.from_rpc(raw)
    assert p.user_address == ADDR1
    assert p.recipient_address == ADDR2
    assert p.tx_hash == "0xdeadbeef"
    assert p.amount == 750
    assert p.verified is True
    assert p.finalized is False
    assert p.failed is False
    assert p.created_at == 3000


# ---------------------------------------------------------------------------
# SupportedTokensResponse.from_rpc
# ---------------------------------------------------------------------------


def test_supported_tokens_response_from_rpc():
    raw = {
        "chainId": 8453,
        "tokens": [
            {"symbol": "USDC", "address": USDC, "decimals": 6},
            {"symbol": "ETH", "address": "0x0000000000000000000000000000000000000000"},
        ],
    }
    resp = SupportedTokensResponse.from_rpc(raw)
    assert resp.chain_id == 8453
    assert len(resp.tokens) == 2
    assert resp.tokens[0].symbol == "USDC"
    assert resp.tokens[0].address == USDC
    assert resp.tokens[0].decimals == 6
    assert resp.tokens[1].symbol == "ETH"
    assert resp.tokens[1].decimals is None


def test_supported_tokens_response_empty_list():
    raw = {"chain_id": 1, "tokens": []}
    resp = SupportedTokensResponse.from_rpc(raw)
    assert resp.chain_id == 1
    assert resp.tokens == []


# ---------------------------------------------------------------------------
# PaymentGuaranteeRequestClaimsV2 boundary validation
# ---------------------------------------------------------------------------


def test_claims_v2_accepts_min_validation_score_100():
    claims = PaymentGuaranteeRequestClaimsV2.new(
        user_address=ADDR1,
        recipient_address=ADDR2,
        tab_id=1,
        req_id=0,
        amount=1,
        timestamp=1,
        erc20_token=None,
        validation_registry_address="0x0000000000000000000000000000000000000011",
        validation_request_hash="0x" + "00" * 32,
        validation_chain_id=1,
        validator_address="0x0000000000000000000000000000000000000022",
        validator_agent_id=1,
        min_validation_score=100,
        validation_subject_hash="0x" + "00" * 32,
        required_validation_tag="",
        job_hash="0x" + "11" * 32,
    )
    assert claims.min_validation_score == 100


def test_claims_v2_accepts_min_validation_score_1():
    claims = PaymentGuaranteeRequestClaimsV2.new(
        user_address=ADDR1,
        recipient_address=ADDR2,
        tab_id=1,
        req_id=0,
        amount=1,
        timestamp=1,
        erc20_token=None,
        validation_registry_address="0x0000000000000000000000000000000000000011",
        validation_request_hash="0x" + "00" * 32,
        validation_chain_id=1,
        validator_address="0x0000000000000000000000000000000000000022",
        validator_agent_id=1,
        min_validation_score=1,
        validation_subject_hash="0x" + "00" * 32,
        required_validation_tag="",
        job_hash="0x" + "11" * 32,
    )
    assert claims.min_validation_score == 1


# ---------------------------------------------------------------------------
# CorePublicParameters edge cases
# ---------------------------------------------------------------------------


def test_core_public_parameters_raises_when_public_key_missing():
    with pytest.raises(ValueError, match="missing core public parameter"):
        CorePublicParameters.from_rpc(
            {
                "contractAddress": "0x1234567890abcdef1234567890abcdef12345678",
                "ethereumHttpRpcUrl": "http://localhost:8545",
                "eip712Name": "4mica",
                "eip712Version": "1",
                "chainId": 1,
            }
        )
