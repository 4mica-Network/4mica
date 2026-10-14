use std::collections::HashMap;
use std::sync::Arc;

use alloy::sol_types::Eip712Domain;
use alloy::{
    network::{EthereumWallet, TxSigner},
    primitives::{Address, B256},
    providers::{DynProvider, Provider, ProviderBuilder},
    signers::{Signature, Signer},
};
use rpc::{
    ActiveCycleResponse, ApiClientError, CorePublicParameters, PAYMENT_PAYLOAD_VERSION, RpcProxy,
    SupportedTokensResponse, clearing_house_domain, guarantee_registry_domain,
};
use tokio::sync::{OnceCell, RwLock};
use url::Url;

use crate::{
    auth::{AuthSession, AuthTokens},
    client::facilitator::Facilitator,
    config::{Config, CredentialsConfig},
    contract::{
        ClearingHouse::{self, ClearingHouseInstance},
        Core4Mica::{self, Core4MicaInstance},
        ERC20::{self, ERC20Instance},
    },
    error::{AuthError, ClientError},
    validators::{validate_address, validate_url},
};

struct Inner<S> {
    cfg: Config<S>,
    rpc_proxy: RpcProxy,
    facilitator: Facilitator,
    /// `None` when neither config nor core names one. Only the paths that read chain state or
    /// transact need it, so its absence is not fatal until one of them is called.
    ethereum_http_rpc_url: Option<Url>,
    provider: OnceCell<DynProvider>,
    wallet_provider: OnceCell<DynProvider>,
    contract_address: Address,
    clearing_house_address: Address,
    guarantee_registry_address: Address,
    guarantee_signer: Address,
    auth_session: Option<AuthSession<S>>,
    chain_id: u64,
    /// Token EIP-712 domain separators, memoised. Immutable per token per chain, so a hit never
    /// goes stale; a miss refetches in case a new asset has been registered.
    token_domain_separators: RwLock<HashMap<Address, B256>>,
    /// Core4Mica's own EIP-712 domain separator, resolved at startup. Fixed for the lifetime of a
    /// deployment.
    core_domain_separator: B256,
    /// The cycle each asset's payments are currently scoped to. Held until core rejects a request
    /// signed against it, since only core decides when a cycle closes.
    active_cycles: RwLock<HashMap<Address, ActiveCycle>>,
    /// The latest checkpoint cutoff known per asset. A payment at or below it can never be
    /// collected, so payments are held back past it.
    payment_cutoffs: RwLock<HashMap<Address, u64>>,
}

/// The settlement cycle a payment must be signed for, as core reports it.
#[derive(Clone, Copy)]
pub(crate) struct ActiveCycle {
    pub(crate) id: B256,
}

impl TryFrom<ActiveCycleResponse> for ActiveCycle {
    type Error = ClientError;

    fn try_from(response: ActiveCycleResponse) -> Result<Self, Self::Error> {
        Ok(Self {
            id: response.cycle_id.parse().map_err(|_| {
                ClientError::Initialization(format!(
                    "core reported an unreadable cycle id: {}",
                    response.cycle_id
                ))
            })?,
        })
    }
}

/// Everything the sub-clients share: configuration, connections, and the metadata resolved once at
/// startup.
pub(crate) struct ClientCtx<S>(Arc<Inner<S>>);

/// Hand-written rather than derived: `#[derive(Clone)]` would add an `S: Clone` bound, which the
/// `Arc` makes unnecessary — the signer is shared, never copied.
impl<S> Clone for ClientCtx<S> {
    fn clone(&self) -> Self {
        Self(Arc::clone(&self.0))
    }
}

