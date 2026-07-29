use std::net::SocketAddr;
use std::str::FromStr;
use std::time::Duration;

use alloy::primitives::U256;
use alloy::signers::local::PrivateKeySigner;
use anyhow::{Context, Result, bail};
use reqwest::Url;
use rpc::{CorePublicParameters, GUARANTEE_CLAIMS_VERSION};
use sdk_4mica::Address;
use serde::Deserialize;

use crate::limits::DepositLimits;

const ENV_SCHEME: &str = "X402_SCHEME";
const ENV_NETWORK: &str = "X402_NETWORK";
const ENV_NETWORKS: &str = "X402_NETWORKS";
const ENV_CORE_API_URL: &str = "X402_CORE_API_URL";
const ENV_AUTH_WALLET_PRIVATE_KEY: &str = "X402_AUTH_WALLET_PRIVATE_KEY";
const ENV_AUTH_URL: &str = "X402_AUTH_URL";
const ENV_AUTH_REFRESH_MARGIN_SECS: &str = "X402_AUTH_REFRESH_MARGIN_SECS";
const ENV_RELAYER_PRIVATE_KEY: &str = "X402_RELAYER_PRIVATE_KEY";
const ENV_RELAYER_RPC_URL: &str = "X402_RELAYER_RPC_URL";
const ENV_DEPOSIT_MAX_IN_FLIGHT: &str = "X402_DEPOSIT_MAX_IN_FLIGHT";
const ENV_DEPOSIT_PER_ADDRESS_LIMIT: &str = "X402_DEPOSIT_PER_ADDRESS_LIMIT";
const ENV_DEPOSIT_GLOBAL_LIMIT: &str = "X402_DEPOSIT_GLOBAL_LIMIT";
const ENV_DEPOSIT_WINDOW_SECS: &str = "X402_DEPOSIT_WINDOW_SECS";
const ENV_DEPOSIT_MIN_RELAYER_BALANCE_WEI: &str = "X402_DEPOSIT_MIN_RELAYER_BALANCE_WEI";
const ENV_DEPOSIT_MAX_GAS: &str = "X402_DEPOSIT_MAX_GAS";
const ENV_HOST: &str = "HOST";
const ENV_PORT: &str = "PORT";
const ENV_GUARANTEE_DOMAIN_VARIANTS: [&str; 3] = [
    "X402_GUARANTEE_DOMAIN",
    "FOUR_MICA_GUARANTEE_DOMAIN",
    "4MICA_GUARANTEE_DOMAIN",
];
const DEFAULT_NETWORK_ID: &str = "eip155:11155111";
const DEFAULT_AUTH_REFRESH_MARGIN_SECS: u64 = 60;

#[derive(Clone)]
pub struct ServiceConfig {
    pub bind_addr: SocketAddr,
    pub scheme: String,
    pub networks: Vec<NetworkConfig>,
    pub deposit_limits: DepositLimits,
}

#[derive(Clone)]
pub struct NetworkConfig {
    pub id: String,
    pub core_api_base_url: Url,
    pub auth: NetworkAuthConfig,
    /// Present only when this network is configured to sponsor gas. Absent leaves the facilitator
    /// a pure HTTP relay for that network — `/verify` and `/settle` are unaffected.
    pub relayer: Option<NetworkRelayerConfig>,
}

#[derive(Clone)]
pub struct NetworkAuthConfig {
    pub wallet_private_key: String,
    pub auth_url: Url,
    pub refresh_margin_secs: u64,
}

/// Credentials for submitting sponsored transactions (e.g. gasless deposits) on a network.
///
/// Deliberately separate from [`NetworkAuthConfig`]: that key is an *identity* used to sign SIWE
/// logins against core and needs no balance, whereas this one signs real transactions and must
/// hold native gas. Sharing one key would silently couple the two, and draining the gas account
/// would take authentication down with it.
#[derive(Clone, Debug)]
pub struct NetworkRelayerConfig {
    /// Parsed at config load so a malformed key fails at startup, and so the raw string is never
    /// stored. `PrivateKeySigner`'s own `Debug` redacts the key.
    pub signer: PrivateKeySigner,
    /// `None` means "use the `ethereum_http_rpc_url` core advertises", resolved once public params
    /// are fetched, so a single-chain deployment needs only a key. Config load happens before that
    /// fetch, which is why this cannot already be a concrete `Url`.
    pub rpc_url: Option<Url>,
}

impl ServiceConfig {
    pub fn from_env() -> Result<Self> {
        let bind_addr = bind_addr_from_env()?;
        let scheme = std::env::var(ENV_SCHEME).unwrap_or_else(|_| "4mica-credit".into());
        let networks = load_networks_from_env()?;
        let deposit_limits = deposit_limits_from_env()?;
        Ok(Self {
            bind_addr,
            scheme,
            networks,
            deposit_limits,
        })
    }
}

