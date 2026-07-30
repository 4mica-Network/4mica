//! EIP-712 message shapes and the digests derived from them.
//!
//! Everything a deposit signature is checked against lives here: the four signed structs, the
//! `0x1901` wrapper, Permit2's offline domain derivation, and signer recovery. No I/O, no chain
//! access — given a domain separator and a message, these are pure functions.
//!
//! Kept apart from the deposit flow deliberately. These type strings are fixed by their standards
//! (EIP-712, EIP-2612, EIP-3009, Permit2), so they change for entirely different reasons than the
//! verification logic that consumes them — and a mistake here is invisible until a signature fails
//! to recover on-chain.
//!
//! The structs are declared rather than imported from `sdk-4mica`, whose `digest` module is
//! private. That is also the better arrangement: an independently written verifier means a bug in
//! the SDK's construction fails this check instead of cancelling out against it.

use alloy::primitives::{Address, B256, Signature, U256, normalize_v};
use alloy::sol;
use alloy::sol_types::SolStruct;
use sdk_4mica::contract::PERMIT2_ADDRESS;

use super::DepositError;

sol! {
    /// EIP-3009's signed struct, declared here rather than imported: `sdk-4mica` keeps its digest
    /// module private, and an independently written verifier is preferable anyway — a bug in the
    /// SDK's construction should fail this check, not cancel out against it. The type string is
    /// fixed by EIP-3009, so there is nothing to drift against.
    struct ReceiveWithAuthorization {
        address from;
        address to;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
    }

    /// Permit2 `SignatureTransfer` token permission.
    struct TokenPermissions {
        address token;
        uint256 amount;
    }

    /// EIP-2612's signed struct, used to grant Permit2 its allowance without the payer paying gas.
    struct Permit {
        address owner;
        address spender;
        uint256 value;
        uint256 nonce;
        uint256 deadline;
    }

    /// Permit2's signed struct.
    ///
    /// Note the absence of x402's `Witness`: that exists because `exact` pays an arbitrary payee
    /// and `PermitTransferFrom` binds `spender` but not the destination, so a facilitator could
    /// otherwise redirect funds. A deposit has no free destination — Core4Mica pulls into itself
    /// and credits `from` — so binding `spender` to Core4Mica already constrains it fully, and the
    /// canonical `x402ExactPermit2Proxy` is unnecessary here.
    struct PermitTransferFrom {
        TokenPermissions permitted;
        address spender;
        uint256 nonce;
        uint256 deadline;
    }
}

/// `keccak256(0x19 0x01 ‖ domainSeparator ‖ hashStruct(ReceiveWithAuthorization))`.
pub(super) fn receive_authorization_digest(
    domain_separator: B256,
    from: Address,
    to: Address,
    value: U256,
    valid_after: U256,
    valid_before: U256,
    nonce: B256,
) -> B256 {
    let message = ReceiveWithAuthorization {
        from,
        to,
        value,
        validAfter: valid_after,
        validBefore: valid_before,
        nonce,
    };
    eip712_digest(domain_separator, message.eip712_hash_struct())
}

/// `keccak256(0x19 0x01 ‖ domainSeparator ‖ structHash)`.
pub(super) fn eip712_digest(domain_separator: B256, struct_hash: B256) -> B256 {
    let mut buf = [0u8; 66];
    buf[0] = 0x19;
    buf[1] = 0x01;
    buf[2..34].copy_from_slice(domain_separator.as_slice());
    buf[34..66].copy_from_slice(struct_hash.as_slice());
    alloy::primitives::keccak256(buf)
}

/// Recovers `(r, s, v)` and asserts it matches the declared signer.
pub(super) fn require_signer(
    digest: &B256,
    r: B256,
    s: B256,
    v: u8,
    declared: Address,
) -> Result<(), DepositError> {
    let recovered = recover_signer(digest, r, s, v)?;
    if recovered != declared {
        return Err(DepositError::SignatureMismatch {
            recovered,
            declared,
        });
    }
    Ok(())
}

/// Permit2's EIP-712 domain separator for `chain_id`.
///
/// Needs neither a chain read nor server-advertised metadata: Permit2 is deployed at one canonical
/// address on every chain and its domain has a fixed name and no version.
pub(super) fn permit2_domain_separator(chain_id: u64) -> B256 {
    let type_hash = alloy::primitives::keccak256(
        b"EIP712Domain(string name,uint256 chainId,address verifyingContract)".as_slice(),
    );
    let mut encoded = Vec::with_capacity(32 * 4);
    encoded.extend_from_slice(type_hash.as_slice());
    encoded.extend_from_slice(alloy::primitives::keccak256(b"Permit2".as_slice()).as_slice());
    encoded.extend_from_slice(&U256::from(chain_id).to_be_bytes::<32>());
    encoded.extend_from_slice(PERMIT2_ADDRESS.into_word().as_slice());
    alloy::primitives::keccak256(encoded)
}

