# Changelog

## 1.0.0 - Unreleased

### Added
- `UserClient.list_tabs(settlement_statuses=None)` lists tabs for the authenticated user, with optional settlement-status filter.
- `Client.logout()` invalidates the SIWE auth session and clears cached tokens.
- `TxReceiptWaitOptions(timeout_secs, poll_latency_secs)` model; all transaction-sending methods (`approve_erc20`, `deposit`, `pay_tab`, `request_withdrawal`, `cancel_withdrawal`, `finalize_withdrawal`, `remunerate`) now accept an optional `wait_options` argument.
- `UserClient.pay_tab` now auto-resolves `req_id`, `amount`, and `recipient_address` from the latest guarantee when those arguments are omitted.
- `UserClient.get_user` accepts an optional `block_number` argument for historical queries.
- `SupportedTokenInfo` and `SupportedTokensResponse` models for token discovery.
- `RpcProxy.get_supported_tokens()` returns a `SupportedTokensResponse` (includes `chain_id` and `tokens` list).

### Changed
- Default `pytest` selection now excludes integration tests (`-m "not integration"`).
- X402 V2 flow no longer requires `paymentRequirements.extra.validationChainId`.
  The SDK derives `validation_chain_id` from the CAIP-2 network (`eip155:<chainId>`).
- When `extra.validationChainId` is provided, it is validated against the derived network chain id.

## 0.3.0

### Breaking
- `PaymentGuaranteeRequestClaims` now requires `req_id`; signing payloads include `req_id` for EIP-712/EIP-191.
- X402 payment envelopes include `req_id`; tab responses should return `nextReqId`/`reqId` to populate it.

### Changed
- `RpcProxy.list_recipient_tabs` now uses `settlement_status` query params.
- `RpcError` exposes `status_code` for HTTP failures.
- `ContractGateway` uses explicit overload signatures for withdrawal calls.
