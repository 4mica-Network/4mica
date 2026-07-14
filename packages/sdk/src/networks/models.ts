/** Metadata for a hosted 4Mica network deployment. */
export interface NetworkInfo {
  /** CAIP-2 network identifier (e.g. `eip155:84532`). */
  caip2: string;
  /** Hosted 4Mica core API URL for this network. */
  rpcUrl: string;
  /** Reliable public Ethereum RPC for on-chain calls (fallback when server doesn't provide one). */
  publicRpcUrl: string;
}
