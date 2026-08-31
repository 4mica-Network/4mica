"""Authorization digest parity. The type strings are pinned exactly as in
``sdk-rust/src/digest.rs``, and the two domain-separator reconstructions are
pinned against values read from the deployed contracts (Base Sepolia USDC and
the canonical Permit2) — the same expectations the Rust suite carries."""

from eth_account import Account

from fourmica_sdk.digest import (
    CANCEL_WITHDRAWAL_TYPE,
    EIP2612_PERMIT_TYPE,
    ERC3009_TYPE,
    PERMIT2_TRANSFER_TYPE,
    REQUEST_WITHDRAWAL_TYPE,
    core_domain_separator,
    digest_for_cancel_withdrawal,
    digest_for_permit2_transfer,
    digest_for_receive_authorization,
    digest_for_request_withdrawal,
    eip712_domain_separator,
    permit2_domain_separator,
)

USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
ACCOUNT = Account.from_key(KEY)
DOMAIN = bytes.fromhex("00112233445566778899aabbccddeeff" * 2)
NONCE = "0x" + "de" * 32


def test_type_strings_are_pinned():
    assert ERC3009_TYPE == (
        "ReceiveWithAuthorization(address from,address to,uint256 value,"
        "uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    )
    assert PERMIT2_TRANSFER_TYPE == (
        "PermitTransferFrom(TokenPermissions permitted,address spender,"
        "uint256 nonce,uint256 deadline)"
        "TokenPermissions(address token,uint256 amount)"
    )
    assert EIP2612_PERMIT_TYPE == (
        "Permit(address owner,address spender,uint256 value,uint256 nonce,"
        "uint256 deadline)"
    )
    assert REQUEST_WITHDRAWAL_TYPE == (
        "RequestWithdrawal(address user,address asset,uint256 amount,"
        "uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    )
    assert CANCEL_WITHDRAWAL_TYPE == (
        "CancelWithdrawal(address user,address asset,uint256 validAfter,"
        "uint256 validBefore,bytes32 nonce)"
    )


def test_reconstructed_domain_separator_matches_real_usdc():
    """Pinned against Base Sepolia USDC's own DOMAIN_SEPARATOR(). The whole
    risk of reconstruction is metadata disagreeing with the token, so the
    expectation comes from the token, not from re-running the formula."""
    separator = eip712_domain_separator("USDC", "2", 84532, USDC)
    assert separator.hex() == (
        "71f17a3b2ff373b803d70a5a07c046c1a2bc8e89c09ef722fcb047abe94c9818"
    )


def test_reconstructed_domain_separator_is_sensitive_to_the_name():
    # Base *mainnet* USDC calls itself "USD Coin"; using the wrong one is a
    # silent failure — a well-formed separator nothing verifies against.
    assert eip712_domain_separator("USDC", "2", 84532, USDC) != (
        eip712_domain_separator("USD Coin", "2", 84532, USDC)
    )


def test_derived_permit2_domain_matches_the_deployed_contract():
    assert permit2_domain_separator(84532).hex() == (
        "010f27a92fb9a32622f44f001dc4d15706a85b33499cfc2ce9033113ab26592c"
    )
    assert permit2_domain_separator(84532) != permit2_domain_separator(1)


def test_core_domain_separator_is_deployment_specific():
    contract = "0x00000000000000000000000000000000C04E4a1c"
    assert core_domain_separator(84532, contract) == eip712_domain_separator(
        "Core4Mica", "1", 84532, contract
    )
    assert core_domain_separator(84532, contract) != core_domain_separator(1, contract)
    # Core signs requests under its own operator domain; reusing that name
    # would produce a well-formed separator Core4Mica rejects.
    assert core_domain_separator(84532, contract) != eip712_domain_separator(
        "4mica", "1", 84532, contract
    )


def test_receive_authorization_signature_recovers_to_signer():
    digest = digest_for_receive_authorization(
        DOMAIN,
        ACCOUNT.address,
        "0x00000000000000000000000000000000000000Be",
        1_000_000,
        0,
        2_000_000_000,
        NONCE,
    )
    signed = ACCOUNT.unsafe_sign_hash(digest)
    assert Account._recover_hash(digest, signature=signed.signature) == ACCOUNT.address


def test_permit2_transfer_signature_recovers_to_signer():
    digest = digest_for_permit2_transfer(
        DOMAIN,
        USDC,
        1_000_000,
        "0x00000000000000000000000000000000000000Be",
        42,
        2_000_000_000,
    )
    signed = ACCOUNT.unsafe_sign_hash(digest)
    assert Account._recover_hash(digest, signature=signed.signature) == ACCOUNT.address


def test_request_and_cancel_digests_differ_for_the_same_inputs():
    """The two withdrawal actions share a nonce namespace on-chain, so their
    digests must differ even when every shared field agrees — otherwise one
    signature would authorize both."""
    request = digest_for_request_withdrawal(
        DOMAIN, ACCOUNT.address, USDC, 0, 0, 2_000_000_000, NONCE
    )
    cancel = digest_for_cancel_withdrawal(
        DOMAIN, ACCOUNT.address, USDC, 0, 2_000_000_000, NONCE
    )
    assert request != cancel
