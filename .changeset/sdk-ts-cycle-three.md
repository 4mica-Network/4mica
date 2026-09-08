---
"@4mica/sdk": minor
---

Contract ABI refresh and typed reverts (Cycle 3 of the TypeScript SDK 2.0
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
