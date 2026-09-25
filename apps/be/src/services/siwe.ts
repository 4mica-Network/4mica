import type { PaymentNetwork } from "@4mica/db";
import { getAddress } from "viem";

export const NETWORK_CHAIN_IDS = {
  BASE: 8453,
  BASE_SEPOLIA: 84532,
  ETHEREUM_SEPOLIA: 11155111,
} as const satisfies Record<PaymentNetwork, number>;

export const chainIdFor = (network: PaymentNetwork): number =>
  NETWORK_CHAIN_IDS[network];

export const WALLET_LINK_STATEMENT =
  "Link this wallet to your 4Mica account. This does not authorize any transfer of funds.";

export const WALLET_NONCE_TTL_MS = 5 * 60 * 1000;

export const WALLET_NONCE_MAX_ATTEMPTS = 5;

export interface WalletLinkMessageInput {
  domain: string;
  uri: string;
  address: string;
  chainId: number;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
  userId: string;
}

export const buildWalletLinkMessage = (input: WalletLinkMessageInput): string =>
  [
    `${input.domain} wants you to sign in with your Ethereum account:`,
    getAddress(input.address),
    "",
    WALLET_LINK_STATEMENT,
    "",
    `URI: ${input.uri}`,
    "Version: 1",
    `Chain ID: ${input.chainId}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt.toISOString()}`,
    `Expiration Time: ${input.expiresAt.toISOString()}`,
    "Resources:",
    "- urn:4mica:purpose:wallet-link",
    `- urn:4mica:user:${input.userId}`,
  ].join("\n");
