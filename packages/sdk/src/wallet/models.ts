export interface CdpAccountConfig {
  /** CDP API key ID from the Coinbase Developer Platform dashboard. */
  apiKeyId: string;
  /** CDP API key secret from the Coinbase Developer Platform dashboard. */
  apiKeySecret: string;
  /** CDP wallet secret — required for account creation/signing operations. */
  walletSecret: string;
  /** Idempotency name — getOrCreateAccount always returns the same wallet for a given name. */
  name: string;
}
