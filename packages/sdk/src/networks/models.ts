/** Metadata for a hosted 4Mica network deployment. */
export interface NetworkInfo {
  /** CAIP-2 network identifier (e.g. `eip155:84532`). */
  caip2: string;
  chainId: number;
  label: string;
  /** Hosted 4Mica core API URL for this network. */
  rpcUrl: string;
  /** Unset where no facilitator is hosted; everything is then self-funded. */
  facilitatorUrl?: string;
  explorerUrl: string;
  nativeSymbol: string;
  testnet: boolean;
}
