---
name: 4Mica
description: 4Mica x402 credit-flow integration. Use when building or modifying a client (payer) that signs 4mica-credit x402 payments, a resource server (recipient) that issues 402 paymentRequirements and calls the facilitator's /verify and /settle, or the facilitator itself; or when wiring the 4Mica SDKs (TypeScript, Rust, Python) and core endpoints.
---

# 4Mica x402

## Overview
Implement the `4mica-credit` scheme for x402-protected HTTP resources. A payer signs a payment
guarantee claim straight from the recipient's `paymentRequirements`; the recipient hands the signed
payload to the facilitator, which verifies it and settles by issuing a BLS certificate through
4mica core. There is no tab, no token allowance and no per-payment on-chain transaction: the
payer's collateral backs the guarantee, and guarantees net into one settlement per cycle. Prefer
SDK methods over hand-built payloads or signatures.

## Constraint: Documentation-Only Agent
- This agent does **not** execute SDKs or run commands. It only produces guidance in markdown.
- Describe how to use the SDKs and facilitator, but do not perform installs, API calls, or runtime actions.

## Core Capabilities
1. Generate x402 payment headers for v2 (`PAYMENT-SIGNATURE`) and legacy v1 (`X-PAYMENT`) using the official SDKs.
2. Validate payment payloads with `POST /verify` before doing work.
3. Settle payments with `POST /settle` to obtain the BLS certificate.
4. Fund a payer's collateral, gaslessly through `POST /deposit` when the facilitator runs a relayer.
5. Run or modify the facilitator with multi-network configuration.

## Decision Guide
- Implementing a payer or client that retries a 402-protected request: use Client (Payer) Flow.
- Implementing a protected resource server: use Resource Server (Recipient) Flow.
- Running or modifying the facilitator: use Facilitator Operations.

## Prerequisites (Informational Only)
- A 4Mica signing key for the payer, with collateral deposited in 4mica core for the asset.
- A recipient address for resource servers.
- A supported CAIP-2 network string: `eip155:8453` (Base) or `eip155:84532` (Base Sepolia).
- A facilitator URL: hosted at `https://x402.4mica.xyz/`, or self-run.
- The core API for the network: `https://base.api.4mica.xyz/` (Base) or
  `https://base.sepolia.api.4mica.xyz/` (Base Sepolia). `GET /core/tokens` lists the accepted assets;
  `GET /core/public-params` carries the EIP-712 guarantee domain.

## Client (Payer) Flow
1. Configure a 4Mica SDK client with the wallet signing key and the network (`ConfigBuilder.network("base-sepolia")`, or the core API URL).
2. Make the request. On `402`, read the `payment-required` response header (v2: base64 JSON with `x402Version: 2`, `accepts[]`, `resource`) or the JSON body's `accepts` (v1).
3. Pick the `accepts` entry with `scheme: "4mica-credit"`.
4. Sign with `X402Flow`. v2: `signPaymentV2(paymentRequired, accepted, userAddress)`, then send the `PAYMENT-SIGNATURE` header. v1: `signPayment(requirements, userAddress)`, then send the `X-PAYMENT` header. The flow mints a random 32-byte `req_id`, builds the claims (`user_address`, `recipient_address` = `payTo`, `asset_address` = `asset`, `amount`, `timestamp`, plus `validation` when the requirements carry `extra.validation`) and EIP-712-signs them against core's guarantee domain.
5. Retry the request with the signed header.
6. Close the client after use.
7. With `@4mica/x402` and `@x402/fetch`, steps 2 to 5 are automatic: `wrapFetchWithPaymentFromConfig(fetch, { schemes: [{ network, client: await FourMicaEvmScheme.create(account) }] })`.

