//! Gasless deposit verification and submission.
//!
//! The payer signs an EIP-3009 `receiveWithAuthorization` and never touches the chain; this module
//! checks that signature and, on `/deposit`, broadcasts `depositStablecoinWithAuthorization` with
//! the relayer paying gas.
//!
//! # Trust model
//!
//! The signed EIP-3009 digest binds `to` (the Core4Mica contract) *and* `value`, and Core4Mica
//! credits collateral to `auth.from` rather than `msg.sender`. So a relayer that alters the amount
//! or the destination produces a signature that no longer recovers, and the transaction reverts.
//! The worst a malicious relayer can do is refuse to submit.
//!
//! Verification is therefore a **gas optimisation, not a security boundary** — it exists so the
//! facilitator does not pay for transactions that were always going to revert. Every check here is
//! re-enforced on-chain.

use std::str::FromStr;

use alloy::primitives::{Address, B256, Signature, U256};
use alloy::sol;
use alloy::sol_types::SolStruct;
use sdk_4mica::contract::Core4Mica::ReceiveAuthorization;
use thiserror::Error;

use crate::relayer::Relayer;

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
}

sol! {
    #[sol(rpc)]
    contract DepositToken {
        function DOMAIN_SEPARATOR() external view returns (bytes32);
        function balanceOf(address account) external view returns (uint256);
        /// EIP-3009 replay guard. `true` once an authorization has been redeemed or cancelled.
        function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
    }
}

/// Asset transfer methods this facilitator can service.
///
/// Permit2 is deliberately absent: `depositStablecoinWithPermit2` requires a prior on-chain
/// `approve(PERMIT2, ...)` from the payer, so it is not gasless end-to-end. It is recognised and
/// rejected with a distinct code rather than treated as an unknown value.
pub const ASSET_TRANSFER_METHOD_EIP3009: &str = "eip3009";
pub const ASSET_TRANSFER_METHOD_PERMIT2: &str = "permit2";

#[derive(Debug, Error)]
pub enum DepositError {
    #[error("{0}")]
    InvalidRequest(String),
    #[error("unsupported assetTransferMethod {0}")]
    UnsupportedTransferMethod(String),
    #[error("permit2 deposits require a prior on-chain approve(PERMIT2) and are not yet supported")]
    Permit2Unsupported,
    #[error("no relayer is configured for network {0}")]
    NoRelayer(String),
    #[error("authorization expired at {valid_before} (now {now})")]
    Expired { valid_before: u64, now: u64 },
    #[error("authorization is not valid until {valid_after} (now {now})")]
    NotYetValid { valid_after: u64, now: u64 },
    #[error("signature recovers to {recovered}, not the declared from {declared}")]
    SignatureMismatch {
        recovered: Address,
        declared: Address,
    },
    #[error("authorization nonce has already been used")]
    NonceAlreadyUsed,
    #[error("{from} holds {balance} of {asset}, needs {amount}")]
    InsufficientBalance {
        from: Address,
        asset: Address,
        balance: U256,
        amount: U256,
    },
    #[error("deposit simulation reverted: {0}")]
    SimulationReverted(String),
    #[error("chain error: {0}")]
    Chain(String),
    #[error("failed to broadcast deposit: {0}")]
    Broadcast(String),
}

impl DepositError {
    /// Stable, machine-readable code so clients can branch without string matching.
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidRequest(_) => "INVALID_REQUEST",
            Self::UnsupportedTransferMethod(_) => "UNSUPPORTED_TRANSFER_METHOD",
            Self::Permit2Unsupported => "PERMIT2_UNSUPPORTED",
            Self::NoRelayer(_) => "NO_RELAYER",
            Self::Expired { .. } => "EXPIRED",
            Self::NotYetValid { .. } => "NOT_YET_VALID",
            Self::SignatureMismatch { .. } => "SIGNATURE_MISMATCH",
            Self::NonceAlreadyUsed => "NONCE_ALREADY_USED",
            Self::InsufficientBalance { .. } => "INSUFFICIENT_BALANCE",
            Self::SimulationReverted(_) => "SIMULATION_REVERTED",
            Self::Chain(_) => "CHAIN_ERROR",
            Self::Broadcast(_) => "BROADCAST_FAILED",
        }
    }
}

/// A validated deposit request, with strings parsed into their on-chain types.
#[derive(Debug)]
pub struct DepositIntent {
    pub asset: Address,
    pub amount: U256,
    pub authorization: ReceiveAuthorization,
}

