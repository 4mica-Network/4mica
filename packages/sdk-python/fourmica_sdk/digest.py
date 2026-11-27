from __future__ import annotations

from eth_abi import encode as abi_encode
from eth_utils import keccak

from .utils import BYTES32_LENGTH

PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3"

# The contract kept this EIP-712 name through the Treasury rename.
CORE_EIP712_NAME = "Core4Mica"
CORE_EIP712_VERSION = "1"

# Pinned byte for byte: any drift breaks on-chain verification.

ERC3009_TYPE = (
    "ReceiveWithAuthorization(address from,address to,uint256 value,"
    "uint256 validAfter,uint256 validBefore,bytes32 nonce)"
)
PERMIT2_TRANSFER_TYPE = (
    "PermitTransferFrom(TokenPermissions permitted,address spender,"
    "uint256 nonce,uint256 deadline)TokenPermissions(address token,uint256 amount)"
)
TOKEN_PERMISSIONS_TYPE = "TokenPermissions(address token,uint256 amount)"  # noqa: S105
EIP2612_PERMIT_TYPE = (
    "Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
)
REQUEST_WITHDRAWAL_TYPE = (
    "RequestWithdrawal(address user,address asset,uint256 amount,"
    "uint256 validAfter,uint256 validBefore,bytes32 nonce)"
)
CANCEL_WITHDRAWAL_TYPE = (
    "CancelWithdrawal(address user,address asset,uint256 validAfter,"
    "uint256 validBefore,bytes32 nonce)"
)


def _bytes32(value: str | bytes) -> bytes:
    if isinstance(value, bytes):
        data = value
    else:
        data = bytes.fromhex(str(value).removeprefix("0x"))
    if len(data) != BYTES32_LENGTH:
        raise ValueError(f"expected 32 bytes, got {len(data)}")
    return data


def eip712_digest(domain_separator: str | bytes, struct_hash: bytes) -> bytes:
    return keccak(b"\x19\x01" + _bytes32(domain_separator) + _bytes32(struct_hash))


def eip712_domain_separator(
    name: str, version: str | None, chain_id: int, verifying_contract: str
) -> bytes:
    if version is not None:
        type_hash = keccak(
            text="EIP712Domain(string name,string version,uint256 chainId,"
            "address verifyingContract)"
        )
    else:
        type_hash = keccak(
            text="EIP712Domain(string name,uint256 chainId,address verifyingContract)"
        )

    encoded = type_hash + keccak(text=name)
    if version is not None:
        encoded += keccak(text=version)
    encoded += abi_encode(["uint256", "address"], [int(chain_id), verifying_contract])
    return keccak(encoded)


def permit2_domain_separator(chain_id: int) -> bytes:
    return eip712_domain_separator("Permit2", None, chain_id, PERMIT2_ADDRESS)


def core_domain_separator(chain_id: int, contract: str) -> bytes:
    return eip712_domain_separator(
        CORE_EIP712_NAME, CORE_EIP712_VERSION, chain_id, contract
    )


def digest_for_receive_authorization(
    domain_separator: str | bytes,
    from_address: str,
    to_address: str,
    value: int,
    valid_after: int,
    valid_before: int,
    nonce: str | bytes,
) -> bytes:
    struct_hash = keccak(
        abi_encode(
            [
                "bytes32",
                "address",
                "address",
                "uint256",
                "uint256",
                "uint256",
                "bytes32",
            ],
            [
                keccak(text=ERC3009_TYPE),
                from_address,
                to_address,
                int(value),
                int(valid_after),
                int(valid_before),
                _bytes32(nonce),
            ],
        )
    )
    return eip712_digest(domain_separator, struct_hash)


def digest_for_permit2_transfer(
    domain_separator: str | bytes,
    token: str,
    amount: int,
    spender: str,
    nonce: int,
    deadline: int,
) -> bytes:
    permitted_hash = keccak(
        abi_encode(
            ["bytes32", "address", "uint256"],
            [keccak(text=TOKEN_PERMISSIONS_TYPE), token, int(amount)],
        )
    )
    struct_hash = keccak(
        abi_encode(
            ["bytes32", "bytes32", "address", "uint256", "uint256"],
            [
                keccak(text=PERMIT2_TRANSFER_TYPE),
                permitted_hash,
                spender,
                int(nonce),
                int(deadline),
            ],
        )
    )
    return eip712_digest(domain_separator, struct_hash)


def digest_for_permit(
    domain_separator: str | bytes,
    owner: str,
    spender: str,
    value: int,
    nonce: int,
    deadline: int,
) -> bytes:
    struct_hash = keccak(
        abi_encode(
            ["bytes32", "address", "address", "uint256", "uint256", "uint256"],
            [
                keccak(text=EIP2612_PERMIT_TYPE),
                owner,
                spender,
                int(value),
                int(nonce),
                int(deadline),
            ],
        )
    )
    return eip712_digest(domain_separator, struct_hash)


def digest_for_request_withdrawal(
    domain_separator: str | bytes,
    user: str,
    asset: str,
    amount: int,
    valid_after: int,
    valid_before: int,
    nonce: str | bytes,
) -> bytes:
    struct_hash = keccak(
        abi_encode(
            [
                "bytes32",
                "address",
                "address",
                "uint256",
                "uint256",
                "uint256",
                "bytes32",
            ],
            [
                keccak(text=REQUEST_WITHDRAWAL_TYPE),
                user,
                asset,
                int(amount),
                int(valid_after),
                int(valid_before),
                _bytes32(nonce),
            ],
        )
    )
    return eip712_digest(domain_separator, struct_hash)


def digest_for_cancel_withdrawal(
    domain_separator: str | bytes,
    user: str,
    asset: str,
    valid_after: int,
    valid_before: int,
    nonce: str | bytes,
) -> bytes:
    struct_hash = keccak(
        abi_encode(
            ["bytes32", "address", "address", "uint256", "uint256", "bytes32"],
            [
                keccak(text=CANCEL_WITHDRAWAL_TYPE),
                user,
                asset,
                int(valid_after),
                int(valid_before),
                _bytes32(nonce),
            ],
        )
    )
    return eip712_digest(domain_separator, struct_hash)
