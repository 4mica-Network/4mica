import { fromAppNetwork } from "@4mica/sdk-next";
import { createAppClient, createClient } from "@4mica/sdk-node";
import { parseUnits, zeroAddress } from "viem";

const connect = async () => {
  const api = createAppClient();
  const { listing } = await api.resource();

  if (!listing?.payToAddress || !listing.network || !listing.priceAmount) {
    throw new Error(
      "Give the listing a receiving wallet, a network and a price in the dashboard first.",
    );
  }

  const client = await createClient();
  const asset = listing.assetAddress ?? zeroAddress;
  const token =
    asset === zeroAddress
      ? { symbol: "ETH", decimals: 18 }
      : (await client.rpc.getSupportedTokens()).tokens.find(
          (t) => t.address.toLowerCase() === asset.toLowerCase(),
        );

  if (!token) {
    throw new Error(`4Mica core does not accept the listing's asset ${asset}.`);
  }

  const decimals = token.decimals ?? 18;

  return {
    api,
    client,
    listing,
    payTo: listing.payToAddress,
    asset,
    network: fromAppNetwork(listing.network),
    decimals,
    price: parseUnits(listing.priceAmount, decimals).toString(),
    priceLabel: `${listing.priceAmount} ${token.symbol}`,
  };
};

export type Shop = Awaited<ReturnType<typeof connect>>;

const cache = globalThis as { shop?: Promise<Shop> };

export const getShop = (): Promise<Shop> => {
  cache.shop ??= connect().catch((error) => {
    cache.shop = undefined;
    throw error;
  });
  return cache.shop;
};