## Resource Server (Recipient) Flow
1. On the initial request, reply `402 Payment Required` with the requirements: v2 puts base64 of `{ x402Version: 2, accepts: [...], resource }` in the `payment-required` header; v1 puts `accepts` in the JSON body.
2. Each entry carries `scheme: "4mica-credit"`, a CAIP-2 `network`, `payTo`, `asset` (an address from core's token list for that network), `amount` (v2) or `maxAmountRequired` (v1), and `maxTimeoutSeconds`.
3. To gate the payment on an external validator, add `extra.validation = { validator, subject, deadline?, params? }`. The middleware also fills `extra.name`, `extra.version` and `extra.verifyingContract` with core's EIP-712 domain (`eip712_name`, `eip712_version` and `contract_address` from `GET /core/public-params`), so a payer can sign without calling core; a hand-built 402 should copy them in. There is no tab endpoint.
4. On the paid request, decode `PAYMENT-SIGNATURE` (or legacy `X-PAYMENT`) into `paymentPayload`.
5. Call facilitator `POST /verify` with `{ x402Version, paymentPayload, paymentRequirements }`.
6. Do the work only if `isValid` is true.
7. Call facilitator `POST /settle` with the same body to obtain the BLS certificate; core binds the guarantee to the open settlement cycle for the asset.
8. Persist the certificate if you want an audit trail. Net credit is claimed on-chain when the cycle commits.
9. With `@4mica/x402/server/express`, steps 1 to 7 are `paymentMiddlewareFromConfig({ "GET /path": { accepts: { scheme: "4mica-credit", price: "$0.10", network, payTo } } })`. The middleware resolves `price` to the stablecoin core lists for the network.

## Facilitator Operations
1. Use the hosted facilitator (`https://x402.4mica.xyz/`) or run your own instance.
2. Configure `X402_NETWORKS` (per-network `coreApiUrl` and auth key) and, for sponsored deposits, withdrawals and clearing, the relayer keys.
3. Expose `GET /supported`, `GET /health`, `POST /verify`, `POST /settle`, and when a relayer is configured `POST /deposit`, `/withdraw`, `/clearing/pay`, `/clearing/claim` (each with a `/verify` twin).
4. Enforce scheme, network, asset, amount, `payTo` and `extra.validation` checks before settlement.
5. When modifying code, start with `src/server/` and `src/config/` in `apps/facilitator`.

## Version Notes
- v2 (primary) uses the `payment-required` response header and the `PAYMENT-SIGNATURE` request header. The envelope is `{ x402Version: 2, accepted, payload, resource? }`.
- v1 (legacy) uses a JSON body with `accepts` and the `X-PAYMENT` request header. The envelope is `{ x402Version: 1, scheme, network, payload }`.
- The claims are `version: "v1"` in both. The x402 version and the claims version are independent.

## Security and Correctness Rules
1. Never hand-construct signatures or payment payloads. Use the SDKs.
2. `scheme` must be `4mica-credit` and match the payment payload.
3. `network` must be one returned by `/supported`.
4. `payTo`, `asset`, `amount` or `maxAmountRequired`, and `extra.validation` must match the signed claims exactly.
5. Always call `/verify` before `/settle` and before performing the protected work.
6. `req_id` is minted by the payer per payment; core rejects duplicates.

## Troubleshooting Checklist
- `scheme` mismatch or missing `4mica-credit`.
- `network` not supported by `/supported`.
- `asset` not in core's token list for the network (`GET /core/tokens`).
- `payTo`, `asset`, or amount mismatch with the claims.
- Payer has no free collateral for the asset: deposit first (`POST /deposit` for the gasless route).
- Attempted settlement without successful verification.

## References
- `apps/facilitator/README.md` for endpoints, env vars, and request/response shapes.
- `packages/sdk/README.md` (`@4mica/sdk`), `packages/sdk-rust/README.md` (`sdk-4mica`), `packages/sdk-python/README.md` (`fourmica_sdk`).
- `apps/facilitator/packages/typescript/x402/README.md` for the Express middleware and the fetch client.