/// Permit2 `PermitTransferFrom` signing hash, with the nested `TokenPermissions` hashed first.
pub(super) fn permit_transfer_from_digest(
    domain_separator: B256,
    token: Address,
    amount: U256,
    spender: Address,
    nonce: U256,
    deadline: U256,
) -> B256 {
    let message = PermitTransferFrom {
        permitted: TokenPermissions { token, amount },
        spender,
        nonce,
        deadline,
    };
    eip712_digest(domain_separator, message.eip712_hash_struct())
}

/// Recovers the signer, accepting `v` in either Electrum (27/28) or raw parity (0/1) form —
/// EIP-3009 tokens expect the former, but signers differ and rejecting 0/1 would be gratuitous.
pub(super) fn recover_signer(
    digest: &B256,
    r: B256,
    s: B256,
    v: u8,
) -> Result<Address, DepositError> {
    let parity = normalize_v(v as u64).ok_or_else(|| {
        DepositError::MalformedSignature(format!("invalid signature v: {v}, expected 27/28"))
    })?;

    Signature::from_scalars_and_parity(r, s, parity)
        .recover_address_from_prehash(digest)
        .map_err(|err| DepositError::MalformedSignature(format!("unrecoverable signature: {err}")))
}

/// EIP-2612 `Permit` signing hash. The owner authorises `spender` to move `value` on their behalf,
/// bound to the owner's *current* `nonce` — which is what makes a permit single-use.
pub(super) fn permit_digest(
    domain_separator: B256,
    owner: Address,
    spender: Address,
    value: U256,
    nonce: U256,
    deadline: U256,
) -> B256 {
    let message = Permit {
        owner,
        spender,
        value,
        nonce,
        deadline,
    };
    eip712_digest(domain_separator, message.eip712_hash_struct())
}

