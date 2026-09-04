[![npm](https://img.shields.io/npm/v/@4mica/sdk.svg)](https://www.npmjs.com/package/@4mica/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

# 4Mica TypeScript SDK

The official TypeScript SDK for interacting with the 4Mica payment network.

## Overview

4Mica is a payment network that enables cryptographically-enforced lines of credit for autonomous
payments. Payments are guaranteed off-chain and netted into **settlement cycles**: core nets each
participant's obligations per cycle into a single net-debit or net-credit committed to an on-chain
Merkle root. This SDK provides:

- **Capability sub-clients**: `deposit`, `withdraw`, `payment`, `settlement`, `account`, `tokens`
- **X402 Flow Helper**: generate `X-PAYMENT` headers for 402-protected HTTP resources — tab-free,
  with a random per-payment `reqId` and no server round-trip before signing
- **Server paywall** (`@4mica/sdk/server`): a runtime-neutral, edge-safe primitive for gating a
  route behind an x402 payment
- **Golden-vector parity**: EIP-712/EIP-191 digests and the guarantee envelope are pinned by the
  same fixtures the Rust and Python SDKs test against

## Universal: runtime-neutral core + thin adapters

`@4mica/sdk` is runtime-neutral (Node, Bun, Deno, edge). HTTP uses the global `fetch`, and the
`@4mica/sdk/server` subpath is `Buffer`-free so it runs on edge runtimes.

- **Runtime adapters** — env-driven client/paywall factories: `@4mica/sdk-node`, `@4mica/sdk-bun`, `@4mica/sdk-deno`
- **Framework adapters** — thin x402 paywall middleware: `@4mica/sdk-next`, `@4mica/sdk-express`, `@4mica/sdk-hono` (Nuxt / SvelteKit / Remix coming soon)

### Server paywall

Gate any route behind a payment. When no valid `X-PAYMENT` header is present, the paywall returns a
`402` with the x402 payment requirements; otherwise it verifies the payment and lets the request
through, adding an `X-PAYMENT-RESPONSE` header.

```ts
import { createPaywall } from "@4mica/sdk/server";

const paywall = createPaywall(client.rpc, {
  payTo: "0x…",
  asset: "0x0000000000000000000000000000000000000000",
  network: "base-sepolia",
  amount: "1000",
});

// Web-standard (Hono, Next route handlers, SvelteKit, Remix, Deno, Bun.serve):
const result = await paywall.handle(request);
if (result instanceof Response) return result; // 402
// ...run your handler, then merge result.headers onto the response

// Or the low-level, framework-agnostic primitive:
const decision = await paywall.protect({ method, url, header: (n) => headers.get(n) });
```

Prefer a framework adapter (`@4mica/sdk-express`, `@4mica/sdk-hono`, `@4mica/sdk-next`) for
idiomatic middleware. The paywall only **verifies** payment; on-chain settlement (the
cycle-clearing claim flow) remains an out-of-band recipient operation.

## Installation

```bash
npm install @4mica/sdk
# or
yarn add @4mica/sdk
```

Node.js 18+ is required.

## Networks

| Shorthand          | CAIP-2            | Core API URL                              |
| ------------------ | ----------------- | ----------------------------------------- |
| `base`             | `eip155:8453`     | `https://base.api.4mica.xyz/`             |
| `ethereum-sepolia` | `eip155:11155111` | `https://ethereum.sepolia.api.4mica.xyz/` |
| `base-sepolia`     | `eip155:84532`    | `https://base.sepolia.api.4mica.xyz/`     |

The default network is Ethereum Sepolia. Use `.network()` or the `4MICA_NETWORK` environment
variable to switch networks.

```ts
import { NETWORKS } from '@4mica/sdk';

console.log(NETWORKS['base'].caip2); // "eip155:8453"
console.log(NETWORKS['base'].rpcUrl); // "https://base.api.4mica.xyz/"
```

## Initialization and Configuration

The SDK requires a signing key and can use sensible defaults for the rest:

- `walletPrivateKey` (**required** unless `signer` is provided): private key used for signing
- `network` (optional): select a network by shorthand or CAIP-2 id. Defaults to `ethereum-sepolia`.
- `rpcUrl` (optional): override the core API URL directly (for self-hosted deployments).
- `ethereumHttpRpcUrl` (optional): Ethereum JSON-RPC endpoint; fetched from core if omitted
- `contractAddress` (optional): Core4Mica contract address; fetched from core if omitted
- `facilitatorUrl` (optional): facilitator that sponsors gas; without one, every operation is self-funded
- `bearerToken` (optional): static bearer token for auth (replaces SIWE)
- `authUrl` and `authRefreshMarginSecs` (optional): SIWE auth config. SIWE is on by default
  (defaults to `rpcUrl` and 60 seconds); disable it entirely with `disableAuth()`.

> Note: `ethereumHttpRpcUrl` and `contractAddress` are fetched from the core service by default.
> Connecting validates that core supports the guarantee version this SDK signs and resolves the
> guarantee domain separators; the Ethereum RPC is only contacted lazily, on first on-chain use.

### 1) Using ConfigBuilder

```ts
import { Client, ConfigBuilder } from '@4mica/sdk';

async function main() {
  const cfg = new ConfigBuilder()
    .network('base') // or "ethereum-sepolia" (default)
    .walletPrivateKey('0x...')
    .build();

  const client = await Client.connect(cfg);
  try {
    // use client.deposit, client.payment, client.settlement, …
  } finally {
    await client.aclose();
  }
}
```

### 2) Using Environment Variables

Set environment variables (example `.env`):

```bash
4MICA_WALLET_PRIVATE_KEY="0x..."
4MICA_NETWORK="base"                   # shorthand or CAIP-2 id
# or override URL directly:
# 4MICA_RPC_URL="https://base.sepolia.api.4mica.xyz/"
4MICA_ETHEREUM_HTTP_RPC_URL="http://localhost:8545"
4MICA_CONTRACT_ADDRESS="0x..."
4MICA_FACILITATOR_URL="https://x402.4mica.xyz"
4MICA_BEARER_TOKEN="Bearer <access_token>"
4MICA_AUTH_URL="https://ethereum.sepolia.api.4mica.xyz/"
4MICA_AUTH_REFRESH_MARGIN_SECS="60"
```

If you want to set them inline for a single command, use `env` since most shells do not allow
variable names that start with a digit:

```bash
env 4MICA_WALLET_PRIVATE_KEY="0x..." 4MICA_NETWORK="base" node app.js
```

Then in code:

```ts
import { Client, ConfigBuilder } from '@4mica/sdk';

const cfg = new ConfigBuilder().fromEnv().build();
const client = await Client.connect(cfg);
```

### 3) Using a Custom Signer

If you want to integrate with a custom signer (hardware wallet, remote signer, etc.), provide a
`viem` `Account` implementation. It must expose `address`, `signTypedData`, and `signMessage` for
SIWE auth.

```ts
import { Client, ConfigBuilder } from '@4mica/sdk';
import { privateKeyToAccount } from 'viem/accounts';

const signer = privateKeyToAccount(process.env.PAYER_KEY as `0x${string}`);
const cfg = new ConfigBuilder().signer(signer).build();
const client = await Client.connect(cfg);
```

### SIWE Auth

SIWE auth is on by default; the first authenticated RPC call logs in automatically. Connecting and
fetching public parameters never triggers a login — those routes are public.

```ts
import { Client, ConfigBuilder } from '@4mica/sdk';

const cfg = new ConfigBuilder()
  .walletPrivateKey('0x...')
  .rpcUrl('https://api.4mica.xyz/')
  .build();

const client = await Client.connect(cfg);
await client.login(); // optional: pre-warm the session
```

Use a static token instead (replaces SIWE), or turn credentials off entirely:

```ts
new ConfigBuilder().walletPrivateKey('0x...').bearerToken('Bearer <access_token>').build();
new ConfigBuilder().walletPrivateKey('0x...').disableAuth().build();
```

Env vars: `4MICA_BEARER_TOKEN`, `4MICA_AUTH_URL`, `4MICA_AUTH_REFRESH_MARGIN_SECS`.

## Usage

Every field on the client is an intent-builder sub-client: an entry captures what to do
(`client.deposit.of(...)`), a route pin narrows how (`.selfFunded()`), and a terminal does it
(`.send()`, `.approve()`, `.action()`).

- `client.deposit` — depositing collateral
- `client.withdraw` — requesting, cancelling and finalizing withdrawals
- `client.payment` — signing, issuing and verifying payment guarantees
- `client.settlement` — settling a clearing cycle, from either side
- `client.account` — the signer's own balances and positions
- `client.tokens` — supported-token metadata and ERC-20 approvals
- `X402Flow` — helper for 402-protected HTTP resources

### Quick tour

```ts
import { Client, ConfigBuilder, PaymentGuaranteeRequestClaims } from '@4mica/sdk';

const client = await Client.connect(
  new ConfigBuilder().network('base-sepolia').walletPrivateKey('0x...').build(),
);

// Payer: deposit collateral (native ETH; pass a token address for ERC-20).
await client.deposit.of(null, 1_000_000_000_000_000n).send();

// Payer: sign a payment guarantee request.
const claims = PaymentGuaranteeRequestClaims.new(
  client.signerAddress, // user
  '0xRecipient',        // recipient
  reqId,                // random uint256 nonce
  1000n,                // amount
  Math.floor(Date.now() / 1000),
  null,                 // asset (null = native)
);
const signature = await client.payment.signRequest(claims);

// Recipient: redeem the signed request for a BLS certificate, then verify it.
const cert = await client.payment.issueGuarantee(claims, signature);
const verified = await client.payment.verifyGuarantee(cert);

// After the cycle clears: debtor pays, creditor claims.
await client.settlement.pay(cycleId).send();
await client.settlement.claim(cycleId).send();
```

### X402 flow (HTTP 402)

The X402 helper turns `paymentRequirements` from a `402 Payment Required` response into an
`X-PAYMENT` header (and optional `/settle` call) that the facilitator will accept.

There is **no tab step**: each payment carries a random 32-byte `reqId` minted locally, and core
binds the guarantee to the open settlement cycle at issuance. Nothing is fetched before signing.

#### What the SDK expects from `paymentRequirements`

At minimum you need:

- `scheme` (must be exactly `4mica-credit`) and `network`
- `payTo` (recipient address), `asset`, and `maxAmountRequired` (v1) or `amount` (v2)
- optionally `extra.validation` (`{ validator, subject, deadline?, params? }`) to gate the payment
  on an external validator

#### X402 Version 1

Version 1 returns payment requirements in the JSON response body:

```ts
import { Client, ConfigBuilder, X402Flow } from '@4mica/sdk';

const cfg = new ConfigBuilder().walletPrivateKey('0x...').build();
const client = await Client.connect(cfg);
const flow = X402Flow.fromClient(client);

// 1) GET the protected endpoint and parse the JSON body
const res = await fetch('https://resource-url/resource');
const body = await res.json();

// 2) Select a payment option (raw objects are parsed and validated)
const requirements = body.accepts[0];

// 3) Build the X-PAYMENT header with the SDK
const payment = await flow.signPayment(requirements, client.signerAddress);

// 4) Call the protected resource with the header
await fetch('https://resource-url/resource', {
  headers: { 'X-PAYMENT': payment.header },
});

await client.aclose();
```

#### X402 Version 2

Version 2 uses the `payment-required` header (base64-encoded) instead of a JSON response body:

```ts
import { Client, ConfigBuilder, X402Flow, X402PaymentRequired } from '@4mica/sdk';

const cfg = new ConfigBuilder().walletPrivateKey('0x...').build();
const client = await Client.connect(cfg);
const flow = X402Flow.fromClient(client);

// 1) GET the protected endpoint and extract the payment-required header
const res = await fetch('https://resource-url/resource');
const header = res.headers.get('payment-required');
if (!header) throw new Error('Missing payment-required header');

// 2) Decode and parse the challenge
const decoded = Buffer.from(header, 'base64').toString('utf8');
const paymentRequired = X402PaymentRequired.fromRaw(JSON.parse(decoded));

// 3) Select a payment option
const accepted = paymentRequired.accepts[0];

// 4) Build the PAYMENT-SIGNATURE header with the SDK
const signed = await flow.signPaymentV2(paymentRequired, accepted, client.signerAddress);

// 5) Call the protected resource with the header
await fetch('https://resource-url/resource', {
  headers: { 'PAYMENT-SIGNATURE': signed.header },
});

await client.aclose();
```

#### Settling through a facilitator

`settlePayment` POSTs `{ x402Version, paymentPayload, paymentRequirements }` to the facilitator's
`/settle` — `paymentPayload` is the envelope object (`payment.envelope`), not the base64 header.
Rejections come back as **HTTP 200 with `success: false`**, so check the receipt:

```ts
const settled = await flow.settlePayment(payment, requirements, facilitatorUrl);
if (!settled.settlement.success) {
  console.error('settlement rejected:', settled.settlement.error);
} else {
  console.log('tx:', settled.settlement.txHash, 'cert:', settled.settlement.certificate);
}
```

Notes:

- `signPayment` and `signPaymentV2` always use EIP-712 signing and error unless the scheme is
  exactly `4mica-credit`.
- `client.payment.signRequest` supports `SigningScheme.EIP712` (default) and `SigningScheme.EIP191`.
- `settlePayment` only hits `/settle`; resource servers should still call `/verify` first when
  enforcing access.
- `client.payment.verifyGuarantee` BLS-verifies the certificate against the operator key from
  `/core/public-params` (requires the optional `@noble/curves` dependency).

### API Methods Summary

Settlement is **cycle-based**: core nets each participant's obligations for a clearing cycle into a
single net-debit or net-credit committed to an on-chain Merkle root. Participants settle by fetching
their prepared clearing action (contract address, amount, and Merkle proof) from core, then calling
the `ClearingHouse`. `cycleId` is the on-chain `bytes32` cycle identifier (the text form works too).

#### `client.deposit`

- `of(asset, amount)` — start a deposit (`null` asset = native ETH)
  - `.send()` — deposit with the signer's own transaction
  - `.selfFunded().approve()` — grant the ERC-20 allowance a self-funded deposit pulls

#### `client.withdraw`

- `request(asset, amount).send()` — start the withdrawal (grace period runs from here)
- `cancel(asset).send()` / `finalize(asset).send()`

#### `client.payment`

- `signRequest(claims, scheme?)` — sign a guarantee request as the payer
- `issueGuarantee(claims, signature)` — redeem a payer's signature for a BLS certificate (recipient)
- `verifyGuarantee(cert)` — BLS-verify + decode + domain-check a certificate
- `listReceived()` — payments guaranteed to the signer as a recipient
- `guaranteeDomain` / `guaranteeDomains` — the domain separator(s) certs are issued under

#### `client.settlement`

- `pay(cycleId)` — the debtor side: `.action()`, `.selfFunded().approve()`, `.send()`
- `claim(cycleId)` — the creditor side: `.creditor(addr)`, `.action()`, `.send()`
  (claims take no signature: the payout goes to the address the committed leaf names)

#### `client.account`

- `assets()` — the signer's position in every asset
- `principalBalance(asset?)` / `withdrawableBalance(asset?)` / `stablecoinPosition(token)`
- `assetBalance(asset?)` — the balance guarantees are accounted against (may lag the chain)

#### `client.tokens`

- `supported()` — depositable assets and their metadata
- `approve(token, amount)` — ERC-20 allowance for the Core4Mica contract

### Validated guarantees

A payer can agree that a guarantee only becomes payable once an external validator approves it, by
attaching a `ValidationRequirement` to the claims (or letting `X402Flow` read it from
`extra.validation`):

```ts
import { PaymentGuaranteeRequestClaims, ValidationRequirement } from '@4mica/sdk';

const claims = PaymentGuaranteeRequestClaims.new(
  user, recipient, reqId, amount, timestamp, asset,
).withValidation(
  new ValidationRequirement({
    validator: 'validator-id',        // must be on core's allowlist
    subject: '0x…32-byte hash…',      // what the validator must approve
    deadline: 1700000600,             // optional; core tightens it to the cycle cutoff
    params: '0x…',                    // optional validator-specific policy bytes
  }),
);
const signature = await client.payment.signRequest(claims);
```

## Error Handling

All SDK errors extend `FourMicaError`, in per-area families mirroring the Rust SDK:

```ts
import {
  ConfigError,                 // invalid ConfigBuilder input
  RpcError,                    // 4Mica core service error (has .status and .body)
  ClientError,                 //   ├ ClientInitializationError, ChainRpcUnavailableError, …
  PaymentError,                //   ├ SigningError, AddressMismatchError,
                               //   │ CertificateMismatchError, GuaranteeDomainMismatchError, …
  ContractError,               //   ├ typed on-chain reverts: AmountZeroError,
                               //   │ InsufficientAvailableError, …, UnknownRevertError
  Erc20AllowanceRequiredError, // a self-funded token pull needs an allowance first
  X402Error,                   // x402 flow error (bad scheme, settlement transport)
  AuthError,                   // base class for all auth errors
} from '@4mica/sdk';

try {
  await client.settlement.pay(cycleId).send();
} catch (err) {
  if (err instanceof Erc20AllowanceRequiredError) {
    await client.settlement.pay(cycleId).selfFunded().approve();
  }
}
```

## License

MIT
