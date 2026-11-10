---
"@4mica/x402": minor
---

Base mainnet (`eip155:8453`) joins Base Sepolia as a supported network.

- `SUPPORTED_NETWORKS` is now `['eip155:84532', 'eip155:8453']`, so `paymentMiddlewareFromConfig`
  registers the 4mica scheme for Base mainnet and `FourMicaEvmScheme.create` connects to it.
- The middleware routes each network to its own hosted facilitator: Base Sepolia to
  `https://testnet.payment.4mica.io`, Base mainnet to `https://payment.4mica.io`. The map is
  exported as `FACILITATOR_URLS`, and `hostedFacilitatorClients(networks)` builds the clients.
- `FourMicaFacilitatorClient` takes an optional `networks` list and narrows its `/supported` to
  it, so two facilitators can sit side by side without either claiming the other's network.
- `FourMicaEvmScheme.create` no longer fails when a default network's core is unreachable: it
  warns and skips that network. A network named in `networks` or `coreUrls` still has to connect.

The Python package `4mica-x402` gets the same changes in 2.1.0: `SUPPORTED_NETWORKS`,
`FACILITATOR_URLS`, `hosted_facilitator_clients` / `hosted_facilitator_clients_sync`, a `networks`
argument on both facilitator clients, and a `create_default_client_scheme` that skips an
unreachable default core.
