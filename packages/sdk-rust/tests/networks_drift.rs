//! `Network` against `packages/sdk/networks.json`; skipped when the file is absent.

use std::str::FromStr;

use alloy::signers::local::PrivateKeySigner;
use sdk_4mica::{ClientBuilder, Network};
use serde_json::{Map, Value};

const NETWORKS_JSON: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../sdk/networks.json");
const SOURCE: &str = "packages/sdk/networks.json";

/// The exhaustive match below makes a new variant a compile error here.
const ALL_VARIANTS: [Network; 3] = [
    Network::Base,
    Network::BaseSepolia,
    Network::EthereumSepolia,
];

#[allow(dead_code)]
fn exhaustive(network: Network) {
    match network {
        Network::Base | Network::BaseSepolia | Network::EthereumSepolia => {}
    }
}

fn load_networks() -> Option<Map<String, Value>> {
    let raw = match std::fs::read_to_string(NETWORKS_JSON) {
        Ok(raw) => raw,
        Err(e) => {
            eprintln!("skipping network drift check: cannot read {NETWORKS_JSON}: {e}");
            return None;
        }
    };
    let value: Value =
        serde_json::from_str(&raw).unwrap_or_else(|e| panic!("{SOURCE} is not valid JSON: {e}"));
    match value {
        Value::Object(map) => Some(map),
        _ => panic!("{SOURCE} must be an object keyed by network shorthand"),
    }
}

fn field<'a>(entry: &'a Value, shorthand: &str, name: &str) -> &'a str {
    entry[name]
        .as_str()
        .unwrap_or_else(|| panic!("{SOURCE}: {shorthand}.{name} is missing or not a string"))
}

#[test]
fn every_json_network_parses_to_a_matching_variant() {
    let Some(networks) = load_networks() else {
        return;
    };
    for (shorthand, entry) in &networks {
        let caip2 = field(entry, shorthand, "caip2");
        let rpc_url = field(entry, shorthand, "rpcUrl");

        let network = Network::from_str(shorthand).unwrap_or_else(|e| {
            panic!("{SOURCE} lists {shorthand:?} but Network::from_str rejects it: {e}")
        });
        assert_eq!(
            network.caip2(),
            caip2,
            "{shorthand}: Network::caip2() drifted from {SOURCE}"
        );
        assert_eq!(
            network.rpc_url(),
            rpc_url,
            "{shorthand}: Network::rpc_url() drifted from {SOURCE} rpcUrl"
        );

        let by_caip2 = Network::from_str(caip2).unwrap_or_else(|e| {
            panic!("{SOURCE} lists {caip2:?} for {shorthand} but Network::from_str rejects it: {e}")
        });
        assert_eq!(
            by_caip2, network,
            "{caip2} and {shorthand} parse to different variants"
        );
    }
}

#[test]
fn every_variant_is_in_the_json() {
    let Some(networks) = load_networks() else {
        return;
    };
    for network in ALL_VARIANTS {
        let listed = networks
            .values()
            .any(|entry| entry["caip2"].as_str() == Some(network.caip2()));
        assert!(
            listed,
            "Network::{network:?} ({}) is missing from {SOURCE}",
            network.caip2()
        );
    }
    assert_eq!(
        networks.len(),
        ALL_VARIANTS.len(),
        "{SOURCE} and the Network enum list a different number of networks"
    );
}

#[test]
fn default_rpc_url_is_a_listed_network() {
    let Some(networks) = load_networks() else {
        return;
    };
    // DEFAULT_RPC_URL is private; read it back through the builder's default instead.
    let signer = PrivateKeySigner::from_str(
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    )
    .expect("valid private key");
    let config = ClientBuilder::default()
        .signer(signer)
        .build()
        .expect("default config should build");
    let default_url = config.rpc_url.as_str();
    let listed = networks
        .values()
        .any(|entry| entry["rpcUrl"].as_str() == Some(default_url));
    assert!(
        listed,
        "default rpc_url {default_url} is not an rpcUrl in {SOURCE}"
    );
}
