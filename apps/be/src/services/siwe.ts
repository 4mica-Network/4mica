import type { PaymentNetwork } from "@4mica/db";
import { getAddress } from "viem";

/**
 * Chain ids for the networks 4Mica settles on.
 *
 * Values mirror `NETWORKS` in packages/sdk/src/networks. They are duplicated
 * rather than imported because @4mica/sdk pulls in a full viem chain client and
 * apps/be needs only the integer — the same trade-off, and the same reasoning,
 * as apps/playground/src/lib/snippets/networks.ts.
 *
 * `satisfies` makes a new PaymentNetwork member a compile error here rather
 * than an undefined chain id inside a message someone is about to sign.
 */
export const NETWORK_CHAIN_IDS = {
  BASE: 8453,
  BASE_SEPOLIA: 84532,
  ETHEREUM_SEPOLIA: 11155111,
} as const satisfies Record<PaymentNetwork, number>;

export const chainIdFor = (network: PaymentNetwork): number =>
  NETWORK_CHAIN_IDS[network];

/**
 * Shown verbatim in the wallet's signing popup, so it says what the signature
 * does and — just as importantly — what it does not do. Never client-supplied.
 */
export const WALLET_LINK_STATEMENT =
  "Link this wallet to your 4Mica account. This does not authorize any transfer of funds.";

/** How long a challenge stays signable. Short, unlike an email link. */
export const WALLET_NONCE_TTL_MS = 5 * 60 * 1000;

/** A challenge is abandoned, not brute-forced — cap retries anyway. */
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

/**
 * Renders the EIP-4361 message a user signs to prove control of an address.
 *
 * Deliberately NOT `buildSiweMessage` from packages/sdk/src/auth: that builds
 * the message for Core's `/auth/nonce` + `/auth/verify` *login* protocol, which
 * exchanges a signature for access tokens, and it has no `resources` parameter.
 * The `Resources:` block below is what keeps a wallet-link signature from being
 * structurally valid as a sign-in message — we cannot audit Core's verifier
 * from this repo, so we do not rely on it rejecting a foreign nonce.
 *
 * The address line is EIP-55 checksummed because EIP-4361 requires it and
 * wallets display it that way; storage stays lowercase.
 */
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
