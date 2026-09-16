import type {
  PaymentNetwork,
  WalletRole,
  WalletStatus,
} from "@stores/wallet/type";

export const NETWORKS = {
  BASE: {
    label: "Base",
    caip2: "eip155:8453",
    chainId: 8453,
    explorer: "https://basescan.org",
    rpcUrl: "https://mainnet.base.org",
    currency: { name: "Ether", symbol: "ETH", decimals: 18 },
    isTestnet: false,
  },
  BASE_SEPOLIA: {
    label: "Base Sepolia",
    caip2: "eip155:84532",
    chainId: 84532,
    explorer: "https://sepolia.basescan.org",
    rpcUrl: "https://sepolia.base.org",
    currency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    isTestnet: true,
  },
  ETHEREUM_SEPOLIA: {
    label: "Ethereum Sepolia",
    caip2: "eip155:11155111",
    chainId: 11155111,
    explorer: "https://sepolia.etherscan.io",
    rpcUrl: "https://rpc.sepolia.org",
    currency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
    isTestnet: true,
  },
} as const satisfies Record<
  PaymentNetwork,
  {
    label: string;
    caip2: string;
    chainId: number;
    explorer: string;
    rpcUrl: string;
    currency: { name: string; symbol: string; decimals: number };
    isTestnet: boolean;
  }
>;

export const NETWORK_OPTIONS = (Object.keys(NETWORKS) as PaymentNetwork[]).map(
  (value) => ({ value, title: NETWORKS[value].label }),
);

export const networkForChainId = (
  chainId: number | null,
): PaymentNetwork | null => {
  if (chainId === null) {
    return null;
  }
  const match = (Object.keys(NETWORKS) as PaymentNetwork[]).find(
    (network) => NETWORKS[network].chainId === chainId,
  );
  return match ?? null;
};

export const chainDefinition = (network: PaymentNetwork) => {
  const meta = NETWORKS[network];
  return {
    chainId: meta.chainId,
    chainName: meta.label,
    rpcUrls: [meta.rpcUrl],
    blockExplorerUrls: [meta.explorer],
    nativeCurrency: { ...meta.currency },
  };
};

export const ROLE_LABEL_KEYS = {
  PAYER: "wallet.role.payer",
  RECIPIENT: "wallet.role.recipient",
  BOTH: "wallet.role.both",
} as const satisfies Record<WalletRole, string>;

export const STATUS_LABEL_KEYS = {
  ACTIVE: "wallet.status.active",
  PAUSED: "wallet.status.paused",
  RETIRED: "wallet.status.retired",
} as const satisfies Record<WalletStatus, string>;

export const STATUS_TAG_VARIANT = {
  ACTIVE: "success",
  PAUSED: "warning",
  RETIRED: "neutral",
} as const satisfies Record<WalletStatus, "success" | "warning" | "neutral">;

export const explorerAddressUrl = (
  network: PaymentNetwork,
  address: string,
): string => `${NETWORKS[network].explorer}/address/${address}`;

export const shortenAddress = (address: string): string =>
  address.length <= 12
    ? address
    : `${address.slice(0, 6)}…${address.slice(-4)}`;
