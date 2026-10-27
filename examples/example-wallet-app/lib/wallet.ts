import { Client, ConfigBuilder, NETWORKS } from "@4mica/sdk";
import { FourMicaEvmScheme } from "@4mica/x402/client";
import { decodePaymentRequiredHeader } from "@x402/core/http";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { formatEther, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export interface Purchase {
  at: string;
  url: string;
  price: string;
  status: number;
  body: unknown;
}

const cache = globalThis as {
  wallet?: Promise<Client>;
  fetchWithPayment?: Promise<typeof fetch>;
  purchases?: Purchase[];
};

cache.purchases ??= [];

export const purchases = cache.purchases;

/** The SDK client, for the wallet's balance and deposits. */
export const getWallet = (): Promise<Client> => {
  cache.wallet ??= Client.connect(new ConfigBuilder().fromEnv().build()).catch(
    (error) => {
      cache.wallet = undefined;
      throw error;
    },
  );
  return cache.wallet;
};

const connectFetch = async (): Promise<typeof fetch> => {
  const privateKey = process.env["4MICA_WALLET_PRIVATE_KEY"];
  if (!privateKey?.startsWith("0x")) {
    throw new Error("4MICA_WALLET_PRIVATE_KEY is not set");
  }
  // x402 names networks by CAIP-2 id, such as eip155:84532.
  const network = NETWORKS[process.env["4MICA_NETWORK"] ?? "base-sepolia"]
    .caip2 as `${string}:${string}`;
  const coreUrl = process.env["4MICA_RPC_URL"];
  const scheme = await FourMicaEvmScheme.create(
    privateKeyToAccount(privateKey as `0x${string}`),
    {
      networks: [network],
      ...(coreUrl ? { coreUrls: { [network]: coreUrl } } : {}),
    },
  );
  // Answers a 402 by signing a payment and retrying, and recovers from the
  // refusals a payer can fix, such as core asking for a checkpoint.
  return wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network, client: scheme }],
  });
};

const getFetchWithPayment = (): Promise<typeof fetch> => {
  cache.fetchWithPayment ??= connectFetch().catch((error) => {
    cache.fetchWithPayment = undefined;
    throw error;
  });
  return cache.fetchWithPayment;
};

export const priceLabel = (amount: string, asset: string) =>
  asset === zeroAddress
    ? `${formatEther(BigInt(amount))} ETH`
    : `${amount} base units of ${asset}`;

/** What `url` asks to be paid, so the UI can show the price before buying. */
export const challengeFor = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" });
  const header = res.headers.get("PAYMENT-REQUIRED");
  return res.status === 402 && header
    ? decodePaymentRequiredHeader(header)
    : null;
};

export const pay = async (url: string): Promise<Purchase> => {
  const challenge = await challengeFor(url);
  if (!challenge) {
    throw new Error("That URL is not for sale.");
  }
  const accepted = challenge.accepts[0];

  const fetchWithPayment = await getFetchWithPayment();
  const paid = await fetchWithPayment(url, { cache: "no-store" });

  const purchase: Purchase = {
    at: new Date().toISOString(),
    url,
    price: priceLabel(accepted.amount, accepted.asset),
    status: paid.status,
    body: await paid.json().catch(() => null),
  };
  purchases.unshift(purchase);
  return purchase;
};
