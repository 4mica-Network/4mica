use std::net::SocketAddr;

use anyhow::{Context, Result, bail};
use reqwest::Url;
use rpc::{CorePublicParameters, GUARANTEE_CLAIMS_VERSION};
use serde::Deserialize;

const ENV_SCHEME: &str = "X402_SCHEME";
const ENV_NETWORK: &str = "X402_NETWORK";
const ENV_NETWORKS: &str = "X402_NETWORKS";
const ENV_CORE_API_URL: &str = "X402_CORE_API_URL";
const ENV_AUTH_WALLET_PRIVATE_KEY: &str = "X402_AUTH_WALLET_PRIVATE_KEY";
const ENV_AUTH_URL: &str = "X402_AUTH_URL";
const ENV_AUTH_REFRESH_MARGIN_SECS: &str = "X402_AUTH_REFRESH_MARGIN_SECS";
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
}

#[derive(Clone)]
pub struct NetworkConfig {
    pub id: String,
    pub core_api_base_url: Url,
    pub auth: NetworkAuthConfig,
}

#[derive(Clone)]
pub struct NetworkAuthConfig {
    pub wallet_private_key: String,
    pub auth_url: Url,
    pub refresh_margin_secs: u64,
}

impl ServiceConfig {
    pub fn from_env() -> Result<Self> {
        let bind_addr = bind_addr_from_env()?;
        let scheme = std::env::var(ENV_SCHEME).unwrap_or_else(|_| "4mica-credit".into());
        let networks = load_networks_from_env()?;
        Ok(Self {
            bind_addr,
            scheme,
            networks,
        })
    }
}

#[derive(Clone, Debug)]
#[allow(dead_code)]
pub struct PublicParameters {
    pub operator_public_key: [u8; 48],
    pub guarantee_domain: Option<[u8; 32]>,
    pub active_guarantee_domain: Option<[u8; 32]>,
    /// Guarantee claims versions core can decode. Distinct from the x402 protocol version — see
    /// [`crate::server::state::SUPPORTED_X402_VERSIONS`].
    pub supported_guarantee_versions: Vec<u64>,
    /// Validator identities this operator whitelisted. A signed validation requirement may only
    /// name one of these. By convention a URL or CAIP-10 account id, not an address.
    pub validators: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NetworkEnvConfig {
    network: String,
    core_api_url: String,
    auth_wallet_private_key: Option<String>,
    auth_url: Option<String>,
    auth_refresh_margin_secs: Option<u64>,
}

pub async fn load_public_params(api_base: &Url) -> Result<PublicParameters> {
    let params = fetch_public_params(api_base).await?;
    public_parameters_from_core(params)
}

fn public_parameters_from_core(params: CorePublicParameters) -> Result<PublicParameters> {
    let supported_guarantee_versions =
        normalize_supported_guarantee_versions(&params.supported_guarantee_versions)?;
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

    Ok(PublicParameters {
        operator_public_key,
        guarantee_domain,
        active_guarantee_domain,
        supported_guarantee_versions,
        validators,
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
    if let Ok(raw) = std::env::var(ENV_NETWORKS) {
        return parse_network_list(&raw, &auth_fallback);
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

    Ok(vec![NetworkConfig {
        id: network,
        core_api_base_url: api_base_url,
        auth,
    }])
}

fn parse_network_list(raw: &str, auth_fallback: &AuthFallback) -> Result<Vec<NetworkConfig>> {
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
        configs.push(NetworkConfig {
            id: network.to_owned(),
            core_api_base_url: url,
            auth,
        });
    }

    Ok(configs)
}

struct AuthFallback {
    wallet_private_key: Option<String>,
    auth_url: Option<String>,
    refresh_margin_secs: Option<u64>,
}

fn load_auth_fallback() -> Result<AuthFallback> {
    let wallet_private_key = std::env::var(ENV_AUTH_WALLET_PRIVATE_KEY)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty());
    let auth_url = std::env::var(ENV_AUTH_URL)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty());
    let refresh_margin_secs = std::env::var(ENV_AUTH_REFRESH_MARGIN_SECS)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
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

/// Guarantee versions core can decode, narrowed to what this build knows how to sign.
///
/// The facilitator always requests guarantees at [`GUARANTEE_CLAIMS_VERSION`], so a core that
/// cannot decode that version is unusable and startup fails rather than issuing requests core
/// will reject.
fn normalize_supported_guarantee_versions(raw_versions: &[u64]) -> Result<Vec<u64>> {
    let mut supported: Vec<u64> = raw_versions.to_vec();
    supported.sort_unstable();
    supported.dedup();

    if !supported.contains(&GUARANTEE_CLAIMS_VERSION) {
        bail!(
            "core supports guarantee versions {supported:?} but this facilitator issues \
             v{GUARANTEE_CLAIMS_VERSION}; upgrade core or downgrade the facilitator"
        );
    }

    Ok(supported)
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
        }
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

    #[test]
    fn normalize_supported_guarantee_versions_sorts_and_dedupes() {
        let supported =
            normalize_supported_guarantee_versions(&[2, 1, 1]).expect("supported versions");
        assert_eq!(supported, vec![1, 2]);
    }

    /// The facilitator only ever asks core to issue at `GUARANTEE_CLAIMS_VERSION`; a core that
    /// cannot decode it would reject every request, so startup must fail loudly instead.
    #[test]
    fn normalize_supported_guarantee_versions_rejects_a_core_without_our_version() {
        let err = normalize_supported_guarantee_versions(&[GUARANTEE_CLAIMS_VERSION + 1])
            .expect_err("expected version mismatch");
        assert!(
            err.to_string().contains("this facilitator issues"),
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
