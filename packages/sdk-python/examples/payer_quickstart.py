import asyncio
import json
import os
import time

from eth_account import Account
from fourmica_sdk import (
    AssetBalanceInfo,
    Client,
    ConfigBuilder,
    PaymentGuaranteeRequestClaims,
    PaymentGuaranteeRequestClaimsV2,
    SigningScheme,
    compute_validation_request_hash,
    compute_validation_subject_hash,
)

PAYER_KEY = os.environ["PAYER_KEY"]
RECIPIENT_ADDRESS = os.environ["RECIPIENT_ADDRESS"]
TAB_ID = int(os.environ["TAB_ID"], 0)
REQ_ID = int(os.environ["REQ_ID"], 0)
DEFAULT_ASSET_ADDRESS = "0x0000000000000000000000000000000000000000"
REQUESTED_AMOUNT_WEI = int(os.getenv("AMOUNT_WEI", "100000000000000000"), 0)
ASSET_ADDRESS = os.getenv("ASSET_ADDRESS") or DEFAULT_ASSET_ADDRESS
RECIPIENT_KEY = os.getenv("RECIPIENT_KEY")
VALIDATION_REGISTRY_ADDRESS = os.getenv("VALIDATION_REGISTRY_ADDRESS")
VALIDATION_CHAIN_ID = os.getenv("VALIDATION_CHAIN_ID")
VALIDATOR_ADDRESS = os.getenv("VALIDATOR_ADDRESS")
VALIDATOR_AGENT_ID = os.getenv("VALIDATOR_AGENT_ID")
MIN_VALIDATION_SCORE = os.getenv("MIN_VALIDATION_SCORE")
REQUIRED_VALIDATION_TAG = os.getenv("REQUIRED_VALIDATION_TAG", "")
JOB_HASH = os.getenv("JOB_HASH")


def build_claims(
    payer_client: Client,
    user_address: str,
    amount_wei: int,
    timestamp: int,
) -> PaymentGuaranteeRequestClaims | PaymentGuaranteeRequestClaimsV2:
    base_claims = PaymentGuaranteeRequestClaims.new(
        user_address=user_address,
        recipient_address=RECIPIENT_ADDRESS,
        tab_id=TAB_ID,
        req_id=REQ_ID,
        amount=amount_wei,
        timestamp=timestamp,
        erc20_token=ASSET_ADDRESS,
    )

    wants_v2 = any(
        value is not None
        for value in (
            VALIDATION_REGISTRY_ADDRESS,
            VALIDATION_CHAIN_ID,
            VALIDATOR_ADDRESS,
            VALIDATOR_AGENT_ID,
            MIN_VALIDATION_SCORE,
            JOB_HASH,
        )
    )
    if not wants_v2:
        return base_claims

    missing = [
        name
        for name, value in (
            ("VALIDATION_REGISTRY_ADDRESS", VALIDATION_REGISTRY_ADDRESS),
            ("VALIDATOR_ADDRESS", VALIDATOR_ADDRESS),
            ("VALIDATOR_AGENT_ID", VALIDATOR_AGENT_ID),
            ("MIN_VALIDATION_SCORE", MIN_VALIDATION_SCORE),
            ("JOB_HASH", JOB_HASH),
        )
        if value is None
    ]
    if missing:
        raise SystemExit(
            "V2 payment requested but missing required env vars: " + ", ".join(missing)
        )

    validation_chain_id = (
        int(VALIDATION_CHAIN_ID, 0)
        if VALIDATION_CHAIN_ID is not None
        else int(payer_client.params.chain_id)
    )
    validation_subject_hash = compute_validation_subject_hash(base_claims)
    partial_claims = PaymentGuaranteeRequestClaimsV2.new(
        user_address=base_claims.user_address,
        recipient_address=base_claims.recipient_address,
        tab_id=base_claims.tab_id,
        req_id=base_claims.req_id,
        amount=base_claims.amount,
        timestamp=base_claims.timestamp,
        erc20_token=base_claims.asset_address,
        validation_registry_address=VALIDATION_REGISTRY_ADDRESS,
        validation_request_hash="0x" + "00" * 32,
        validation_chain_id=validation_chain_id,
        validator_address=VALIDATOR_ADDRESS,
        validator_agent_id=int(VALIDATOR_AGENT_ID, 0),
        min_validation_score=int(MIN_VALIDATION_SCORE, 0),
        validation_subject_hash=validation_subject_hash,
        required_validation_tag=REQUIRED_VALIDATION_TAG,
        job_hash=JOB_HASH,
    )
    return PaymentGuaranteeRequestClaimsV2.new(
        user_address=partial_claims.user_address,
        recipient_address=partial_claims.recipient_address,
        tab_id=partial_claims.tab_id,
        req_id=partial_claims.req_id,
        amount=partial_claims.amount,
        timestamp=partial_claims.timestamp,
        erc20_token=partial_claims.asset_address,
        validation_registry_address=partial_claims.validation_registry_address,
        validation_request_hash=compute_validation_request_hash(partial_claims),
        validation_chain_id=partial_claims.validation_chain_id,
        validator_address=partial_claims.validator_address,
        validator_agent_id=partial_claims.validator_agent_id,
        min_validation_score=partial_claims.min_validation_score,
        validation_subject_hash=partial_claims.validation_subject_hash,
        required_validation_tag=partial_claims.required_validation_tag,
        job_hash=partial_claims.job_hash,
    )


