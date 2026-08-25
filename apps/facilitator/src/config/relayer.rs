//! Relayer credentials: which key signs sponsored transactions, and on which endpoint.
//!
//! Resolution is two-tier — a per-network entry in `X402_NETWORKS` wins over the process-wide
//! `X402_RELAYER_*` fallback — so a single-chain deployment needs only a key while a multi-chain
//! one can give each network its own.

use alloy::signers::local::PrivateKeySigner;
use anyhow::{Context, Result, bail};
use reqwest::Url;

use super::{ENV_NETWORKS, normalize_url, trimmed_env};

pub(super) const ENV_RELAYER_PRIVATE_KEY: &str = "X402_RELAYER_PRIVATE_KEY";
pub(super) const ENV_RELAYER_RPC_URL: &str = "X402_RELAYER_RPC_URL";

/// Credentials for submitting sponsored transactions (e.g. gasless deposits) on a network.
///
/// Deliberately separate from [`super::NetworkAuthConfig`]: that key is an *identity* used to sign
/// SIWE logins against core and needs no balance, whereas this one signs real transactions and must
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

/// Process-wide relayer defaults, applied to any network that does not set its own.
pub(super) struct RelayerFallback {
    pub private_key: Option<String>,
    pub rpc_url: Option<String>,
}

pub(super) fn load_relayer_fallback() -> Result<RelayerFallback> {
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

pub(super) fn resolve_relayer_config(
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