impl DepositIntent {
    pub fn parse(
        asset: &str,
        amount: &str,
        asset_transfer_method: Option<&str>,
        authorization: ReceiveAuthorization,
    ) -> Result<Self, DepositError> {
        match asset_transfer_method.map(str::trim) {
            // Absent defaults to eip3009, matching x402's scheme_exact_evm.
            None | Some("") | Some(ASSET_TRANSFER_METHOD_EIP3009) => {}
            Some(ASSET_TRANSFER_METHOD_PERMIT2) => return Err(DepositError::Permit2Unsupported),
            Some(other) => {
                return Err(DepositError::UnsupportedTransferMethod(other.to_string()));
            }
        }

        let asset = Address::from_str(asset.trim())
            .map_err(|_| DepositError::InvalidRequest(format!("invalid asset address: {asset}")))?;
        let amount = parse_u256(amount)
            .map_err(|err| DepositError::InvalidRequest(format!("invalid amount: {err}")))?;
        if amount.is_zero() {
            return Err(DepositError::InvalidRequest(
                "amount must be non-zero".into(),
            ));
        }

        Ok(Self {
            asset,
            amount,
            authorization,
        })
    }
}

/// Runs every check that can be made without broadcasting, cheapest first.
///
/// Ordering is deliberate: local checks before any RPC round trip, and the simulation last since
/// it is the most expensive. The simulation is what catches everything the earlier checks cannot
/// see — a paused contract, an asset disabled on-chain, an unsupported token.
pub async fn verify(
    relayer: &Relayer,
    intent: &DepositIntent,
    now: u64,
) -> Result<(), DepositError> {
    let auth = &intent.authorization;

    let valid_before = auth.validBefore.saturating_to::<u64>();
    if valid_before <= now {
        return Err(DepositError::Expired { valid_before, now });
    }
    let valid_after = auth.validAfter.saturating_to::<u64>();
    if valid_after > now {
        return Err(DepositError::NotYetValid { valid_after, now });
    }

    let token = DepositToken::new(intent.asset, relayer.provider());
    let domain_separator = relayer.token_domain_separator(intent.asset).await?;

    let digest = receive_authorization_digest(
        domain_separator,
        auth.from,
        relayer.contract_address(),
        intent.amount,
        auth.validAfter,
        auth.validBefore,
        auth.nonce,
    );
    let recovered = recover_signer(&digest, auth)?;
    if recovered != auth.from {
        return Err(DepositError::SignatureMismatch {
            recovered,
            declared: auth.from,
        });
    }

    // Cheap and decisive: a used nonce always reverts, so paying gas to discover that is pure loss.
    let used = token
        .authorizationState(auth.from, auth.nonce)
        .call()
        .await
        .map_err(|err| DepositError::Chain(err.to_string()))?;
    if used {
        return Err(DepositError::NonceAlreadyUsed);
    }

    let balance = token
        .balanceOf(auth.from)
        .call()
        .await
        .map_err(|err| DepositError::Chain(err.to_string()))?;
    if balance < intent.amount {
        return Err(DepositError::InsufficientBalance {
            from: auth.from,
            asset: intent.asset,
            balance,
            amount: intent.amount,
        });
    }

    relayer
        .contract()
        .depositStablecoinWithAuthorization(intent.asset, intent.amount, auth.clone())
        .from(relayer.address())
        .call()
        .await
        .map_err(|err| DepositError::SimulationReverted(err.to_string()))?;

    Ok(())
}

/// Verifies, then broadcasts and waits for the receipt.
///
/// Re-verifies rather than trusting an earlier `/deposit/verify`: the two are separate requests,
/// and state can change in between (nonce consumed, balance spent, authorization expired).
pub async fn submit(
    relayer: &Relayer,
    intent: &DepositIntent,
    now: u64,
) -> Result<B256, DepositError> {
    verify(relayer, intent, now).await?;

    let pending = relayer
        .contract()
        .depositStablecoinWithAuthorization(
            intent.asset,
            intent.amount,
            intent.authorization.clone(),
        )
        .send()
        .await
        .map_err(|err| DepositError::Broadcast(err.to_string()))?;

    let receipt = pending
        .get_receipt()
        .await
        .map_err(|err| DepositError::Broadcast(err.to_string()))?;

    if !receipt.status() {
        return Err(DepositError::SimulationReverted(format!(
            "transaction {} reverted on-chain",
            receipt.transaction_hash
        )));
    }

    Ok(receipt.transaction_hash)
}

