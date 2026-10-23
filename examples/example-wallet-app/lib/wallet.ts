import { type Client, X402Flow, X402PaymentRequired } from "@4mica/sdk";
import { createClient } from "@4mica/sdk-node";
import { formatEther, zeroAddress } from "viem";

export interface Purchase {
  at: string;
  url: string;
  price: string;
  status: number;
  body: unknown;
}

const cache = globalThis as {
  wallet?: Promise<Client>;
  purchases?: Purchase[];
};

cache.purchases ??= [];

export const purchases = cache.purchases;

export const getWallet = (): Promise<Client> => {
  cache.wallet ??= createClient().catch((error) => {
    cache.wallet = undefined;
    throw error;
  });
  return cache.wallet;
};

export const priceLabel = (amount: string, asset: string) =>
  asset === zeroAddress
    ? `${formatEther(BigInt(amount))} ETH`
    : `${amount} base units of ${asset}`;

export const challengeFor = async (url: string) => {
  const res = await fetch(url, { cache: "no-store" });
  return res.status === 402
    ? X402PaymentRequired.fromRaw(await res.json())
    : null;
};

export const pay = async (url: string): Promise<Purchase> => {
  const client = await getWallet();
  const challenge = await challengeFor(url);
  if (!challenge) {
    throw new Error("That URL is not for sale.");
  }

  const accepted = challenge.accepts[0];
  const signed = await X402Flow.fromClient(client).signPaymentV2(
    challenge,
    accepted,
  );
  const paid = await fetch(url, {
    headers: { "X-PAYMENT": signed.header },
    cache: "no-store",
  });

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
