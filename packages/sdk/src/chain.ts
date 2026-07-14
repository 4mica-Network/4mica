import type { Chain } from "viem";
import {
  base,
  baseSepolia,
  mainnet,
  polygon,
  polygonAmoy,
  sepolia,
} from "viem/chains";

const CHAINS: Record<number, Chain> = {
  1: mainnet,
  11155111: sepolia,
  8453: base,
  84532: baseSepolia,
  137: polygon,
  80002: polygonAmoy,
};

export function getChain(chainId: number, rpcUrl: string): Chain {
  const chain = CHAINS[chainId];
  if (chain) return chain;

  return {
    id: chainId,
    name: `local-${chainId}`,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: {
      default: { http: [rpcUrl] },
      public: { http: [rpcUrl] },
    },
  };
}