/// Deposit throttling, defaulting to [`DepositLimits::default`] so an existing deployment picks up
/// protection without a config change.
fn deposit_limits_from_env() -> Result<DepositLimits> {
    let defaults = DepositLimits::default();

    let max_in_flight = parse_env(ENV_DEPOSIT_MAX_IN_FLIGHT, defaults.max_in_flight)?;
    let per_address_limit = parse_env(ENV_DEPOSIT_PER_ADDRESS_LIMIT, defaults.per_address_limit)?;
    let global_limit = parse_env(ENV_DEPOSIT_GLOBAL_LIMIT, defaults.global_limit)?;
    let window_secs = parse_env(ENV_DEPOSIT_WINDOW_SECS, defaults.window.as_secs())?;
    let max_gas = parse_env(ENV_DEPOSIT_MAX_GAS, defaults.max_gas)?;

    // Zero would disable the limit entirely, which is never what someone setting it explicitly
    // means — they would unset the variable instead.
    for (key, value) in [
        (ENV_DEPOSIT_MAX_IN_FLIGHT, max_in_flight as u64),
        (ENV_DEPOSIT_PER_ADDRESS_LIMIT, per_address_limit as u64),
        (ENV_DEPOSIT_GLOBAL_LIMIT, global_limit as u64),
        (ENV_DEPOSIT_WINDOW_SECS, window_secs),
        (ENV_DEPOSIT_MAX_GAS, max_gas),
    ] {
        if value == 0 {
            bail!("{key} must be greater than zero; unset it to use the default");
        }
    }

    let min_relayer_balance_wei = match trimmed_env(ENV_DEPOSIT_MIN_RELAYER_BALANCE_WEI) {
        Some(raw) => U256::from_str(&raw)
            .with_context(|| format!("{ENV_DEPOSIT_MIN_RELAYER_BALANCE_WEI} must be a uint256"))?,
        None => defaults.min_relayer_balance_wei,
    };

    Ok(DepositLimits {
        max_in_flight,
        per_address_limit,
        global_limit,
        window: Duration::from_secs(window_secs),
        min_relayer_balance_wei,
        max_gas,
        ..defaults
    })
}

fn parse_env<T>(key: &str, default: T) -> Result<T>
where
    T: FromStr,
    T::Err: std::error::Error + Send + Sync + 'static,
{
    match trimmed_env(key) {
        Some(raw) => raw
            .parse::<T>()
            .with_context(|| format!("{key} must be a non-negative integer")),
        None => Ok(default),
    }
}

#[derive(Clone, Debug)]
pub struct PublicParameters {
    pub operator_public_key: [u8; 48],
    pub guarantee_domain: Option<[u8; 32]>,
    /// Core's own domain, before any `X402_GUARANTEE_DOMAIN` override is applied. Kept for
    /// diagnostics and asserted in tests; [`Self::guarantee_domain`] is what verification uses.
    // Scoped to this field rather than the struct: a blanket allow is how a stale field survives
    // a migration unnoticed.
    #[allow(dead_code)]
    pub active_guarantee_domain: Option<[u8; 32]>,
    /// Validator identities this operator whitelisted. A signed validation requirement may only
    /// name one of these. By convention a URL or CAIP-10 account id, not an address.
    pub validators: Vec<String>,
    /// The Core4Mica deployment, taken from core rather than configured locally so a facilitator
    /// can never be pointed at a contract the operator it trusts does not use.
    pub contract_address: Address,
    /// Chain RPC endpoint core itself uses. Serves as the relayer's default endpoint.
    pub ethereum_http_rpc_url: Option<Url>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NetworkEnvConfig {
    network: String,
    core_api_url: String,
    auth_wallet_private_key: Option<String>,
    auth_url: Option<String>,
    auth_refresh_margin_secs: Option<u64>,
    relayer_private_key: Option<String>,
    relayer_rpc_url: Option<String>,
}

pub async fn load_public_params(api_base: &Url) -> Result<PublicParameters> {
    let params = fetch_public_params(api_base).await?;
    public_parameters_from_core(params)
}

fn public_parameters_from_core(params: CorePublicParameters) -> Result<PublicParameters> {
    ensure_core_decodes_our_guarantee_version(&params.supported_guarantee_versions)?;
    let active_guarantee_domain =
        parse_optional_hex_array::<32>(&params.guarantee_domain_separator)
            .context("invalid guarantee_domain_separator in core public params")?;
    let operator_public_key = params.public_key.try_into().map_err(|bytes: Vec<u8>| {
        anyhow::anyhow!("operator public key must be 48 bytes, got {}", bytes.len())
    })?;

    let configured_guarantee_domain = first_env_value(&ENV_GUARANTEE_DOMAIN_VARIANTS)
        .map(|value| parse_hex_array::<32>(&value))
        .transpose()?;
    let guarantee_domain =
        resolve_guarantee_domain(configured_guarantee_domain, active_guarantee_domain);
    let validators = normalize_validators(&params.validators)?;

    let contract_address =
        Address::from_str(params.contract_address.trim()).with_context(|| {
            format!(
                "invalid contract_address in core public params: {}",
                params.contract_address
            )
        })?;

    // Optional: a facilitator that never sponsors gas has no use for it, and core may omit it.
    let ethereum_http_rpc_url = match params.ethereum_http_rpc_url.trim() {
        "" => None,
        raw => Some(
            normalize_url(raw).context("invalid ethereum_http_rpc_url in core public params")?,
        ),
    };

    Ok(PublicParameters {
        operator_public_key,
        guarantee_domain,
        active_guarantee_domain,
        validators,
        contract_address,
        ethereum_http_rpc_url,
    })
}

fn normalize_validators(raw: &[String]) -> Result<Vec<String>> {
    let mut validators = Vec::with_capacity(raw.len());
    for value in raw {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            bail!("validators cannot contain empty identities");
        }
        validators.push(trimmed.to_string());
    }
    validators.sort();
    validators.dedup();
    Ok(validators)
}

