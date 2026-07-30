# @4mica/sdk

## 1.3.1

### Patch Changes

- Decouple the x402 protocol version from the 4Mica-core guarantee version in
  `X402Flow`. The tab is now opened at the guarantee version that matches the
  claims being built (`hasValidationPolicy ? 2 : 1`) and sent to the tab endpoint
  under a `guaranteeVersion` field, instead of passing the x402 protocol version.
  This fixes settlements failing with "tab only accepts guarantee version 2, got
  1" when a resource advertises x402 v2 without a validation policy (v1 claims).