/// `keccak256(0x19 0x01 ‖ domainSeparator ‖ hashStruct(ReceiveWithAuthorization))`.
fn receive_authorization_digest(
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
    let struct_hash = message.eip712_hash_struct();

    let mut buf = [0u8; 66];
    buf[0] = 0x19;
    buf[1] = 0x01;
    buf[2..34].copy_from_slice(domain_separator.as_slice());
    buf[34..66].copy_from_slice(struct_hash.as_slice());
    alloy::primitives::keccak256(buf)
}

/// Recovers the signer, accepting `v` in either Electrum (27/28) or raw parity (0/1) form —
/// EIP-3009 tokens expect the former, but signers differ and rejecting 0/1 would be gratuitous.
fn recover_signer(digest: &B256, auth: &ReceiveAuthorization) -> Result<Address, DepositError> {
    let parity = match auth.v {
        27 | 0 => false,
        28 | 1 => true,
        other => {
            return Err(DepositError::InvalidRequest(format!(
                "invalid signature v: {other}, expected 27/28"
            )));
        }
    };

    let signature = Signature::from_scalars_and_parity(auth.r, auth.s, parity);
    signature
        .recover_address_from_prehash(digest)
        .map_err(|err| DepositError::InvalidRequest(format!("unrecoverable signature: {err}")))
}

/// Accepts decimal or `0x`-prefixed hex, matching how amounts travel elsewhere in x402.
fn parse_u256(value: &str) -> Result<U256, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err("cannot be empty".into());
    }
    match trimmed.strip_prefix("0x") {
        Some(hex) => U256::from_str_radix(hex, 16).map_err(|err| err.to_string()),
        None => U256::from_str_radix(trimmed, 10).map_err(|err| err.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloy::primitives::{address, b256};
    use alloy::signers::SignerSync;
    use alloy::signers::local::PrivateKeySigner;

    const TOKEN: Address = address!("000000000000000000000000000000000000d0c5");
    const CONTRACT: Address = address!("00000000000000000000000000000000c04e4a1c");
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

    #[test]
    fn parse_defaults_to_eip3009_when_method_is_absent() {
        let intent = DepositIntent::parse(
            "0x000000000000000000000000000000000000d0c5",
            "1000000",
            None,
            auth(Address::ZERO),
        )
        .expect("intent");
        assert_eq!(intent.amount, U256::from(1_000_000u64));
        assert_eq!(intent.asset, TOKEN);
    }

    #[test]
    fn parse_accepts_hex_amounts() {
        let intent = DepositIntent::parse(
            "0x000000000000000000000000000000000000d0c5",
            "0x0a",
            None,
            auth(Address::ZERO),
        )
        .expect("intent");
        assert_eq!(intent.amount, U256::from(10u64));
    }

    #[test]
    fn parse_rejects_zero_amount() {
        let err = DepositIntent::parse(
            "0x000000000000000000000000000000000000d0c5",
            "0",
            None,
            auth(Address::ZERO),
        )
        .expect_err("expected zero rejection");
        assert_eq!(err.code(), "INVALID_REQUEST");
    }

    /// Permit2 gets its own code rather than the generic unknown-method one, so a client can tell
    /// "not implemented yet" from "you sent nonsense".
    #[test]
    fn parse_rejects_permit2_distinctly() {
        let err = DepositIntent::parse(
            "0x000000000000000000000000000000000000d0c5",
            "1",
            Some("permit2"),
            auth(Address::ZERO),
        )
        .expect_err("expected permit2 rejection");
        assert_eq!(err.code(), "PERMIT2_UNSUPPORTED");
    }

    #[test]
    fn parse_rejects_an_unknown_transfer_method() {
        let err = DepositIntent::parse(
            "0x000000000000000000000000000000000000d0c5",
            "1",
            Some("erc7710"),
            auth(Address::ZERO),
        )
        .expect_err("expected unknown-method rejection");
        assert_eq!(err.code(), "UNSUPPORTED_TRANSFER_METHOD");
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

        let recovered = recover_signer(&digest, &authorization).expect("recover");
        assert_eq!(recovered, from);
    }

    #[test]
    fn recover_signer_rejects_an_invalid_v() {
        let mut authorization = auth(Address::ZERO);
        authorization.v = 42;
        let err = recover_signer(&B256::ZERO, &authorization).expect_err("expected v rejection");
        assert_eq!(err.code(), "INVALID_REQUEST");
    }
}