fn load_networks_from_env() -> Result<Vec<NetworkConfig>> {
    let auth_fallback = load_auth_fallback()?;
    let relayer_fallback = load_relayer_fallback()?;
    if let Ok(raw) = std::env::var(ENV_NETWORKS) {
        return parse_network_list(&raw, &auth_fallback, &relayer_fallback);
    }

    let network = std::env::var(ENV_NETWORK).unwrap_or_else(|_| DEFAULT_NETWORK_ID.into());
    validate_caip2_network(&network).with_context(|| {
        format!("{ENV_NETWORK} must be a CAIP-2 identifier like \"eip155:11155111\"")
    })?;
    // No default: pointing an unconfigured deployment at a live core API is worse
    // than refusing to start.
    let Some(api_url) = std::env::var(ENV_CORE_API_URL)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
    else {
        bail!(
            "{ENV_CORE_API_URL} must be set, or provide {ENV_NETWORKS} with a `coreApiUrl` per network"
        );
    };
    let api_base_url = normalize_url(&api_url)?;
    let auth = resolve_auth_config(None, None, None, &auth_fallback, &api_base_url, &network)?;
    let relayer = resolve_relayer_config(None, None, &relayer_fallback, &network)?;

    Ok(vec![NetworkConfig {
        id: network,
        core_api_base_url: api_base_url,
        auth,
        relayer,
    }])
}

fn parse_network_list(
    raw: &str,
    auth_fallback: &AuthFallback,
    relayer_fallback: &RelayerFallback,
) -> Result<Vec<NetworkConfig>> {
    let entries: Vec<NetworkEnvConfig> = serde_json::from_str(raw).with_context(|| {
        format!(
            "{ENV_NETWORKS} must be JSON like \
        '[{{\"network\":\"eip155:11155111\",\"coreApiUrl\":\"https://api.4mica.xyz/\"}}]'"
        )
    })?;
    if entries.is_empty() {
        bail!("{ENV_NETWORKS} must include at least one network entry");
    }

    let mut configs = Vec::with_capacity(entries.len());
    for entry in entries {
        let network = entry.network.trim();
        if network.is_empty() {
            bail!("{ENV_NETWORKS} entries require a non-empty `network` field");
        }
        validate_caip2_network(network).with_context(|| {
            format!("{ENV_NETWORKS} entry network must be CAIP-2 (e.g., \"eip155:11155111\")")
        })?;
        let core_api_url = entry.core_api_url.trim();
        if core_api_url.is_empty() {
            bail!("{ENV_NETWORKS} entry for {network} requires a non-empty `coreApiUrl`");
        }
        let url = normalize_url(core_api_url)
            .with_context(|| format!("failed to parse coreApiUrl for network {}", entry.network))?;
        let auth = resolve_auth_config(
            entry.auth_wallet_private_key.as_deref(),
            entry.auth_url.as_deref(),
            entry.auth_refresh_margin_secs,
            auth_fallback,
            &url,
            network,
        )?;
        let relayer = resolve_relayer_config(
            entry.relayer_private_key.as_deref(),
            entry.relayer_rpc_url.as_deref(),
            relayer_fallback,
            network,
        )?;
        configs.push(NetworkConfig {
            id: network.to_owned(),
            core_api_base_url: url,
            auth,
            relayer,
        });
    }

    Ok(configs)
}

struct AuthFallback {
    wallet_private_key: Option<String>,
    auth_url: Option<String>,
    refresh_margin_secs: Option<u64>,
}

/// Process-wide relayer defaults, applied to any network that does not set its own.
struct RelayerFallback {
    private_key: Option<String>,
    rpc_url: Option<String>,
}

