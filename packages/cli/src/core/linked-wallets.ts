import { failure, usageError } from "../errors.js";
import { api, type Platform } from "./platform.js";
import type { Settings } from "./settings.js";

export interface LinkedWallet {
  id: string;
  label: string;
  address: string;
  network: string;
  role: string;
  status: string;
  isDefault: boolean;
  verifiedAt: string;
  createdAt: string;
}

export function platformNetwork(settings: Settings): {
  name: string;
  chainId: number;
} {
  if (!settings.network || !settings.info) {
    throw usageError("a wallet is linked on a hosted network, not a core URL", {
      code: "NETWORK_REQUIRED",
      suggestions: ["name one with --network; `4mica networks` lists them"],
    });
  }
  return {
    name: settings.network.value.toUpperCase().replaceAll("-", "_"),
    chainId: settings.info.chainId,
  };
}

export async function listLinkedWallets(
  platform: Platform,
  token: string,
  filter: { address?: string; network?: string } = {},
): Promise<LinkedWallet[]> {
  const query = new URLSearchParams({ limit: "100" });
  if (filter.address) query.set("q", filter.address);
  if (filter.network) query.set("network", filter.network);
  const { items } = await api<{ items: LinkedWallet[] }>(
    platform,
    `/me/wallets?${query}`,
    { token },
  );
  return items;
}

export function assertLinkChallenge(
  message: string,
  expected: { address: string; chainId: number; nonce: string },
): void {
  const lines = message.split("\n");
  const sound =
    lines[0]?.endsWith(" wants you to sign in with your Ethereum account:") &&
    lines[1]?.toLowerCase() === expected.address.toLowerCase() &&
    lines.includes(`Chain ID: ${expected.chainId}`) &&
    lines.includes(`Nonce: ${expected.nonce}`) &&
    lines.includes("- urn:4mica:purpose:wallet-link");
  if (!sound) {
    throw failure(
      "the platform asked the wallet to sign something that is not a wallet-link request; nothing was signed",
      { code: "UNEXPECTED_CHALLENGE" },
    );
  }
}
