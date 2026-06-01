import type { Chain } from "viem/chains";
import { baseSepolia, sepolia } from "viem/chains";

export type RegistrationChainKey = "ethereumSepolia" | "baseSepolia";
export type RegistrationAssetKey = "native" | "usdc" | "usdt";

export type RegistrationAsset = {
  key: RegistrationAssetKey;
  label: string;
  symbol: string;
  decimals: number;
  type: "native" | "erc20";
  address?: `0x${string}`;
};

export type RegistrationChain = {
  key: RegistrationChainKey;
  id: number;
  label: string;
  shortLabel: string;
  viemChain: Chain;
  explorerUrl: string;
  coreContractAddress: `0x${string}` | "";
  assets: Record<RegistrationAssetKey, RegistrationAsset>;
  addChainParams: {
    chainId: `0x${string}`;
    chainName: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    rpcUrls: string[];
    blockExplorerUrls: string[];
  };
};

const chainIdToHex = (chainId: number): `0x${string}` =>
  `0x${chainId.toString(16)}`;

export const REGISTRATION_CONFIG: {
  chains: Record<RegistrationChainKey, RegistrationChain>;
} = {
  chains: {
    ethereumSepolia: {
      key: "ethereumSepolia",
      id: 11155111,
      label: "Ethereum Sepolia",
      shortLabel: "Eth Sepolia",
      viemChain: sepolia,
      explorerUrl: "https://sepolia.etherscan.io",
      coreContractAddress:
        (process.env.NEXT_PUBLIC_4MICA_CORE_CONTRACT_ETH_SEPOLIA as
          | `0x${string}`
          | undefined) ?? "",
      assets: {
        native: {
          key: "native",
          label: "Sepolia ETH",
          symbol: "ETH",
          decimals: 18,
          type: "native",
        },
        usdc: {
          key: "usdc",
          label: "USDC",
          symbol: "USDC",
          decimals: 6,
          type: "erc20",
          address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
        },
        usdt: {
          key: "usdt",
          label: "USDT",
          symbol: "USDT",
          decimals: 6,
          type: "erc20",
          address: "0xEDb85a5c17135B82966B686cCC9C28F42078f3E0",
        },
      },
      addChainParams: {
        chainId: chainIdToHex(11155111),
        chainName: "Ethereum Sepolia",
        nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
        rpcUrls: ["https://rpc.sepolia.org"],
        blockExplorerUrls: ["https://sepolia.etherscan.io"],
      },
    },
    baseSepolia: {
      key: "baseSepolia",
      id: 84532,
      label: "Base Sepolia",
      shortLabel: "Base Sepolia",
      viemChain: baseSepolia,
      explorerUrl: "https://sepolia.basescan.org",
      coreContractAddress:
        (process.env.NEXT_PUBLIC_4MICA_CORE_CONTRACT_BASE_SEPOLIA as
          | `0x${string}`
          | undefined) ?? "",
      assets: {
        native: {
          key: "native",
          label: "Base Sepolia ETH",
          symbol: "ETH",
          decimals: 18,
          type: "native",
        },
        usdc: {
          key: "usdc",
          label: "USDC",
          symbol: "USDC",
          decimals: 6,
          type: "erc20",
          address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        },
        usdt: {
          key: "usdt",
          label: "USDT",
          symbol: "USDT",
          decimals: 6,
          type: "erc20",
          address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        },
      },
      addChainParams: {
        chainId: chainIdToHex(84532),
        chainName: "Base Sepolia",
        nativeCurrency: {
          name: "Base Sepolia ETH",
          symbol: "ETH",
          decimals: 18,
        },
        rpcUrls: ["https://sepolia.base.org"],
        blockExplorerUrls: ["https://sepolia.basescan.org"],
      },
    },
  },
};