fn load_relayer_fallback() -> Result<RelayerFallback> {
    let private_key = trimmed_env(ENV_RELAYER_PRIVATE_KEY);
    let rpc_url = trimmed_env(ENV_RELAYER_RPC_URL);

    // An RPC endpoint alone sponsors nothing. Failing here beats starting up looking configured
    // and rejecting every deposit at runtime.
    if private_key.is_none() && rpc_url.is_some() {
        bail!("{ENV_RELAYER_RPC_URL} is set without {ENV_RELAYER_PRIVATE_KEY}");
    }

    Ok(RelayerFallback {
        private_key,
        rpc_url,
    })
}

fn resolve_relayer_config(
    entry_private_key: Option<&str>,
    entry_rpc_url: Option<&str>,
    fallback: &RelayerFallback,
    network: &str,
) -> Result<Option<NetworkRelayerConfig>> {
    let private_key = entry_private_key
        .or(fallback.private_key.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let rpc_url = entry_rpc_url
        .or(fallback.rpc_url.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty());

    let Some(private_key) = private_key else {
        if rpc_url.is_some() {
            bail!(
                "network {network} provides a relayer RPC URL without a relayer private key; set \
                 {ENV_RELAYER_PRIVATE_KEY} or `relayerPrivateKey` in the {ENV_NETWORKS} entry"
            );
        }
        // Gas sponsorship is opt-in; a facilitator without it still serves /verify and /settle.
        return Ok(None);
    };

    let signer = private_key
        .parse::<PrivateKeySigner>()
        .with_context(|| format!("invalid relayer private key for network {network}"))?;

    let rpc_url = rpc_url
        .map(|value| {
            normalize_url(value)
                .with_context(|| format!("invalid relayer RPC URL for network {network}"))
        })
        .transpose()?;

    Ok(Some(NetworkRelayerConfig { signer, rpc_url }))
}

fn trimmed_env(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn load_auth_fallback() -> Result<AuthFallback> {
    let wallet_private_key = trimmed_env(ENV_AUTH_WALLET_PRIVATE_KEY);
    let auth_url = trimmed_env(ENV_AUTH_URL);
    let refresh_margin_secs = trimmed_env(ENV_AUTH_REFRESH_MARGIN_SECS)
        .map(|value| {
            value.parse::<u64>().with_context(|| {
                format!("{ENV_AUTH_REFRESH_MARGIN_SECS} must be a positive integer")
            })
        })
        .transpose()?;

    if wallet_private_key.is_none() && (auth_url.is_some() || refresh_margin_secs.is_some()) {
        bail!(
            "{ENV_AUTH_WALLET_PRIVATE_KEY} must be set when {ENV_AUTH_URL} or {ENV_AUTH_REFRESH_MARGIN_SECS} is provided"
        );
    }

    Ok(AuthFallback {
        wallet_private_key,
        auth_url,
        refresh_margin_secs,
    })
}

fn resolve_auth_config(
    entry_wallet_private_key: Option<&str>,
    entry_auth_url: Option<&str>,
    entry_refresh_margin_secs: Option<u64>,
    fallback: &AuthFallback,
    core_api_base_url: &Url,
    network: &str,
) -> Result<NetworkAuthConfig> {
    let wallet_private_key = entry_wallet_private_key
        .or(fallback.wallet_private_key.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let auth_url = entry_auth_url
        .or(fallback.auth_url.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let refresh_margin_secs = entry_refresh_margin_secs.or(fallback.refresh_margin_secs);

    if wallet_private_key.is_none()
        && (entry_auth_url.is_some() || entry_refresh_margin_secs.is_some())
    {
        bail!(
            "{ENV_NETWORKS} entry for {network} provides authUrl/authRefreshMarginSecs without authWalletPrivateKey"
        );
    }

    // Required: an unauthenticated facilitator would start cleanly and then fail
    // every guarantee request against the core API.
    let Some(wallet_private_key) = wallet_private_key else {
        bail!(
            "network {network} has no auth wallet private key; set {ENV_AUTH_WALLET_PRIVATE_KEY} \
             or provide `authWalletPrivateKey` in the {ENV_NETWORKS} entry"
        );
    };

    let auth_url = match auth_url {
        Some(value) => normalize_url(value)?,
        None => core_api_base_url.clone(),
    };

    Ok(NetworkAuthConfig {
        wallet_private_key: wallet_private_key.to_string(),
        auth_url,
        refresh_margin_secs: refresh_margin_secs.unwrap_or(DEFAULT_AUTH_REFRESH_MARGIN_SECS),
    })
}

fn bind_addr_from_env() -> Result<SocketAddr> {
    let host = std::env::var(ENV_HOST).unwrap_or_else(|_| "0.0.0.0".into());
    let port = std::env::var(ENV_PORT)
        .ok()
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(8080);
    let addr = format!("{host}:{port}")
        .parse()
        .with_context(|| format!("invalid HOST/PORT combination: {host}:{port}"))?;
    Ok(addr)
}

fn first_env_value(names: &[&str]) -> Option<String> {
    names.iter().find_map(|name| {
        std::env::var(name)
            .ok()
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty())
    })
}

fn normalize_url(input: &str) -> Result<Url> {
    let mut url = Url::parse(input).or_else(|_| Url::parse(&format!("{input}/")))?;
    if url.path().is_empty() {
        url.set_path("/");
    }
    Ok(url)
}

pub fn validate_caip2_network(value: &str) -> Result<()> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        bail!("network must be a non-empty CAIP-2 identifier");
    }

    let mut parts = trimmed.split(':');
    let namespace = parts.next().unwrap_or_default();
    let reference = parts.next().unwrap_or_default();
    if namespace.is_empty() || reference.is_empty() || parts.next().is_some() {
        bail!("network must be in CAIP-2 format (namespace:reference)");
    }
    if !namespace
        .chars()
        .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit())
    {
        bail!("network namespace must be lowercase alphanumeric");
    }
    if !reference
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
    {
        bail!("network reference must be alphanumeric or one of '-', '_', '.'");
    }

    Ok(())
}

