import type { PaymentNetwork } from "@/schema/params";

export interface NetworkInfo {
  /** CAIP-2 chain id, as the x402 `network` field wants it. */
  caip2: string;
  /** The name `ConfigBuilder().network()` accepts in @4mica/sdk. */
  sdkName: string;
  /** Human label for the UI. */
  label: string;
}

/**
 * The `satisfies` clause is the point of this file: adding a member to the
 * `PaymentNetwork` enum in packages/db becomes a type error here rather than a
 * snippet that silently renders `undefined` as a chain id.
 *
 * Values mirror `NETWORKS` in packages/sdk/src/networks. They are duplicated
 * rather than imported because @4mica/sdk pulls in viem, and the playground has
 * no other reason to bundle a chain client.
 */
export const NETWORKS = {
  BASE: {
    caip2: "eip155:8453",
    sdkName: "base",
    label: "Base",
  },
  BASE_SEPOLIA: {
    caip2: "eip155:84532",
    sdkName: "base-sepolia",
    label: "Base Sepolia",
  },
  ETHEREUM_SEPOLIA: {
    caip2: "eip155:11155111",
    sdkName: "ethereum-sepolia",
    label: "Ethereum Sepolia",
  },
} as const satisfies Record<PaymentNetwork, NetworkInfo>;

export const networkInfo = (network: PaymentNetwork): NetworkInfo =>
  NETWORKS[network];
