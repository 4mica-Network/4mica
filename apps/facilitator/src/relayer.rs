//! Sponsored transaction submission.
//!
//! Everything else in this service is a pure HTTP relay: `/verify` runs local checks, `/settle`
//! forwards to core. This module is the one place the facilitator becomes an on-chain actor,
//! signing and broadcasting transactions with its own key and paying the gas.
//!
//! It exists for the gasless flows, where the user signs an authorization and never touches the
//! chain. Because every such signature binds who benefits and what moves, and Core4Mica applies the
//! action to the signer rather than `msg.sender`, the relayer cannot redirect funds or alter the
//! amount — the worst a compromised relayer can do is decline to submit, or waste its own gas.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

use alloy::network::EthereumWallet;
use alloy::primitives::{B256, U256};
use alloy::providers::fillers::{CachedNonceManager, NonceFiller};
use alloy::providers::{DynProvider, Provider, ProviderBuilder};
use anyhow::{Context, Result};
use sdk_4mica::Address;
use sdk_4mica::contract::Core4Mica::{self, Core4MicaInstance};
use tokio::sync::RwLock;

use crate::config::{NetworkConfig, PublicParameters};
use crate::deposit::DepositError;

// EIP-2612's `permit` takes seven parameters; the signature is fixed by the standard, so the
// generated binding cannot be narrowed.
#[allow(clippy::too_many_arguments)]
mod token {
    alloy::sol! {
    /// The slice of an EIP-3009 token this facilitator reads. Declared here rather than in
    /// `deposit.rs` so the transport layer does not depend on the domain layer; `sdk-4mica`'s own
    /// `ERC20` binding has `DOMAIN_SEPARATOR` but neither `balanceOf` nor `authorizationState`.
    #[sol(rpc)]
    contract DepositToken {
        function DOMAIN_SEPARATOR() external view returns (bytes32);
        function balanceOf(address account) external view returns (uint256);
        /// Permit2 needs a prior approval from the payer; the facilitator checks it so the client
        /// gets a fixable error rather than an opaque revert.
        function allowance(address owner, address spender) external view returns (uint256);
        /// EIP-2612. Present on many modern ERC-20s that lack EIP-3009, and the basis of the
        /// sponsored-approval path: the payer signs a permit, the relayer submits it.
        function nonces(address owner) external view returns (uint256);
        function permit(
            address owner,
            address spender,
            uint256 value,
            uint256 deadline,
            uint8 v,
            bytes32 r,
            bytes32 s
        ) external;
        /// EIP-3009 replay guard. `true` once an authorization has been redeemed or cancelled.
        function authorizationState(address authorizer, bytes32 nonce) external view returns (bool);
    }
    }
}

pub use token::DepositToken;

mod clearing_house {
    alloy::sol! {
    /// The slice of the ClearingHouse this facilitator submits claims and debit payments to. The
    /// errors are declared so a revert decodes to its reason instead of a bare selector; their
    /// signatures must match the deployed contract's exactly or the selectors will not resolve.
    #[sol(rpc)]
    contract ClearingHouse {
        /// The debtor's EIP-3009 authorization, same shape as the wire form the SDK sends.
        struct ReceiveAuthorization {
            address from;
            uint256 validAfter;
            uint256 validBefore;
            bytes32 nonce;
            uint8 v;
            bytes32 r;
            bytes32 s;
        }

        /// The debtor's Permit2 authorization, same shape as the wire form the SDK sends.
        struct Permit2Authorization {
            address from;
            uint256 nonce;
            uint256 deadline;
            bytes signature;
        }

        function claimNetCreditFor(address creditor, bytes32 cycleId, uint256 netCredit, bytes32[] calldata proof) external;
        function payNetDebitWithAuthorization(bytes32 cycleId, uint256 netDebit, bytes32[] calldata proof, ReceiveAuthorization calldata auth) external;
        function payNetDebitWithPermit2(bytes32 cycleId, uint256 netDebit, bytes32[] calldata proof, Permit2Authorization calldata p) external;

        error AmountZero();
        error CycleNotFound(bytes32 cycleId);
        error InvalidCycleStatus(bytes32 cycleId, uint8 status);
        error InvalidProof();
        error AlreadyClaimed(bytes32 cycleId, address creditor);
        error AlreadyPaid(bytes32 cycleId, address debtor);
        error PaymentFinalityPending(uint64 deadline);
        error PaymentWindowElapsed(uint64 deadline);
        error ClaimExceedsFundedLiquidity(uint256 available, uint256 requested);
        error CycleUnderfunded(uint256 available, uint256 required);
        error NativeTransferFailed(address recipient, uint256 amount);
        error ClaimConversionShortfall(uint256 requested, uint256 got);
        error ClaimedCreditExceedsCommitted(uint256 attempted, uint256 total);
        error ResolvedDebitExceedsCommitted(uint256 attempted, uint256 total);
        error ExactPaymentRequired(uint256 expected, uint256 actual);
        error NativeAssetUnsupported();
        error AuthorizationCycleMismatch(bytes32 nonce, bytes32 cycleId);
    }
    }
}

