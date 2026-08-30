"""Collateral lifecycle against a live core + anvil: deposits over both asset
kinds, the account views that read them back, and the withdrawal request /
cancel round-trip. Finalization is not exercised — the dev stack's grace
period is minutes long by design.

See live_stack.py for environment and the required WalletRole grant.
"""

import pytest
from live_stack import (
    credited_balance,
    ensure_collateral,
    mint_mock_erc20,
    requires_live_stack,
)

pytestmark = [pytest.mark.integration, requires_live_stack]

NATIVE_DEPOSIT = 10**15
ERC20_DEPOSIT = 10**6


async def _native_collateral(client) -> int:
    positions = await client.account.assets()
    native = [p for p in positions if int(p.asset, 16) == 0]
    return native[0].collateral if native else 0


async def test_native_deposit_reaches_chain_and_api(payer):
    # principalBalance is stablecoin-only (Aave scaled accounting) and reverts
    # UnsupportedAsset for ETH — native collateral reads via getUserAllAssets.
    before = await _native_collateral(payer)

    receipt = await payer.deposit.of(None, NATIVE_DEPOSIT).send()
    assert receipt.tx_hash.startswith("0x")
    assert receipt.account == payer.signer_address

    assert await _native_collateral(payer) >= before + NATIVE_DEPOSIT
    balance = await credited_balance(payer, None)
    assert balance is not None, "observer never credited the deposit"
    assert balance.total >= NATIVE_DEPOSIT
    assert balance.locked >= 0


async def test_erc20_mint_approve_deposit(payer):
    tokens = await payer.tokens.supported()
    assert tokens.tokens, "core advertises no supported tokens"
    token = tokens.tokens[0].address

    await mint_mock_erc20(payer, token, payer.signer_address, ERC20_DEPOSIT)

    deposit = payer.deposit.of(token, ERC20_DEPOSIT)
    await deposit.self_funded().approve()
    receipt = await deposit.send()
    assert receipt.asset.lower() == token.lower()

    assert await payer.account.principal_balance(token) >= ERC20_DEPOSIT
    assert await credited_balance(payer, token) is not None


async def test_account_views_are_consistent(payer):
    await ensure_collateral(payer, None, NATIVE_DEPOSIT)

    positions = await payer.account.assets()
    native = [p for p in positions if int(p.asset, 16) == 0]
    assert native, "no native position after a credited deposit"
    assert native[0].collateral >= NATIVE_DEPOSIT

    withdrawable = await payer.account.withdrawable_balance(None)
    assert withdrawable <= native[0].collateral


async def test_withdrawal_request_and_cancel_roundtrip(payer):
    await ensure_collateral(payer, None, NATIVE_DEPOSIT)
    amount = NATIVE_DEPOSIT // 10

    await payer.withdraw.request(None, amount).send()
    positions = {p.asset.lower(): p for p in await payer.account.assets()}
    native = positions["0x0000000000000000000000000000000000000000"]
    assert native.withdrawal_request_amount == amount
    assert native.withdrawal_request_timestamp > 0

    await payer.withdraw.cancel(None).send()
    positions = {p.asset.lower(): p for p in await payer.account.assets()}
    native = positions["0x0000000000000000000000000000000000000000"]
    assert native.withdrawal_request_amount == 0


async def test_supported_tokens_expose_gasless_metadata(payer):
    tokens = await payer.tokens.supported()
    assert tokens.chain_id == payer.public_params.chain_id
    assert tokens.tokens
    # The dev stack's mock stablecoins implement EIP-712, so core should relay
    # a domain separator for at least one — the input gasless signing needs.
    assert any(t.domain_separator for t in tokens.tokens)