impl<S> ClientCtx<S> {
    pub(super) async fn new(cfg: Config<S>) -> Result<Self, ClientError>
    where
        S: Signer + Sync + Clone,
    {
        let rpc_proxy = Self::build_rpc_proxy(&cfg)?;
        let auth_session = match &cfg.credentials {
            CredentialsConfig::Siwe(auth_cfg) => {
                Some(AuthSession::new(auth_cfg.clone(), cfg.signer.clone()))
            }
            CredentialsConfig::Bearer(_) | CredentialsConfig::None => None,
        };
        let public_params = rpc_proxy
            .get_public_params()
            .await
            .map_err(|e| ClientError::Rpc(e.to_string()))?;

        Self::require_payload_version_support(&public_params)?;

        let ethereum_http_rpc_url = Self::resolve_chain_rpc_url(&cfg, &public_params)?;
        let contract_address = Self::resolve_contract_address(&cfg, &public_params)?;
        let clearing_house_address = validate_address(&public_params.clearing_house_address)
            .map_err(|e| ClientError::Initialization(format!("clearing house address: {e}")))?;
        let guarantee_registry_address =
            validate_address(&public_params.guarantee_registry_address).map_err(|e| {
                ClientError::Initialization(format!("guarantee registry address: {e}"))
            })?;
        let guarantee_signer = validate_address(&public_params.guarantee_signer)
            .map_err(|e| ClientError::Initialization(format!("guarantee signer: {e}")))?;
        let core_domain_separator =
            Self::resolve_core_domain_separator(&public_params, contract_address);

        let facilitator = Facilitator::new(cfg.facilitator_url.clone());

        Ok(Self(Arc::new(Inner {
            cfg,
            rpc_proxy,
            facilitator,
            ethereum_http_rpc_url,
            provider: OnceCell::new(),
            wallet_provider: OnceCell::new(),
            contract_address,
            clearing_house_address,
            guarantee_registry_address,
            guarantee_signer,
            auth_session,
            chain_id: public_params.chain_id,
            token_domain_separators: RwLock::new(HashMap::new()),
            core_domain_separator,
            active_cycles: RwLock::new(HashMap::new()),
            payment_cutoffs: RwLock::new(HashMap::new()),
        })))
    }

    fn build_rpc_proxy(cfg: &Config<S>) -> Result<RpcProxy, ClientError> {
        let mut proxy =
            RpcProxy::new(cfg.rpc_url.as_ref()).map_err(|e| ClientError::Rpc(e.to_string()))?;
        if let CredentialsConfig::Bearer(token) = &cfg.credentials {
            proxy = proxy.with_bearer_token(token.clone());
        }
        Ok(proxy)
    }

    /// The Ethereum endpoint to talk to, if there is one. An explicit config wins over what core
    /// advertises, and neither is required.
    fn resolve_chain_rpc_url(
        cfg: &Config<S>,
        public_params: &CorePublicParameters,
    ) -> Result<Option<Url>, ClientError> {
        if let Some(url) = &cfg.ethereum_http_rpc_url {
            return Ok(Some(url.clone()));
        }
        if public_params.ethereum_http_rpc_url.is_empty() {
            return Ok(None);
        }
        validate_url(&public_params.ethereum_http_rpc_url)
            .map(Some)
            .map_err(|e| ClientError::Initialization(e.to_string()))
    }

    async fn connect(url: &Url) -> Result<DynProvider, ClientError> {
        ProviderBuilder::new()
            .connect(url.as_ref())
            .await
            .map_err(|e| ClientError::Provider(e.to_string()))
            .map(|provider| provider.erased())
    }

    fn resolve_contract_address(
        cfg: &Config<S>,
        public_params: &CorePublicParameters,
    ) -> Result<Address, ClientError> {
        match cfg.contract_address {
            Some(address) => Ok(address),
            None => validate_address(&public_params.contract_address)
                .map_err(|e| ClientError::Initialization(e.to_string())),
        }
    }

    /// Refuses a core that cannot read what this client signs, rather than letting every payment
    /// fail later with a decode error.
    fn require_payload_version_support(
        public_params: &CorePublicParameters,
    ) -> Result<(), ClientError> {
        if public_params
            .supported_payment_payload_versions
            .contains(&PAYMENT_PAYLOAD_VERSION)
        {
            return Ok(());
        }
        Err(ClientError::Initialization(format!(
            "this client signs payment payload v{PAYMENT_PAYLOAD_VERSION}, which core does not \
             accept (core accepts {:?}); upgrade core or downgrade the SDK",
            public_params.supported_payment_payload_versions
        )))
    }

    /// Core4Mica's EIP-712 domain separator.
    ///
    /// Prefers what core publishes, since core reads it from the contract and so stays right across
    /// a domain change. Falls back to deriving it, which is sound because the contract fixes its
    /// domain as `EIP712("Core4Mica", "1")` — so a core too old to publish one costs nothing beyond
    /// that guarantee.
    fn resolve_core_domain_separator(
        public_params: &CorePublicParameters,
        contract_address: Address,
    ) -> B256 {
        public_params
            .core_domain_separator
            .parse::<B256>()
            .unwrap_or_else(|_| {
                crate::digest::core_domain_separator(public_params.chain_id, contract_address)
            })
    }