/// Recovers a 65-byte compact signature and asserts it matches the declared signer.
///
/// Permit2 signs with a packed `bytes` blob rather than split `(v, r, s)`, so this is the
/// counterpart to [`require_signer`] for that shape.
pub(super) fn require_signer_from_bytes(
    digest: &B256,
    signature: &[u8],
    declared: Address,
) -> Result<(), DepositError> {
    let signature = Signature::try_from(signature).map_err(|err| {
        DepositError::MalformedSignature(format!("invalid permit2 signature: {err}"))
    })?;
    let recovered = signature
        .recover_address_from_prehash(digest)
        .map_err(|err| {
            DepositError::MalformedSignature(format!("unrecoverable signature: {err}"))
        })?;
    if recovered != declared {
        return Err(DepositError::SignatureMismatch {
            recovered,
            declared,
        });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloy::primitives::{address, b256};
    use alloy::signers::SignerSync;
    use alloy::signers::local::PrivateKeySigner;
    use sdk_4mica::contract::Core4Mica::ReceiveAuthorization;

    const CONTRACT: Address = address!("00000000000000000000000000000000c04e4a1c");
    /// An arbitrary separator: these tests check the *struct hashing*, so its value is irrelevant
    /// as long as both sides use the same one.
    const DOMAIN: B256 = b256!("1111111111111111111111111111111111111111111111111111111111111111");

    fn auth(from: Address) -> ReceiveAuthorization {
        ReceiveAuthorization {
            from,
            validAfter: U256::ZERO,
            validBefore: U256::from(2_000_000_000u64),
            nonce: B256::repeat_byte(0x42),
            v: 27,
            r: B256::ZERO,
            s: B256::ZERO,
        }
    }

    /// The EIP-2612 digest must match what the token's own `permit` will check; computed here from
    /// the literal type string so a swapped field fails rather than cancelling out.
    #[test]
    fn eip2612_digest_matches_an_independently_computed_hash() {
        use alloy::primitives::keccak256;

        let owner = address!("00000000000000000000000000000000000000a1");
        let value = U256::from(1_000u64);
        let nonce = U256::from(3u64);
        let deadline = U256::from(2_000_000_000u64);

        let type_hash = keccak256(
            b"Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"
                .as_slice(),
        );
        let word = |a: Address| {
            let mut w = [0u8; 32];
            w[12..].copy_from_slice(a.as_slice());
            w
        };
        let mut encoded = Vec::with_capacity(32 * 6);
        encoded.extend_from_slice(type_hash.as_slice());
        encoded.extend_from_slice(&word(owner));
        encoded.extend_from_slice(&word(PERMIT2_ADDRESS));
        encoded.extend_from_slice(&value.to_be_bytes::<32>());
        encoded.extend_from_slice(&nonce.to_be_bytes::<32>());
        encoded.extend_from_slice(&deadline.to_be_bytes::<32>());

        let expected = eip712_digest(DOMAIN, keccak256(encoded));
        let actual = eip712_digest(
            DOMAIN,
            Permit {
                owner,
                spender: PERMIT2_ADDRESS,
                value,
                nonce,
                deadline,
            }
            .eip712_hash_struct(),
        );
        assert_eq!(actual, expected);
    }

    /// Permit2's domain is fixed per chain, so a wrong derivation would silently produce
    /// signatures no deposit can ever redeem. Computed here from the literal type string.
    #[test]
    fn permit2_domain_matches_an_independently_computed_separator() {
        use alloy::primitives::keccak256;

        let chain_id = 1337u64;
        let type_hash = keccak256(
            b"EIP712Domain(string name,uint256 chainId,address verifyingContract)".as_slice(),
        );
        let mut encoded = Vec::with_capacity(32 * 4);
        encoded.extend_from_slice(type_hash.as_slice());
        encoded.extend_from_slice(keccak256(b"Permit2".as_slice()).as_slice());
        encoded.extend_from_slice(&U256::from(chain_id).to_be_bytes::<32>());
        let mut word = [0u8; 32];
        word[12..].copy_from_slice(PERMIT2_ADDRESS.as_slice());
        encoded.extend_from_slice(&word);

        assert_eq!(permit2_domain_separator(chain_id), keccak256(encoded));
    }

    /// The digest must match what the token's own `ecrecover` will check. Computed here from the
    /// literal EIP-3009 type string rather than via `eip712_hash_struct`, so a wrong field order
    /// fails instead of cancelling out on both sides.
    #[test]
    fn digest_matches_an_independently_computed_eip3009_hash() {
        use alloy::primitives::keccak256;

        let from = address!("00000000000000000000000000000000000000a1");
        let value = U256::from(1_000_000u64);
        let valid_after = U256::ZERO;
        let valid_before = U256::from(2_000_000_000u64);
        let nonce = B256::repeat_byte(0x42);

        let type_hash = keccak256(
            b"ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
                .as_slice(),
        );
        let word = |a: Address| {
            let mut w = [0u8; 32];
            w[12..].copy_from_slice(a.as_slice());
            w
        };
        let mut encoded = Vec::with_capacity(32 * 7);
        encoded.extend_from_slice(type_hash.as_slice());
        encoded.extend_from_slice(&word(from));
        encoded.extend_from_slice(&word(CONTRACT));
        encoded.extend_from_slice(&value.to_be_bytes::<32>());
        encoded.extend_from_slice(&valid_after.to_be_bytes::<32>());
        encoded.extend_from_slice(&valid_before.to_be_bytes::<32>());
        encoded.extend_from_slice(nonce.as_slice());

        let mut buf = Vec::with_capacity(66);
        buf.push(0x19);
        buf.push(0x01);
        buf.extend_from_slice(DOMAIN.as_slice());
        buf.extend_from_slice(keccak256(encoded).as_slice());
        let expected = keccak256(buf);

        let actual = receive_authorization_digest(
            DOMAIN,
            from,
            CONTRACT,
            value,
            valid_after,
            valid_before,
            nonce,
        );
        assert_eq!(actual, expected);
    }

    #[test]
    fn recover_signer_round_trips_a_real_signature() {
        let signer = PrivateKeySigner::random();
        let from = signer.address();
        let value = U256::from(1_000_000u64);
        let valid_before = U256::from(2_000_000_000u64);
        let nonce = B256::repeat_byte(0x42);

        let digest = receive_authorization_digest(
            DOMAIN,
            from,
            CONTRACT,
            value,
            U256::ZERO,
            valid_before,
            nonce,
        );
        let sig = signer.sign_hash_sync(&digest).expect("sign");

        let authorization = ReceiveAuthorization {
            from,
            validAfter: U256::ZERO,
            validBefore: valid_before,
            nonce,
            v: 27 + sig.v() as u8,
            r: sig.r().into(),
            s: sig.s().into(),
        };

        let recovered = recover_signer(&digest, authorization.r, authorization.s, authorization.v)
            .expect("recover");
        assert_eq!(recovered, from);
    }

    #[test]
    fn recover_signer_rejects_an_invalid_v() {
        let mut authorization = auth(Address::ZERO);
        authorization.v = 42;
        let err = recover_signer(
            &B256::ZERO,
            authorization.r,
            authorization.s,
            authorization.v,
        )
        .expect_err("expected v rejection");
        assert_eq!(err.code(), "MALFORMED_SIGNATURE");
    }
}