async fn fetch_public_params(base: &Url) -> Result<CorePublicParameters> {
    let mut url = base.clone();
    url.set_path("core/public-params");

    let client = reqwest::Client::new();
    let response = client.get(url).send().await?;
    let response = response.error_for_status()?;
    Ok(response.json::<CorePublicParameters>().await?)
}

fn parse_hex_array<const N: usize>(value: &str) -> Result<[u8; N]> {
    let trimmed = value.strip_prefix("0x").unwrap_or(value);
    let decoded = hex::decode(trimmed)?;
    if decoded.len() != N {
        return Err(anyhow::anyhow!("expected {N} bytes, got {}", decoded.len()));
    }
    let mut bytes = [0u8; N];
    bytes.copy_from_slice(&decoded);
    Ok(bytes)
}

fn parse_optional_hex_array<const N: usize>(value: &str) -> Result<Option<[u8; N]>> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }
    parse_hex_array::<N>(trimmed).map(Some)
}

/// Fails startup unless core can decode the guarantee version this build signs at.
///
/// The facilitator always requests guarantees at [`GUARANTEE_CLAIMS_VERSION`], so a core that
/// cannot decode that version is unusable — better to refuse to start than to accept payments and
/// have core reject every issuance. The set is only sorted to keep the error message stable; the
/// facilitator has no use for the other versions core happens to accept, since it never signs at
/// them. That is deliberately unrelated to the *x402* versions we serve — see
/// [`crate::server::state::SUPPORTED_X402_VERSIONS`].
fn ensure_core_decodes_our_guarantee_version(raw_versions: &[u64]) -> Result<()> {
    if raw_versions.contains(&GUARANTEE_CLAIMS_VERSION) {
        return Ok(());
    }

    let mut supported: Vec<u64> = raw_versions.to_vec();
    supported.sort_unstable();
    supported.dedup();
    bail!(
        "core supports guarantee versions {supported:?} but this facilitator issues \
         v{GUARANTEE_CLAIMS_VERSION}; upgrade core or downgrade the facilitator"
    );
}