    pub(crate) fn contract_address(&self) -> Address {
        self.0.contract_address
    }

    fn chain_rpc_url(&self) -> Result<&Url, ClientError> {
        self.0
            .ethereum_http_rpc_url
            .as_ref()
            .ok_or(ClientError::ChainRpcUnavailable)
    }

    /// The read provider, connected on first use.
    ///
    /// Deferred so a client that only ever takes sponsored paths never needs an Ethereum endpoint —
    /// everything resolved at construction comes from core. The chain id is checked here rather than
    /// at construction, which keeps the check without paying for it up front.
    async fn provider(&self) -> Result<&DynProvider, ClientError> {
        self.0
            .provider
            .get_or_try_init(|| async {
                let provider = Self::connect(self.chain_rpc_url()?).await?;
                let chain_id = provider
                    .get_chain_id()
                    .await
                    .map_err(|e| ClientError::Provider(e.to_string()))?;

                if chain_id != self.0.chain_id {
                    return Err(ClientError::Initialization(format!(
                        "chain id mismatch between core service ({}) and Ethereum provider \
                         ({chain_id})",
                        self.0.chain_id
                    )));
                }
                Ok(provider)
            })
            .await
    }

    pub(crate) async fn get_contract(&self) -> Result<Core4MicaInstance<DynProvider>, ClientError> {
        Ok(Core4Mica::new(
            self.0.contract_address,
            self.provider().await?.clone(),
        ))
    }

    /// A read-only handle on `token`, for view calls that need no signer.
    pub(crate) async fn get_erc20_contract(
        &self,
        token: Address,
    ) -> Result<ERC20Instance<DynProvider>, ClientError> {
        Ok(ERC20::new(token, self.provider().await?.clone()))
    }

    /// A token's EIP-712 domain separator.
    ///
    /// Deliberately not an `eth_call`: signing a gasless deposit must not require the caller to
    /// hold an Ethereum RPC endpoint of its own.
    pub(crate) async fn token_domain_separator(&self, token: Address) -> Result<B256, ClientError> {
        if let Some(cached) = self.0.token_domain_separators.read().await.get(&token) {
            return Ok(*cached);
        }

        let tokens = self
            .0
            .rpc_proxy
            .get_supported_tokens()
            .await
            .map_err(|e| ClientError::Rpc(e.to_string()))?;

        let mut cache = self.0.token_domain_separators.write().await;
        let mut found = None;
        for info in &tokens.tokens {
            let Ok(address) = validate_address(&info.address) else {
                continue;
            };
            let Some(raw) = &info.domain_separator else {
                continue;
            };
            let Ok(separator) = raw.parse::<B256>() else {
                continue;
            };
            cache.insert(address, separator);
            if address == token {
                found = Some(separator);
            }
        }

        found.ok_or(ClientError::MissingTokenDomainSeparator { token })
    }

    /// Core4Mica's EIP-712 domain separator, resolved at startup.
    pub(crate) fn core_domain_separator(&self) -> B256 {
        self.0.core_domain_separator
    }

    /// Permit2's domain separator, derived locally from the chain id.
    ///
    /// Permit2 is deployed at one canonical address on every chain and its domain has a fixed name
    /// and no version, so this needs no lookup at all.
    pub(crate) fn permit2_domain_separator(&self) -> B256 {
        crate::digest::permit2_domain_separator(self.0.chain_id)
    }

    pub(super) fn facilitator(&self) -> &Facilitator {
        &self.0.facilitator
    }

    /// The address whose signature attests this operator's guarantee receipts.
    pub(crate) fn guarantee_signer(&self) -> Address {
        self.0.guarantee_signer
    }

    /// The domain every payer-signed payload is verified under.
    pub(crate) fn clearing_house_domain(&self) -> Eip712Domain {
        clearing_house_domain(self.0.chain_id, self.0.clearing_house_address)
    }

    /// The domain the operator's guarantee receipts are verified under.
    pub(crate) fn guarantee_domain(&self) -> Eip712Domain {
        guarantee_registry_domain(self.0.chain_id, self.0.guarantee_registry_address)
    }

