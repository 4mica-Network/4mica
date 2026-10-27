# @4mica/cli

## 0.3.0

### Minor Changes

- bcc328f: The seller and buyer templates come in Express only, and the sellers charge
  through `@4mica/x402`'s Express middleware. The Hono and Next templates are
  removed, so `--framework` accepts only `express`. Templates speak x402 v2: the
  requirements arrive in `PAYMENT-REQUIRED` and the payment goes in
  `PAYMENT-SIGNATURE`.
- 4fde3fd: Add the `@4mica/cli` (`4mica`) command-line tool: scaffold a trading agent,
  paywalled seller API, or buyer client (Express / Hono / Next) from beautiful
  interactive prompts, install and run it, and launch the local dashboard with
  `4mica dashboard`.

## 0.3.0-alpha.0

### Minor Changes

- 4fde3fd: Add the `@4mica/cli` (`4mica`) command-line tool: scaffold a trading agent,
  paywalled seller API, or buyer client (Express / Hono / Next) from beautiful
  interactive prompts, install and run it, and launch the local dashboard with
  `4mica dashboard`.

## 0.2.0

### Minor Changes

- 4fde3fd: Add the `@4mica/cli` (`4mica`) command-line tool: scaffold a trading agent,
  paywalled seller API, or buyer client (Express / Hono / Next) from beautiful
  interactive prompts, install and run it, and launch the local dashboard with
  `4mica dashboard`.