pub use clearing_house::ClearingHouse;

/// Why no relayer could be resolved for a request. Shared by every sponsored endpoint, each of
/// which converts it into its own error type.
#[derive(Debug, thiserror::Error)]
pub enum NoRelayer {
    #[error("gas sponsorship is not enabled on this facilitator")]
    NotConfigured,
    #[error("no relayer is configured for network {0}")]
    Network(String),
}

/// A funded signer bound to one network's chain, able to submit Core4Mica transactions.
#[derive(Clone)]
pub struct Relayer {
    inner: Arc<RelayerInner>,
}

struct RelayerInner {
    network: String,
    chain_id: u64,
    address: Address,
    contract_address: Address,
    provider: DynProvider,
    /// Token EIP-712 domain separators, memoised. Immutable per token per chain, so a hit can
    /// never go stale and every deposit after the first avoids an `eth_call`.
    token_domain_separators: RwLock<HashMap<Address, B256>>,
    /// Core4Mica's own EIP-712 domain separator, memoised. Fixed for the lifetime of a deployment.
    core_domain_separator: tokio::sync::OnceCell<B256>,
    /// Native balance with a short TTL. Read on every deposit and every health check, so an
    /// uncached read would turn `/health` into an RPC amplifier. Staleness is harmless: the floor
    /// is a coarse safety limit, not an accounting figure.
    cached_balance: RwLock<Option<(U256, Instant)>>,
}

/// How long a cached balance is served before refetching.
const BALANCE_TTL: Duration = Duration::from_secs(15);

impl Relayer {
    /// Builds a relayer for `network`, or `None` when that network did not configure one.
    ///
    /// Verifies the endpoint's chain id against the CAIP-2 network id before returning, so a
    /// relayer pointed at the wrong chain fails at startup rather than broadcasting a transaction
    /// that reverts — or worse, succeeds somewhere unintended.
    pub async fn try_new(
        network: &NetworkConfig,
        public_params: &PublicParameters,
    ) -> Result<Option<Self>> {
        let Some(relayer_cfg) = network.relayer.as_ref() else {
            return Ok(None);
        };

        let rpc_url = relayer_cfg
            .rpc_url
            .as_ref()
            .or(public_params.ethereum_http_rpc_url.as_ref())
            .with_context(|| {
                format!(
                    "network {} configures a relayer but neither it nor core advertises an \
                     Ethereum RPC URL",
                    network.id
                )
            })?;

        let signer = relayer_cfg.signer.clone();
        let address = signer.address();

        // CachedNonceManager keeps the next nonce in-process instead of asking the node per
        // transaction. Without it two concurrent deposits both read the same pending nonce and one
        // is dropped as a replacement — a race that only shows up under real load.
        let provider = ProviderBuilder::new()
            .filler(NonceFiller::new(CachedNonceManager::default()))
            .wallet(EthereumWallet::new(signer))
            .connect(rpc_url.as_str())
            .await
            .with_context(|| {
                format!(
                    "failed to connect relayer for network {} to {rpc_url}",
                    network.id
                )
            })?
            .erased();

        let chain_id = provider
            .get_chain_id()
            .await
            .with_context(|| format!("failed to read chain id for network {}", network.id))?;
        let expected_chain_id = caip2_chain_id(&network.id)?;
        if chain_id != expected_chain_id {
            anyhow::bail!(
                "relayer RPC for network {} reports chain id {chain_id}, expected {expected_chain_id}",
                network.id
            );
        }

        Ok(Some(Self {
            inner: Arc::new(RelayerInner {
                network: network.id.clone(),
                chain_id,
                address,
                contract_address: public_params.contract_address,
                provider,
                token_domain_separators: RwLock::new(HashMap::new()),
                core_domain_separator: tokio::sync::OnceCell::new(),
                cached_balance: RwLock::new(None),
            }),
        }))
    }

    /// The gas-paying account. Operators need this to fund it, so it is logged at startup.
    pub fn address(&self) -> Address {
        self.inner.address
    }

    pub fn network(&self) -> &str {
        &self.inner.network
    }

    /// Verified against the CAIP-2 network at startup, so Permit2's domain can be derived offline.
    pub fn chain_id(&self) -> u64 {
        self.inner.chain_id
    }

