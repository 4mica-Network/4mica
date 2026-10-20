import type { Account } from "viem/accounts";

/** Validated configuration used to construct a {@link Client}. Produced by {@link ConfigBuilder.build}. */
export interface Config {
  /** URL of the 4Mica core RPC service. */
  rpcUrl: string;
  /** viem `Account` used to sign payments and authenticate requests. */
  signer: Account;
  /** Override for the Ethereum HTTP RPC URL (defaults to the value returned by the core service). */
  ethereumHttpRpcUrl?: string;
  /** Override for the Core4Mica contract address (defaults to the value returned by the core service). */
  contractAddress?: string;
  /** Static bearer token for authenticated RPC calls. Mutually exclusive with SIWE auth. */
  bearerToken?: string;
  /** URL of the SIWE authentication endpoint. Set iff SIWE auth is enabled; defaults to `rpcUrl`. */
  authUrl?: string;
  /** Seconds before token expiry at which the auth session proactively refreshes. Defaults to 60. */
  authRefreshMarginSecs?: number;
  /** Facilitator that sponsors gas. Without one, every operation is self-funded. */
  facilitatorUrl?: string;
}
