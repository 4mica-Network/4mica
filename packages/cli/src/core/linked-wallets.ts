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

const PAGE_SIZE = 100;
const MAX_LISTED = 10_000;

export async function listLinkedWallets(
  platform: Platform,
  token: string,
  filter: { address?: string; network?: string } = {},
): Promise<LinkedWallet[]> {
  const wallets: LinkedWallet[] = [];
  for (let page = 1; ; page += 1) {
    const query = new URLSearchParams({
      limit: String(PAGE_SIZE),
      page: String(page),
      sort: "createdAt",
    });
    if (filter.address) query.set("q", filter.address);
    if (filter.network) query.set("network", filter.network);
    const { items, total } = await api<{
      items: LinkedWallet[];
      total: number;
    }>(platform, `/me/wallets?${query}`, { token });
    wallets.push(...items);
    if (items.length === 0 || wallets.length >= total) return wallets;
    if (wallets.length >= MAX_LISTED) {
      throw failure(
        `this account has ${total} linked wallets, more than the ${MAX_LISTED} the cli can list`,
        {
          code: "TOO_MANY_WALLETS",
          suggestions: ["narrow the list with --network"],
        },
      );
    }
  }
}

export const WALLET_LINK_STATEMENT =
  "Link this wallet to your 4Mica account. This does not authorize any transfer of funds.";

const CLOCK_SKEW_MS = 5 * 60 * 1000;
const HEADER = /^(\S+) wants you to sign in with your Ethereum account:$/;
const LOOPBACK = /^(localhost|127(\.\d{1,3}){3}|\[::1\])(:\d+)?$/;

const isOurHost = (host: string) =>
  LOOPBACK.test(host) || /^([a-z0-9-]+\.)*4mica\.io(:\d+)?$/i.test(host);

interface LinkChallenge {
  domain: string;
  address: string;
  statement: string;
  fields: Map<string, string>;
  resources: string[];
}

function parseChallenge(message: string): LinkChallenge | undefined {
  const lines = message.split("\n");
  const domain = HEADER.exec(lines[0] ?? "")?.[1];
  if (!domain || lines[2] !== "" || lines[4] !== "") return undefined;
  const fields = new Map<string, string>();
  const resources: string[] = [];
  let inResources = false;
  for (const line of lines.slice(5)) {
    if (inResources) {
      if (!line.startsWith("- ")) return undefined;
      resources.push(line.slice(2));
    } else if (line === "Resources:") {
      inResources = true;
    } else {
      const at = line.indexOf(": ");
      if (at < 1) return undefined;
      const key = line.slice(0, at);
      if (fields.has(key)) return undefined;
      fields.set(key, line.slice(at + 2));
    }
  }
  return {
    domain,
    address: lines[1] ?? "",
    statement: lines[3] ?? "",
    fields,
    resources,
  };
}

export function assertLinkChallenge(
  message: string,
  expected: {
    address: string;
    chainId: number;
    nonce: string;
    userId: string;
    now?: number;
  },
): void {
  const now = expected.now ?? Date.now();
  const challenge = parseChallenge(message);
  const uri = challenge?.fields.get("URI");
  const issuedAt = Date.parse(challenge?.fields.get("Issued At") ?? "");
  const expiresAt = Date.parse(challenge?.fields.get("Expiration Time") ?? "");
  const sound =
    challenge !== undefined &&
    isOurHost(challenge.domain) &&
    uri !== undefined &&
    URL.canParse(uri) &&
    new URL(uri).host === challenge.domain &&
    challenge.address.toLowerCase() === expected.address.toLowerCase() &&
    challenge.statement === WALLET_LINK_STATEMENT &&
    challenge.fields.get("Version") === "1" &&
    challenge.fields.get("Chain ID") === String(expected.chainId) &&
    challenge.fields.get("Nonce") === expected.nonce &&
    issuedAt <= now + CLOCK_SKEW_MS &&
    expiresAt > now &&
    challenge.resources.length === 2 &&
    challenge.resources.includes("urn:4mica:purpose:wallet-link") &&
    challenge.resources.includes(`urn:4mica:user:${expected.userId}`);
  if (!sound) {
    throw failure(
      "the platform asked the wallet to sign something that is not a wallet-link request for this account; nothing was signed",
      { code: "UNEXPECTED_CHALLENGE" },
    );
  }
}