    pub fn contract(&self) -> Core4MicaInstance<DynProvider> {
        Core4Mica::new(self.inner.contract_address, self.inner.provider.clone())
    }

    pub fn contract_address(&self) -> Address {
        self.inner.contract_address
    }

    /// The ClearingHouse at `address`. Unlike Core4Mica the address is not fixed per deployment —
    /// core names the contract that settles each cycle, so the caller passes it in.
    pub fn clearing_house(
        &self,
        address: Address,
    ) -> ClearingHouse::ClearingHouseInstance<DynProvider> {
        ClearingHouse::new(address, self.inner.provider.clone())
    }

    pub fn provider(&self) -> DynProvider {
        self.inner.provider.clone()
    }

    /// A token's EIP-712 domain separator, read once and cached.
    ///
    /// Read from the token itself rather than reconstructed from name/version/chainId: a wrong
    /// reconstruction yields a well-formed separator that no token will ever verify against, which
    /// would surface as a confusing signature mismatch rather than a clear failure.
    pub async fn token_domain_separator(&self, token: Address) -> Result<B256, DepositError> {
        if let Some(cached) = self.inner.token_domain_separators.read().await.get(&token) {
            return Ok(*cached);
        }

        let separator = DepositToken::new(token, self.provider())
            .DOMAIN_SEPARATOR()
            .call()
            .await
            .map_err(|err| {
                DepositError::Chain(anyhow::Error::new(err).context(format!(
                    "token {token} does not expose DOMAIN_SEPARATOR (not an EIP-3009 token?)"
                )))
            })?;

        self.inner
            .token_domain_separators
            .write()
            .await
            .insert(token, separator);
        Ok(separator)
    }

    /// Core4Mica's EIP-712 domain separator, read once and cached.
    ///
    /// Read from the contract rather than reconstructed from name/version/chainId, for the same
    /// reason a token's is: a wrong reconstruction yields a well-formed separator that no signature
    /// will ever verify against.
    pub async fn core_domain_separator(&self) -> Result<B256, crate::withdraw::WithdrawError> {
        self.inner
            .core_domain_separator
            .get_or_try_init(|| async {
                self.contract()
                    .DOMAIN_SEPARATOR()
                    .call()
                    .await
                    .map_err(|err| {
                        crate::withdraw::WithdrawError::Chain(anyhow::Error::new(err).context(
                            "Core4Mica does not expose DOMAIN_SEPARATOR (deployment predates \
                             gasless withdrawals?)",
                        ))
                    })
            })
            .await
            .copied()
    }

    /// Native balance of the relayer account, in wei. A relayer that cannot pay gas is useless,
    /// so this is surfaced at startup rather than discovered on the first failed deposit.
    pub async fn balance(&self) -> Result<U256> {
        let balance = self
            .inner
            .provider
            .get_balance(self.inner.address)
            .await
            .with_context(|| {
                format!("failed to read relayer balance for {}", self.inner.network)
            })?;
        *self.inner.cached_balance.write().await = Some((balance, Instant::now()));
        Ok(balance)
    }

    /// Balance from cache when fresh, otherwise refetched. Used on the deposit hot path and by
    /// `/health`, neither of which needs a to-the-block figure.
    pub async fn cached_balance(&self) -> Result<U256> {
        if let Some((balance, fetched_at)) = *self.inner.cached_balance.read().await
            && fetched_at.elapsed() < BALANCE_TTL
        {
            return Ok(balance);
        }
        self.balance().await
    }
}

/// Extracts the numeric chain id from a CAIP-2 identifier such as `eip155:84532`.
fn caip2_chain_id(network: &str) -> Result<u64> {
    let (namespace, reference) = network
        .split_once(':')
        .with_context(|| format!("network {network} is not a CAIP-2 identifier"))?;
    if namespace != "eip155" {
        anyhow::bail!("relayer only supports eip155 networks, got {namespace}");
    }
    reference
        .parse::<u64>()
        .with_context(|| format!("network {network} has a non-numeric chain reference"))
}

#[cfg(test)]
mod tests {
    use super::caip2_chain_id;

    #[test]
    fn caip2_chain_id_extracts_the_reference() {
        assert_eq!(caip2_chain_id("eip155:84532").unwrap(), 84532);
    }

    #[test]
    fn caip2_chain_id_rejects_non_eip155_namespaces() {
        let err = caip2_chain_id("solana:mainnet").expect_err("expected namespace rejection");
        assert!(
            err.to_string().contains("only supports eip155"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn caip2_chain_id_rejects_a_missing_reference() {
        assert!(caip2_chain_id("eip155").is_err());
    }

    #[test]
    fn caip2_chain_id_rejects_a_non_numeric_reference() {
        assert!(caip2_chain_id("eip155:mainnet").is_err());
    }
}
