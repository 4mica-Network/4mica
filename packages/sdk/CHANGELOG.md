# @4mica/sdk

## 2.0.0-alpha.0

### Major Changes

- 34eada6: TypeScript SDK 2.0: settlement cycles and the tab-free protocol.

  - `Client.new(cfg)` → `await Client.connect(cfg)`; the client is now six
    capability sub-clients (`deposit`, `withdraw`, `payment`, `settlement`,
    `account`, `tokens`) with intent-builder terminals, replacing
    `client.user` / `client.recipient`.
  - The EIP-712 request domain now includes `verifyingContract` and the claims
    collapse to a single V1 class with an optional nested
    `ValidationRequirement` — the flat V2 validation-policy claims, the local
    hash derivation, and `PaymentGuaranteeRequestClaimsV2` are gone. Digests are
    pinned by the golden vectors shared with the Rust, Python, and Solidity
    suites.
  - x402 is tab-free: `requestTab` / `TabResponse` / `extra.tabEndpoint` are
    removed, each payment mints a random 32-byte `reqId` locally, the scheme is
    strictly `4mica-credit`, `/settle` takes the envelope object (no
    `paymentHeader`), and settlement results are typed `SettlementReceipt`s
    (failures are HTTP 200 + `success: false`).
  - `PaywallConfig` loses its required `tabEndpoint`; validation gating is
    advertised via `extra.validation`.
  - `verifyGuarantee` now BLS-verifies certificates against the operator key.
  - Removed dead surface: admin API-key management, `markDefaulted`, and the
    public-RPC fallback. Transport errors are typed `RpcError`s; GETs retry on
    429/5xx, POSTs never do; connecting stays unauthenticated until the public
    parameters resolve.

### Minor Changes

- 8998b02: Contract ABI refresh and typed reverts (Cycle 3 of the TypeScript SDK 2.0
  series).

  - `core4micaAbi` / `clearingHouseAbi` are now generated from the monorepo's
    `contracts/abi/*.json` (the same forge artifacts the Python SDK vendors) by
    `scripts/refresh-abis.sh`, and a test pins them to that source. The tab-era
    entries (`remunerate`, `payTabInERC20Token`, …) are gone; every current
    function and revert error is present, so reverts decode by name.
  - New typed reverts: `AuthorizationExpiredError`,
    `AuthorizationNotYetValidError`, `AuthorizationAlreadyUsedError`,
    `EscrowScaledUnderflowError`, and the ClearingHouse family
    (`InvalidProofError`, `CycleNotFoundError`, `InvalidCycleStatusError`,
    `AlreadyPaidError`, `AlreadyClaimedError`, `PaymentWindowElapsedError`,
    `PaymentFinalityPendingError`, `ExactPaymentRequiredError`,
    `ClaimExceedsFundedLiquidityError`, `AuthorizationCycleMismatchError`).
  - Removed the dead admin API key plumbing (`RpcProxy.withAdminApiKey`,
    `ADMIN_API_KEY_HEADER`, `ADMIN_SCOPE_SUSPEND_USERS`): core authorizes
    `updateUserSuspension` by the admin role on the SIWE session, never by an
    API key.
  - `RpcProxy.health()` returns core's report for both 200 and 503 — core
    answers 503 with the same body when a dependency is down — instead of
    retrying the 503 and throwing.
  - `Permit2AllowanceRequiredError` gains `reason`, the facilitator's own
    wording; the error re-thrown when an approval turns out to be unsponsorable
    no longer carries the SDK prefix twice.
  - Removed `resolvePublicRpcUrl` and `NetworkInfo.publicRpcUrl`: the
    public-RPC fallback went in Cycle 1 and nothing read them since.
  - `ContractGateway.deposit()` is now the raw contract call. The ERC-20
    allowance precheck that raises `Erc20AllowanceRequiredError` lives in the
    deposit client, so the self-funded fallback reads the allowance once instead
    of twice; callers of the gateway directly no longer get it.

- 6b0974a: Facilitator-sponsored gasless routes (Cycle 2 of the TypeScript SDK 2.0
  series).

  - Route pins across deposits, withdrawals, and settlement: `gasless()`,
    `eip3009()`, `permit2()` (+ `sponsorApproval()`), `selfFunded()`, with
    offline `sign()`, portable `authorization(...)`, and no-gas `verify()`
    terminals; unpinned `send()` auto-routes EIP-3009 → sponsored Permit2 →
    self-funded.
  - Authorization types and digests: EIP-3009 `ReceiveWithAuthorization`,
    Permit2 `PermitTransferFrom`, EIP-2612 `Permit`, and Core4Mica's
    `RequestWithdrawal` / `CancelWithdrawal`, built from raw domain separators
    (token separators are relayed by core — signing needs no Ethereum RPC) and
    pinned against the deployed USDC and Permit2 contracts.
  - Settlement debits pin the authorization nonce to the cycle id, as
    `payNetDebitWithAuthorization` / `payNetDebitWithPermit2` require; claims
    stay signature-free.
  - The facilitator transport keeps the three-way outcome distinction
    (transport / rejected / outcome-unknown), carries `errorCode` verbatim,
    confirms every echoed field, and never falls back to self-funding on an
    unknown outcome.

## 1.3.1

### Patch Changes

- Decouple the x402 protocol version from the 4Mica-core guarantee version in
  `X402Flow`. The tab is now opened at the guarantee version that matches the
  claims being built (`hasValidationPolicy ? 2 : 1`) and sent to the tab endpoint
  under a `guaranteeVersion` field, instead of passing the x402 protocol version.
  This fixes settlements failing with "tab only accepts guarantee version 2, got
  1" when a resource advertises x402 v2 without a validation policy (v1 claims).