    /// The cycle payments for `asset` must be signed for, fetched once and reused until
    /// [`Self::forget_active_cycle`] drops it.
    pub(crate) async fn active_cycle(&self, asset: Address) -> Result<ActiveCycle, ClientError>
    where
        S: Signer + Sync,
    {
        if let Some(cached) = self.0.active_cycles.read().await.get(&asset) {
            return Ok(*cached);
        }

        let response = self
            .rpc_proxy()
            .await
            .map_err(|e| ClientError::Rpc(e.to_string()))?
            .get_active_cycle(asset.to_string())
            .await
            .map_err(|e| ClientError::Rpc(e.to_string()))?;
        let cycle = ActiveCycle::try_from(response)?;

        self.0.active_cycles.write().await.insert(asset, cycle);
        Ok(cycle)
    }

    /// Drops the cached cycle for `asset`, so the next payment re-reads it from core.
    pub(crate) async fn forget_active_cycle(&self, asset: Address) {
        self.0.active_cycles.write().await.remove(&asset);
    }

    pub(crate) async fn record_payment_cutoff(&self, asset: Address, cutoff: u64) {
        self.0
            .payment_cutoffs
            .write()
            .await
            .entry(asset)
            .and_modify(|known| *known = (*known).max(cutoff))
            .or_insert(cutoff);
    }

    pub(crate) async fn payment_cutoff(&self, asset: Address) -> Option<u64> {
        self.0.payment_cutoffs.read().await.get(&asset).copied()
    }

    pub(crate) fn signer(&self) -> &S {
        &self.0.cfg.signer
    }

    pub(crate) fn signer_address(&self) -> Address
    where
        S: Signer,
    {
        self.0.cfg.signer.address()
    }

    pub(crate) async fn supported_tokens(&self) -> Result<SupportedTokensResponse, ApiClientError> {
        self.0.rpc_proxy.get_supported_tokens().await
    }

    /// The proxy with a fresh access token attached. Only auth can fail here: the proxy itself
    /// was built at construction.
    pub(crate) async fn rpc_proxy(&self) -> Result<RpcProxy, AuthError>
    where
        S: Signer + Sync,
    {
        let mut proxy = self.0.rpc_proxy.clone();
        if let Some(auth) = &self.0.auth_session {
            let token = auth.access_token().await?;
            proxy = proxy.with_bearer_token(token);
        }
        Ok(proxy)
    }

    pub(super) async fn login(&self) -> Result<AuthTokens, AuthError>
    where
        S: Signer + Sync,
    {
        let session = self
            .0
            .auth_session
            .as_ref()
            .ok_or(AuthError::MissingConfig)?;
        session.login().await
    }

    async fn get_wallet_provider(&self) -> Result<DynProvider, ClientError>
    where
        S: TxSigner<Signature> + Send + Sync + Clone + 'static,
    {
        let provider = self
            .0
            .wallet_provider
            .get_or_try_init(|| async {
                let wallet = EthereumWallet::new(self.0.cfg.signer.clone());
                ProviderBuilder::new()
                    .disable_recommended_fillers()
                    .with_gas_estimation()
                    .with_blob_gas_estimation()
                    .with_simple_nonce_management()
                    .fetch_chain_id()
                    .wallet(wallet)
                    .connect(self.chain_rpc_url()?.as_ref())
                    .await
                    .map_err(|e| ClientError::Provider(e.to_string()))
                    .map(|p| p.erased())
            })
            .await?;
        Ok(provider.clone())
    }

    pub(crate) async fn get_write_contract(
        &self,
    ) -> Result<Core4MicaInstance<DynProvider>, ClientError>
    where
        S: TxSigner<Signature> + Send + Sync + Clone + 'static,
    {
        let provider = self.get_wallet_provider().await?;
        Ok(Core4Mica::new(self.0.contract_address, provider))
    }

    pub(crate) async fn get_erc20_write_contract(
        &self,
        token_address: Address,
    ) -> Result<ERC20Instance<DynProvider>, ClientError>
    where
        S: TxSigner<Signature> + Send + Sync + Clone + 'static,
    {
        let provider = self.get_wallet_provider().await?;
        Ok(ERC20::new(token_address, provider))
    }

    pub(crate) async fn get_clearing_house_write_contract(
        &self,
        clearing_house_address: Address,
    ) -> Result<ClearingHouseInstance<DynProvider>, ClientError>
    where
        S: TxSigner<Signature> + Send + Sync + Clone + 'static,
    {
        let provider = self.get_wallet_provider().await?;
        Ok(ClearingHouse::new(clearing_house_address, provider))
    }
}