def serialize_claims(
    claims: PaymentGuaranteeRequestClaims | PaymentGuaranteeRequestClaimsV2,
) -> dict:
    payload = {
        "version": "v1",
        "user_address": claims.user_address,
        "recipient_address": claims.recipient_address,
        "tab_id": claims.tab_id,
        "req_id": claims.req_id,
        "amount": claims.amount,
        "asset_address": claims.asset_address,
        "timestamp": claims.timestamp,
    }
    if isinstance(claims, PaymentGuaranteeRequestClaimsV2):
        payload.update(
            {
                "version": "v2",
                "validation_registry_address": claims.validation_registry_address,
                "validation_request_hash": claims.validation_request_hash,
                "validation_chain_id": claims.validation_chain_id,
                "validator_address": claims.validator_address,
                "validator_agent_id": claims.validator_agent_id,
                "min_validation_score": claims.min_validation_score,
                "validation_subject_hash": claims.validation_subject_hash,
                "required_validation_tag": claims.required_validation_tag,
            }
        )
    return payload


async def main() -> None:
    payer_cfg = ConfigBuilder().from_env().wallet_private_key(PAYER_KEY).build()
    payer_client = await Client.new(payer_cfg)
    recipient_client = None
    try:
        user_address = Account.from_key(PAYER_KEY).address
        amount_wei = REQUESTED_AMOUNT_WEI

        balance_raw = await payer_client.rpc.get_user_asset_balance(
            user_address, ASSET_ADDRESS
        )
        if balance_raw:
            balance = AssetBalanceInfo.from_rpc(balance_raw)
            available = max(balance.total - balance.locked, 0)
            print("COLLATERAL_TOTAL=", balance.total)
            print("COLLATERAL_LOCKED=", balance.locked)
            print("COLLATERAL_AVAILABLE=", available)
            if available <= 0:
                raise SystemExit("No available collateral for this asset.")
            if amount_wei > available:
                amount_wei = available
            if amount_wei <= 0:
                raise SystemExit("Requested amount exceeds available collateral.")
        else:
            print("COLLATERAL_TOTAL= <unknown>")
            print("COLLATERAL_LOCKED= <unknown>")
            print("COLLATERAL_AVAILABLE= <unknown>")
        print("AMOUNT_WEI=", amount_wei)

        claims = build_claims(
            payer_client, user_address, amount_wei, timestamp=int(time.time())
        )
        signature = await payer_client.user.sign_payment(claims, SigningScheme.EIP712)

        print("PAYER_SIGNATURE=", signature.signature)
        print("CLAIMS_JSON=", json.dumps(serialize_claims(claims)))
        if RECIPIENT_KEY:
            recipient_cfg = (
                ConfigBuilder().from_env().wallet_private_key(RECIPIENT_KEY).build()
            )
            recipient_client = await Client.new(recipient_cfg)
            cert = await recipient_client.recipient.issue_payment_guarantee(
                claims, signature.signature, SigningScheme.EIP712
            )
            print("CERT_CLAIMS=", cert.claims)
            print("CERT_SIGNATURE=", cert.signature)
    finally:
        if recipient_client is not None:
            await recipient_client.aclose()
        await payer_client.aclose()


if __name__ == "__main__":
    asyncio.run(main())
