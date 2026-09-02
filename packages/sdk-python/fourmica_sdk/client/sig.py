"""EIP-712 authorizations a payer signs instead of transacting. Port of
``sdk-rust/src/client/sig.rs``. Signing never touches the network."""

from __future__ import annotations

import secrets
import time

from ..authorizations import (
    Eip2612Permit,
    Permit2Authorization,
    ReceiveAuthorization,
    WithdrawalCancelAuthorization,
    WithdrawalRequestAuthorization,
    split_signature,
)
from ..digest import (
    PERMIT2_ADDRESS,
    digest_for_cancel_withdrawal,
    digest_for_permit,
    digest_for_permit2_transfer,
    digest_for_receive_authorization,
    digest_for_request_withdrawal,
)
from .ctx import ClientCtx

#: How long a signed authorization stays redeemable.
AUTHORIZATION_TTL_SECS = 3600

#: An unlimited EIP-2612 allowance, deliberately: it only lets Permit2 act,
#: and Permit2 still requires a signed PermitTransferFrom per transfer. A
#: tight allowance would just force another permit on the next deposit, at
#: the submitter's expense.
_UNLIMITED = 2**256 - 1


def _now() -> int:
    return max(int(time.time()), 0)


def _valid_before() -> int:
    return _now() + AUTHORIZATION_TTL_SECS


async def _sign(ctx: ClientCtx, digest: bytes) -> bytes:
    signature = await ctx.signer.sign_hash(digest)
    if isinstance(signature, str):
        signature = bytes.fromhex(signature.removeprefix("0x"))
    return bytes(signature)


async def eip3009_authorization(
    ctx: ClientCtx, token: str, amount: int
) -> ReceiveAuthorization:
    """Signs an EIP-3009 ``receiveWithAuthorization`` crediting *amount* of
    *token* to the signer via the Core4Mica contract. Only tokens implementing
    EIP-3009 (USDC and similar) can redeem this."""
    nonce = "0x" + secrets.token_bytes(32).hex()
    return await _receive_authorization(ctx, token, ctx.contract_address, amount, nonce)


async def debit_authorization(
    ctx: ClientCtx, token: str, receiver: str, amount: int, cycle_id: str
) -> ReceiveAuthorization:
    """Signs an EIP-3009 authorization paying the signer's net debit to
    *receiver* (the ClearingHouse), with the nonce pinned to the cycle id as
    ``payNetDebitWithAuthorization`` requires."""
    return await _receive_authorization(ctx, token, receiver, amount, cycle_id)


async def _receive_authorization(
    ctx: ClientCtx, token: str, to: str, amount: int, nonce: str
) -> ReceiveAuthorization:
    domain_separator = await ctx.token_domain_separator(token)
    valid_before = _valid_before()
    digest = digest_for_receive_authorization(
        domain_separator,
        ctx.signer_address,
        to,
        amount,
        0,
        valid_before,
        nonce,
    )
    v, r, s = split_signature(await _sign(ctx, digest))
    return ReceiveAuthorization(
        from_address=ctx.signer_address,
        valid_after=0,
        valid_before=valid_before,
        nonce=nonce,
        v=v,
        r=r,
        s=s,
    )


async def permit2_authorization(
    ctx: ClientCtx, token: str, amount: int
) -> Permit2Authorization:
    """Signs a Permit2 ``PermitTransferFrom`` for a deposit, with a random
    nonce. Works for any ERC-20, but only if the signer has already approved
    Permit2 to move that token."""
    nonce = int.from_bytes(secrets.token_bytes(32), "big")
    return await _permit2_authorization(ctx, token, ctx.contract_address, amount, nonce)


async def debit_permit2_authorization(
    ctx: ClientCtx, token: str, receiver: str, amount: int, cycle_id: str
) -> Permit2Authorization:
    """Signs a Permit2 ``PermitTransferFrom`` paying the signer's net debit,
    with the nonce pinned to ``uint256(cycleId)`` as
    ``payNetDebitWithPermit2`` requires."""
    nonce = int(cycle_id, 16)
    return await _permit2_authorization(ctx, token, receiver, amount, nonce)


async def _permit2_authorization(
    ctx: ClientCtx, token: str, spender: str, amount: int, nonce: int
) -> Permit2Authorization:
    deadline = _valid_before()
    digest = digest_for_permit2_transfer(
        ctx.permit2_domain_separator, token, amount, spender, nonce, deadline
    )
    signature = await _sign(ctx, digest)
    return Permit2Authorization(
        from_address=ctx.signer_address,
        nonce=nonce,
        deadline=deadline,
        signature="0x" + signature.hex(),
    )


async def eip2612_permit(ctx: ClientCtx, token: str, nonce: int) -> Eip2612Permit:
    """Signs an EIP-2612 permit granting Permit2 an unlimited allowance for
    *token*. *nonce* must be the owner's current one, which arrives with the
    facilitator's ``PERMIT2_ALLOWANCE_REQUIRED`` rejection."""
    deadline = _valid_before()
    domain_separator = await ctx.token_domain_separator(token)
    digest = digest_for_permit(
        domain_separator,
        ctx.signer_address,
        PERMIT2_ADDRESS,
        _UNLIMITED,
        nonce,
        deadline,
    )
    v, r, s = split_signature(await _sign(ctx, digest))
    return Eip2612Permit(value=_UNLIMITED, deadline=deadline, v=v, r=r, s=s)


async def request_withdrawal_authorization(
    ctx: ClientCtx, asset: str, amount: int
) -> WithdrawalRequestAuthorization:
    """Signs a ``RequestWithdrawal`` authorization for *amount* of *asset*
    (the zero address for ETH) under Core4Mica's own domain."""
    valid_before = _valid_before()
    nonce = "0x" + secrets.token_bytes(32).hex()
    digest = digest_for_request_withdrawal(
        ctx.core_domain_separator,
        ctx.signer_address,
        asset,
        amount,
        0,
        valid_before,
        nonce,
    )
    signature = await _sign(ctx, digest)
    return WithdrawalRequestAuthorization(
        user=ctx.signer_address,
        asset=asset,
        amount=amount,
        valid_after=0,
        valid_before=valid_before,
        nonce=nonce,
        signature="0x" + signature.hex(),
    )


async def cancel_withdrawal_authorization(
    ctx: ClientCtx, asset: str
) -> WithdrawalCancelAuthorization:
    """Signs a ``CancelWithdrawal`` authorization for the pending request on
    *asset*."""
    valid_before = _valid_before()
    nonce = "0x" + secrets.token_bytes(32).hex()
    digest = digest_for_cancel_withdrawal(
        ctx.core_domain_separator,
        ctx.signer_address,
        asset,
        0,
        valid_before,
        nonce,
    )
    signature = await _sign(ctx, digest)
    return WithdrawalCancelAuthorization(
        user=ctx.signer_address,
        asset=asset,
        valid_after=0,
        valid_before=valid_before,
        nonce=nonce,
        signature="0x" + signature.hex(),
    )
