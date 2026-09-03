"""Authorization builders: what they bind, and that every signature recovers
to the client's signer over the exact digest a redeemer would rebuild."""

import pytest
from eth_account import Account
from stubs import (
    CONTRACT_ADDRESS,
    TEST_ADDRESS,
    TOKEN_ADDRESS,
    TOKEN_DOMAIN,
    FakeRpc,
    make_ctx,
    supported_tokens,
)

from fourmica_sdk.client import sig
from fourmica_sdk.digest import (
    PERMIT2_ADDRESS,
    digest_for_cancel_withdrawal,
    digest_for_permit,
    digest_for_permit2_transfer,
    digest_for_receive_authorization,
    digest_for_request_withdrawal,
)
from fourmica_sdk.errors import MissingTokenDomainSeparatorError

CYCLE_ID = "0x" + "aa" * 32


def token_ctx(domain=TOKEN_DOMAIN):
    return make_ctx(rpc=FakeRpc(supported_tokens=supported_tokens(domain)))


def vrs_signature(auth) -> bytes:
    return (
        bytes.fromhex(auth.r.removeprefix("0x"))
        + bytes.fromhex(auth.s.removeprefix("0x"))
        + bytes([auth.v])
    )


async def test_eip3009_authorization_recovers_and_binds_the_contract():
    ctx = token_ctx()
    auth = await sig.eip3009_authorization(ctx, TOKEN_ADDRESS, 1_000_000)

    assert auth.from_address == TEST_ADDRESS
    assert auth.valid_after == 0
    assert auth.valid_before > auth.valid_after
    assert int(auth.nonce, 16) != 0

    digest = digest_for_receive_authorization(
        TOKEN_DOMAIN,
        auth.from_address,
        CONTRACT_ADDRESS,
        1_000_000,
        auth.valid_after,
        auth.valid_before,
        auth.nonce,
    )
    recovered = Account._recover_hash(digest, signature=vrs_signature(auth))
    assert recovered == TEST_ADDRESS


async def test_debit_authorization_nonce_is_the_cycle_id():
    ctx = token_ctx()
    receiver = "0x2222222222222222222222222222222222222222"
    auth = await sig.debit_authorization(ctx, TOKEN_ADDRESS, receiver, 5000, CYCLE_ID)

    assert auth.nonce == CYCLE_ID
    digest = digest_for_receive_authorization(
        TOKEN_DOMAIN,
        auth.from_address,
        receiver,
        5000,
        auth.valid_after,
        auth.valid_before,
        CYCLE_ID,
    )
    assert Account._recover_hash(digest, signature=vrs_signature(auth)) == TEST_ADDRESS


async def test_debit_permit2_nonce_is_uint256_of_the_cycle_id():
    ctx = token_ctx()
    receiver = "0x2222222222222222222222222222222222222222"
    auth = await sig.debit_permit2_authorization(
        ctx, TOKEN_ADDRESS, receiver, 5000, CYCLE_ID
    )

    assert auth.nonce == int(CYCLE_ID, 16)
    digest = digest_for_permit2_transfer(
        ctx.permit2_domain_separator,
        TOKEN_ADDRESS,
        5000,
        receiver,
        auth.nonce,
        auth.deadline,
    )
    signature = bytes.fromhex(auth.signature.removeprefix("0x"))
    assert Account._recover_hash(digest, signature=signature) == TEST_ADDRESS


async def test_eip2612_permit_grants_permit2_unlimited():
    ctx = token_ctx()
    permit = await sig.eip2612_permit(ctx, TOKEN_ADDRESS, nonce=7)

    assert permit.value == 2**256 - 1
    digest = digest_for_permit(
        TOKEN_DOMAIN, TEST_ADDRESS, PERMIT2_ADDRESS, permit.value, 7, permit.deadline
    )
    recovered = Account._recover_hash(digest, signature=vrs_signature(permit))
    assert recovered == TEST_ADDRESS


async def test_missing_token_domain_refuses_to_sign():
    ctx = token_ctx(domain=None)
    with pytest.raises(MissingTokenDomainSeparatorError):
        await sig.eip3009_authorization(ctx, TOKEN_ADDRESS, 1)


async def test_withdrawal_authorizations_sign_under_the_core_domain():
    ctx = make_ctx()
    request = await sig.request_withdrawal_authorization(ctx, TOKEN_ADDRESS, 1000)
    cancel = await sig.cancel_withdrawal_authorization(ctx, TOKEN_ADDRESS)

    request_digest = digest_for_request_withdrawal(
        ctx.core_domain_separator,
        request.user,
        request.asset,
        request.amount,
        request.valid_after,
        request.valid_before,
        request.nonce,
    )
    cancel_digest = digest_for_cancel_withdrawal(
        ctx.core_domain_separator,
        cancel.user,
        cancel.asset,
        cancel.valid_after,
        cancel.valid_before,
        cancel.nonce,
    )
    for auth, digest in ((request, request_digest), (cancel, cancel_digest)):
        signature = bytes.fromhex(auth.signature.removeprefix("0x"))
        assert Account._recover_hash(digest, signature=signature) == TEST_ADDRESS
    assert request.nonce != cancel.nonce
