---
name: 4Mica
description: 4Mica payment network and x402 credit-flow integration. Use when you need to build or modify a client (payer) that signs 4Mica x402 payments, a resource server (recipient) that issues 402 paymentRequirements and calls the facilitator, or the facilitator itself; when configuring tabs/verify/settle flows; or when wiring 4Mica SDKs (TypeScript, Rust, Python) and core endpoints.
---

# 4Mica x402

## Overview
Implement 4Mica credit flows for x402-protected HTTP resources. Use the SDKs to sign payment
requirements and the facilitator to manage tabs, verify payment payloads, and settle for BLS
certificates. Prefer SDK methods over hand-constructed payloads or signatures.

## Constraint: Documentation-Only Agent
- This agent does **not** execute SDKs or run commands. It only produces guidance in markdown.
- Describe how to use the SDKs and facilitator, but do not perform installs, API calls, or runtime actions.

## Core Capabilities
1. Generate X402 payment headers for v1 and v2 flows using the official SDKs.
2. Issue and refresh tabs via `POST /tabs` using a resource server tab endpoint.
3. Validate payment payloads with `POST /verify` before doing work.
4. Settle payments with `POST /settle` to mint a BLS certificate.
5. Run or modify the facilitator with multi-network configuration.

## Decision Guide
- If you are implementing a payer or client that retries a 402-protected request, use Client (Payer) Flow.
- If you are implementing a protected resource server, use Resource Server (Recipient) Flow.
- If you are running or modifying the facilitator, use Facilitator Operations.
- If you need concrete APIs or examples, open the relevant file in `references/`.

## Prerequisites (Informational Only)
- A 4Mica signing key for clients/payers.
- A recipient address for resource servers.
- A supported CAIP-2 network string (example: `eip155:80002`).
- A facilitator URL (hosted or self-run).
- SDK installation steps belong in references; do not run installs here.

## Client (Payer) Flow
1. Configure a 4Mica SDK client using a wallet signing key.
2. Fetch `paymentRequirements` from the resource server.
3. Confirm `paymentRequirements.extra.tabEndpoint` is present. X402 flows require it.
4. Use `X402Flow` to sign. For v1, call `signPayment(...)` and send the `X-PAYMENT` header. For v2, decode the `payment-required` header, call `signPaymentV2(...)`, and send the `PAYMENT-SIGNATURE` header.
5. Retry the HTTP request with the signed header.
6. Close the client after use.

## Resource Server (Recipient) Flow
1. On the initial request, reply with `402 Payment Required` and a `paymentRequirements` object.
2. Include `scheme` (must include `4mica`, example `4mica-credit`).
3. Include `network` as CAIP-2 (example `eip155:80002`).
4. Include `payTo`, `asset`, and `maxAmountRequired` (v1) or `amount` (v2).
5. Include `extra.tabEndpoint` that points to your tab endpoint.
6. Implement the tab endpoint to accept `{ userAddress, paymentRequirements }` and call facilitator `POST /tabs` with `{ userAddress, recipientAddress=payTo, erc20Token=asset, network?, ttlSeconds? }`.
7. Return the tab response to the client (at minimum `tabId` and `userAddress`).
8. On the paid request, decode the payment header into a `paymentPayload`.
9. Call facilitator `POST /verify` with `{ paymentPayload, paymentRequirements }`.
10. Do the work only if `isValid` is true.
11. Call facilitator `POST /settle` to obtain the BLS certificate.
12. Persist the certificate for downstream remuneration if needed.

## Facilitator Operations
1. Use the hosted facilitator (`https://x402.4mica.xyz/`) or run your own instance.
2. Configure env vars for scheme, networks, core API URL, and assets.
3. Expose `GET /supported`, `GET /health`, and `POST /tabs`, `/verify`, `/settle`.
4. Enforce scheme, network, asset, and amount checks before settlement.
5. When modifying code, start with `src/server/` and `src/config.rs` in the facilitator repo.

## Version Notes
- v1 uses a JSON response body containing `accepts` and the `X-PAYMENT` header on retry.
- v2 uses a `payment-required` header (base64-encoded) and the `PAYMENT-SIGNATURE` header on retry.

## Security and Correctness Rules
1. Never hand-construct signatures or payment payloads. Use the SDKs.
2. Ensure `scheme` includes `4mica-credit` and matches the payment payload.
3. Ensure `network` matches a value returned by `/supported`.
4. Ensure `payTo`, `asset`, and `amount` or `maxAmountRequired` match the signed claims exactly.
5. Always call `/verify` before `/settle` and before performing the protected work.

## Troubleshooting Checklist
- `scheme` mismatch or missing `4mica`.
- `network` not supported by `/supported`.
- `extra.tabEndpoint` missing or unreachable.
- `payTo`, `asset`, or amount mismatch with claims.
- Attempted settlement without successful verification.

## References
- `references/facilitator.md` for endpoints, env vars, and request/response shapes.
- `references/sdk-typescript.md` for `@4mica/sdk` usage and X402Flow details.
- `references/sdk-rust.md` for `sdk-4mica` usage and X402Flow details.
- `references/sdk-python.md` for the Python `fourmica_sdk` example.