fn resolve_guarantee_domain(
    configured_guarantee_domain: Option<[u8; 32]>,
    active_guarantee_domain: Option<[u8; 32]>,
) -> Option<[u8; 32]> {
    configured_guarantee_domain.or(active_guarantee_domain)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rpc::CorePublicParameters;
    use serial_test::serial;
    use std::env;

    fn sample_core_params() -> CorePublicParameters {
        CorePublicParameters {
            public_key: vec![7u8; 48],
            contract_address: "0x0000000000000000000000000000000000000001".into(),
            ethereum_http_rpc_url: "https://rpc.example".into(),
            eip712_name: "4mica".into(),
            eip712_version: "1".into(),
            chain_id: 11155111,
            supported_guarantee_versions: vec![GUARANTEE_CLAIMS_VERSION],
            guarantee_domain_separator: format!("0x{}", "11".repeat(32)),
            validators: vec!["https://validator.example".into()],
        }
    }

    fn clear_network_env() {
        unsafe {
            env::remove_var(ENV_NETWORKS);
            env::remove_var(ENV_NETWORK);
            env::remove_var(ENV_CORE_API_URL);
            env::remove_var(ENV_AUTH_WALLET_PRIVATE_KEY);
            env::remove_var(ENV_AUTH_URL);
            env::remove_var(ENV_AUTH_REFRESH_MARGIN_SECS);
            env::remove_var(ENV_GUARANTEE_DOMAIN_VARIANTS[0]);
            env::remove_var(ENV_GUARANTEE_DOMAIN_VARIANTS[1]);
            env::remove_var(ENV_GUARANTEE_DOMAIN_VARIANTS[2]);
            env::remove_var(ENV_RELAYER_PRIVATE_KEY);
            env::remove_var(ENV_RELAYER_RPC_URL);
        }
    }

    /// Anvil account 0. Any well-formed secp256k1 key works; this one is recognisable.
    const TEST_RELAYER_KEY: &str =
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

    fn no_relayer_fallback() -> RelayerFallback {
        RelayerFallback {
            private_key: None,
            rpc_url: None,
        }
    }

    #[test]
    fn relayer_is_absent_when_nothing_is_configured() {
        let relayer =
            resolve_relayer_config(None, None, &no_relayer_fallback(), "eip155:84532").unwrap();
        assert!(
            relayer.is_none(),
            "gas sponsorship must stay opt-in so existing deployments are unaffected"
        );
    }

    #[test]
    fn relayer_rpc_url_defaults_to_cores_when_unset() {
        let relayer = resolve_relayer_config(
            Some(TEST_RELAYER_KEY),
            None,
            &no_relayer_fallback(),
            "eip155:84532",
        )
        .unwrap()
        .expect("relayer configured");
        assert!(
            relayer.rpc_url.is_none(),
            "an unset RPC URL defers to core's ethereum_http_rpc_url"
        );
    }

    #[test]
    fn relayer_entry_overrides_the_process_fallback() {
        let fallback = RelayerFallback {
            private_key: Some(TEST_RELAYER_KEY.into()),
            rpc_url: Some("https://fallback.example".into()),
        };
        let relayer = resolve_relayer_config(
            None,
            Some("https://per-network.example"),
            &fallback,
            "eip155:84532",
        )
        .unwrap()
        .expect("relayer configured");
        assert_eq!(
            relayer.rpc_url.as_ref().map(Url::as_str),
            Some("https://per-network.example/")
        );
    }

    /// An RPC endpoint with no key sponsors nothing; starting up "configured" would mean every
    /// deposit fails at runtime instead.
    #[test]
    fn relayer_rejects_an_rpc_url_without_a_key() {
        let err = resolve_relayer_config(
            None,
            Some("https://rpc.example"),
            &no_relayer_fallback(),
            "eip155:84532",
        )
        .expect_err("expected missing-key rejection");
        assert!(
            err.to_string().contains("without a relayer private key"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn relayer_rejects_a_malformed_private_key() {
        let err = resolve_relayer_config(
            Some("not-a-key"),
            None,
            &no_relayer_fallback(),
            "eip155:84532",
        )
        .expect_err("expected key parse failure");
        assert!(
            err.to_string().contains("invalid relayer private key"),
            "unexpected error: {err}"
        );
    }

    #[test]
    #[serial]
    fn public_parameters_from_core_keeps_the_contract_address_and_rpc_url() {
        clear_network_env();
        let params = sample_core_params();

        let public_params = public_parameters_from_core(params).expect("public params");
        assert_eq!(
            public_params.contract_address,
            Address::from_str("0x0000000000000000000000000000000000000001").unwrap()
        );
        assert_eq!(
            public_params
                .ethereum_http_rpc_url
                .as_ref()
                .map(Url::as_str),
            Some("https://rpc.example/")
        );
    }

    #[test]
    #[serial]
    fn public_parameters_from_core_rejects_a_malformed_contract_address() {
        clear_network_env();
        let mut params = sample_core_params();
        params.contract_address = "0xnot-an-address".into();

        let err = public_parameters_from_core(params).unwrap_err();
        assert!(
            err.to_string().contains("invalid contract_address"),
            "unexpected error: {err}"
        );
    }

    /// Core may omit the RPC URL; only a facilitator that sponsors gas needs one, and it fails
    /// later with a message naming the network.
    #[test]
    #[serial]
    fn public_parameters_from_core_tolerates_a_missing_rpc_url() {
        clear_network_env();
        let mut params = sample_core_params();
        params.ethereum_http_rpc_url = String::new();

        let public_params = public_parameters_from_core(params).expect("public params");
        assert!(public_params.ethereum_http_rpc_url.is_none());
    }

    #[test]
    #[serial]
    fn parses_networks_from_json_env() {
        clear_network_env();
        unsafe {
            env::set_var(
                ENV_NETWORKS,
                r#"[{"network":"eip155:1","coreApiUrl":"http://localhost:1234","authWalletPrivateKey":"0xabc"}]"#,
            );
        }

        let networks = load_networks_from_env().expect("networks parsed");
        assert_eq!(networks.len(), 1);
        assert_eq!(networks[0].id, "eip155:1");
        assert_eq!(
            networks[0].core_api_base_url.as_str(),
            "http://localhost:1234/"
        );
        assert_eq!(networks[0].auth.wallet_private_key, "0xabc");
        // authUrl defaults to the network's own core API URL.
        assert_eq!(networks[0].auth.auth_url.as_str(), "http://localhost:1234/");

        clear_network_env();
    }

    #[test]
    #[serial]
    fn rejects_network_entry_without_auth_wallet_private_key() {
        clear_network_env();
        unsafe {
            env::set_var(
                ENV_NETWORKS,
                r#"[{"network":"eip155:1","coreApiUrl":"http://localhost:1234"}]"#,
            );
        }

        // `.err().expect(...)` rather than `expect_err`: the latter needs Debug on
        // NetworkConfig, and NetworkAuthConfig holds the wallet private key.
        let err = load_networks_from_env()
            .err()
            .expect("missing private key must fail");
        assert!(
            err.to_string().contains(ENV_AUTH_WALLET_PRIVATE_KEY),
            "unexpected error: {err}"
        );

        clear_network_env();
    }

    #[test]
    #[serial]
    fn rejects_network_entry_with_empty_core_api_url() {
        clear_network_env();
        unsafe {
            env::set_var(
                ENV_NETWORKS,
                r#"[{"network":"eip155:1","coreApiUrl":"  ","authWalletPrivateKey":"0xabc"}]"#,
            );
        }

        // `.err().expect(...)` rather than `expect_err`: the latter needs Debug on
        // NetworkConfig, and NetworkAuthConfig holds the wallet private key.
        let err = load_networks_from_env()
            .err()
            .expect("empty coreApiUrl must fail");
        assert!(
            err.to_string().contains("coreApiUrl"),
            "unexpected error: {err}"
        );

        clear_network_env();
    }

    #[test]
    #[serial]
    fn falls_back_to_single_network_env() {
        clear_network_env();
        unsafe {
            env::set_var(ENV_NETWORK, "eip155:11155111");
            env::set_var(ENV_CORE_API_URL, "http://example.com");
            env::set_var(ENV_AUTH_WALLET_PRIVATE_KEY, "0xabc");
        }

        let networks = load_networks_from_env().expect("networks parsed");
        assert_eq!(networks.len(), 1);
        assert_eq!(networks[0].id, "eip155:11155111");
        assert_eq!(
            networks[0].core_api_base_url.as_str(),
            "http://example.com/"
        );
        assert_eq!(networks[0].auth.wallet_private_key, "0xabc");

        clear_network_env();
    }

    #[test]
    #[serial]
    fn rejects_missing_core_api_url_without_networks_env() {
        clear_network_env();
        unsafe {
            env::set_var(ENV_NETWORK, "eip155:11155111");
            env::set_var(ENV_AUTH_WALLET_PRIVATE_KEY, "0xabc");
        }

        // `.err().expect(...)` rather than `expect_err`: the latter needs Debug on
        // NetworkConfig, and NetworkAuthConfig holds the wallet private key.
        let err = load_networks_from_env()
            .err()
            .expect("missing core api url must fail");
        assert!(
            err.to_string().contains(ENV_CORE_API_URL),
            "unexpected error: {err}"
        );

        clear_network_env();
    }

    #[test]
    #[serial]
    fn rejects_missing_auth_wallet_private_key_without_networks_env() {
        clear_network_env();
        unsafe {
            env::set_var(ENV_NETWORK, "eip155:11155111");
            env::set_var(ENV_CORE_API_URL, "http://example.com");
        }

        // `.err().expect(...)` rather than `expect_err`: the latter needs Debug on
        // NetworkConfig, and NetworkAuthConfig holds the wallet private key.
        let err = load_networks_from_env()
            .err()
            .expect("missing private key must fail");
        assert!(
            err.to_string().contains(ENV_AUTH_WALLET_PRIVATE_KEY),
            "unexpected error: {err}"
        );

        clear_network_env();
    }

    #[test]
    fn validate_caip2_network_accepts_examples() {
        for value in [
            "eip155:1",
            "eip155:11155111",
            "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
            "cosmos:cosmoshub-4",
        ] {
            assert!(
                validate_caip2_network(value).is_ok(),
                "expected {value} to be valid"
            );
        }
    }

    #[test]
    fn validate_caip2_network_rejects_invalid_values() {
        for value in [
            "",
            "sepolia-mainnet",
            "eip155",
            "eip155:",
            ":11155111",
            "eip155:1:2",
            "EIP155:1",
            "eip155:11 155111",
        ] {
            assert!(
                validate_caip2_network(value).is_err(),
                "expected {value} to be invalid"
            );
        }
    }

    #[test]
    fn parse_hex_array_rejects_wrong_length() {
        let err = parse_hex_array::<4>("0x01").unwrap_err();
        assert!(
            err.to_string().contains("expected 4 bytes"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn normalize_url_appends_trailing_slash() {
        let url = normalize_url("http://example.com").expect("normalize");
        assert_eq!(url.as_str(), "http://example.com/");
    }

    /// Core accepting versions beyond ours is normal and must not fail startup — it only means
    /// core still serves older clients.
    #[test]
    fn ensure_core_decodes_our_guarantee_version_accepts_a_wider_core() {
        ensure_core_decodes_our_guarantee_version(&[
            GUARANTEE_CLAIMS_VERSION,
            GUARANTEE_CLAIMS_VERSION + 1,
        ])
        .expect("a core that decodes our version is usable");
    }

    /// The facilitator only ever asks core to issue at `GUARANTEE_CLAIMS_VERSION`; a core that
    /// cannot decode it would reject every request, so startup must fail loudly instead.
    #[test]
    fn ensure_core_decodes_our_guarantee_version_rejects_a_core_without_our_version() {
        let err = ensure_core_decodes_our_guarantee_version(&[GUARANTEE_CLAIMS_VERSION + 1])
            .expect_err("expected version mismatch");
        assert!(
            err.to_string().contains("this facilitator issues"),
            "unexpected error: {err}"
        );
    }

    /// The reported set is sorted and deduped so the operator-facing error is stable regardless of
    /// the order core happens to serialize it in.
    #[test]
    fn ensure_core_decodes_our_guarantee_version_reports_a_sorted_deduped_set() {
        let err = ensure_core_decodes_our_guarantee_version(&[9, 7, 9])
            .expect_err("expected version mismatch");
        assert!(
            err.to_string().contains("[7, 9]"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn resolve_guarantee_domain_prefers_env_override() {
        let resolved = resolve_guarantee_domain(Some([1u8; 32]), Some([2u8; 32]));
        assert_eq!(resolved, Some([1u8; 32]));
    }

    #[test]
    fn resolve_guarantee_domain_falls_back_to_active_domain() {
        let resolved = resolve_guarantee_domain(None, Some([2u8; 32]));
        assert_eq!(resolved, Some([2u8; 32]));
    }

    #[test]
    fn resolve_guarantee_domain_allows_no_domain() {
        let resolved = resolve_guarantee_domain(None, None);
        assert_eq!(resolved, None);
    }

    #[test]
    #[serial]
    fn public_parameters_from_core_rejects_invalid_active_domain() {
        clear_network_env();
        let mut params = sample_core_params();
        params.guarantee_domain_separator = "0x1234".into();

        let err = public_parameters_from_core(params).unwrap_err();
        assert!(
            err.to_string()
                .contains("invalid guarantee_domain_separator"),
            "unexpected error: {err}"
        );
    }

    #[test]
    #[serial]
    fn public_parameters_from_core_rejects_a_core_without_our_guarantee_version() {
        clear_network_env();
        let mut params = sample_core_params();
        params.supported_guarantee_versions = vec![GUARANTEE_CLAIMS_VERSION + 1];

        let err = public_parameters_from_core(params).unwrap_err();
        assert!(
            err.to_string().contains("this facilitator issues"),
            "unexpected error: {err}"
        );
    }

    #[test]
    #[serial]
    fn public_parameters_from_core_prefers_env_domain_over_active_domain() {
        clear_network_env();
        unsafe {
            env::set_var(
                ENV_GUARANTEE_DOMAIN_VARIANTS[0],
                format!("0x{}", "22".repeat(32)),
            );
        }
        let params = sample_core_params();

        let public_params = public_parameters_from_core(params).expect("public params");
        assert_eq!(public_params.active_guarantee_domain, Some([0x11; 32]));
        assert_eq!(public_params.guarantee_domain, Some([0x22; 32]));

        clear_network_env();
    }

    #[test]
    #[serial]
    fn public_parameters_from_core_uses_active_domain_when_no_override_is_set() {
        clear_network_env();
        let params = sample_core_params();

        let public_params = public_parameters_from_core(params).expect("public params");
        assert_eq!(public_params.active_guarantee_domain, Some([0x11; 32]));
        assert_eq!(public_params.guarantee_domain, Some([0x11; 32]));
    }

    #[test]
    #[serial]
    fn public_parameters_from_core_carries_the_validator_allowlist() {
        clear_network_env();
        let params = sample_core_params();

        let public_params = public_parameters_from_core(params).expect("public params");
        assert_eq!(public_params.validators, vec!["https://validator.example"]);
    }

    #[test]
    #[serial]
    fn public_parameters_from_core_rejects_an_empty_validator_identity() {
        clear_network_env();
        let mut params = sample_core_params();
        params.validators = vec!["   ".into()];

        let err = public_parameters_from_core(params).unwrap_err();
        assert!(
            err.to_string().contains("validators cannot contain empty"),
            "unexpected error: {err}"
        );
    }
}
