/**
 * Server-side entrypoint (`@4mica/sdk/server`).
 *
 * Runtime-neutral, edge-safe building blocks for gating a route behind a 4Mica
 * x402 payment. Framework adapters (`@4mica/sdk-next`, `-express`, `-hono`, …)
 * are thin glue over {@link createPaywall}.
 */

export type {
  PaymentRequirementsExtra,
  PaymentRequirementsV2,
  X402PaymentRequired,
  X402ResourceInfo,
} from "../x402/models";
export {
  base64ToBytes,
  base64ToUtf8,
  bytesToBase64,
  utf8ToBase64,
} from "./base64";
export type { X402PaymentEnvelope } from "./envelope";
export { parsePaymentHeader } from "./envelope";
export type {
  GuaranteeVerifier,
  Paywall,
  PaywallConfig,
  PaywallDecision,
  PaywallGuarantee,
  PaywallInput,
  PaywallVerifier,
} from "./paywall";
export { createPaywall } from "./paywall";
