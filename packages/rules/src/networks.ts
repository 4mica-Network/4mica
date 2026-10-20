export type PaymentNetwork = "BASE" | "BASE_SEPOLIA" | "ETHEREUM_SEPOLIA";

export interface NativeCurrency {
  name: string;
  symbol: string;
  decimals: number;
}

export interface PaymentNetworkInfo {
  label: string;
  caip2: string;
  chainId: number;
  sdkName: string;
  explorer: string;
  rpcUrl: string;
  currency: NativeCurrency;
  isTestnet: boolean;
}

export const PAYMENT_NETWORKS = {
  BASE: {
    label: "Base",
    caip2: "eip155:8453",
    chainId: 8453,
    sdkName: "base",
    explorer: "https://basescan.org",
    rpcUrl: "https://mainnet.base.org",
    currency: { name: "Ether", symbol: "ETH", decimals: 18 },
    isTestnet: false,
  },
  BASE_SEPOLIA: {
    label: "Base Sepolia",
    caip2: "eip155:84532",
    chainId: 84532,
    sdkName: "base-sepolia",
    explorer: "https://sepolia.basescan.org",
    rpcUrl: "https://sepolia.base.org",
    currency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    isTestnet: true,
  },
  ETHEREUM_SEPOLIA: {
    label: "Ethereum Sepolia",
    caip2: "eip155:11155111",
    chainId: 11155111,
    sdkName: "ethereum-sepolia",
    explorer: "https://sepolia.etherscan.io",
    rpcUrl: "https://rpc.sepolia.org",
    currency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    isTestnet: true,
  },
} as const satisfies Record<PaymentNetwork, PaymentNetworkInfo>;

export const PAYMENT_NETWORK_IDS = Object.keys(
  PAYMENT_NETWORKS,
) as PaymentNetwork[];

export const networkForChainId = (
  chainId: number | null,
): PaymentNetwork | null =>
  chainId === null
    ? null
    : (PAYMENT_NETWORK_IDS.find(
        (network) => PAYMENT_NETWORKS[network].chainId === chainId,
      ) ?? null);

export const explorerAddressUrl = (
  network: PaymentNetwork,
  address: string,
): string => `${PAYMENT_NETWORKS[network].explorer}/address/${address}`;

export const shortenAddress = (address: string): string =>
  address.length <= 12
    ? address
    : `${address.slice(0, 6)}…${address.slice(-4)}`;
