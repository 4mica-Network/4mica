import { NETWORKS, RpcProxy, resolveNetworkRpcUrl } from "@4mica/sdk";
import { createAppClient, fromAppNetwork } from "@4mica/sdk/app";
import {
  FourMicaEvmScheme,
  FourMicaFacilitatorClient,
  x402HTTPResourceServer,
  x402ResourceServer,
} from "@4mica/x402/server";
import type { HTTPTransportContext } from "@x402/core/server";
import { formatUnits, parseUnits } from "viem";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const NATIVE_DECIMALS = 18;

export const PRODUCT_PATH = "/insight";

const decimalsOf = async (network: string, asset: string | null) => {
  if (!asset || asset === ZERO_ADDRESS) {
    return NATIVE_DECIMALS;
  }
  const coreUrl = process.env["4MICA_RPC_URL"] ?? resolveNetworkRpcUrl(network);
  if (!coreUrl) {
    throw new Error(`No 4Mica core URL known for ${network}`);
  }
  const { tokens } = await new RpcProxy(coreUrl).getSupportedTokens();
  const token = tokens.find(
    (entry) => entry.address.toLowerCase() === asset.toLowerCase(),
  );
  if (token?.decimals === undefined) {
    throw new Error(`4Mica core lists no decimals for ${asset} on ${network}`);
  }
  return token.decimals;
};

const connect = async () => {
  const apiKey = process.env.FOURMICA_API_KEY;
  if (!apiKey) {
    throw new Error("FOURMICA_API_KEY is not set");
  }
  const api = createAppClient({
    apiKey,
    baseUrl: process.env.FOURMICA_API_URL,
  });
  const { listing } = await api.resource();

  if (!listing?.payToAddress || !listing.network || !listing.priceAmount) {
    throw new Error(
      "Give the listing a receiving wallet, a network and a price in the dashboard first.",
    );
  }

  const payTo = listing.payToAddress;
  const asset = listing.assetAddress;
  // x402 names networks by CAIP-2 id, such as eip155:84532.
  const network = NETWORKS[fromAppNetwork(listing.network)]
    .caip2 as `${string}:${string}`;
  const decimals = await decimalsOf(network, asset);
  const amount = parseUnits(listing.priceAmount, decimals).toString();

  const facilitator = new FourMicaFacilitatorClient(
    process.env.FACILITATOR_URL
      ? { url: process.env.FACILITATOR_URL }
      : undefined,
  );

  // Settlement runs after the route answers, so the guarantee receipt is only
  // known here, not in the handler.
  const server = new x402ResourceServer(facilitator)
    .register(network, new FourMicaEvmScheme())
    .onAfterSettle(async ({ paymentPayload, result, transportContext }) => {
      const paid = (
        paymentPayload.payload as { payload: Record<string, string> }
      ).payload;
      const receipt = result.extra?.receipt as
        | { receipt: string; signature: string }
        | undefined;
      const resource = (
        transportContext as HTTPTransportContext | undefined
      )?.request.adapter.getUrl();
      api
        .reportPayment({
          reqId: paid.req_id,
          payerAddress: paid.user_address,
          recipientAddress: payTo,
          network,
          assetAddress: asset,
          amount: formatUnits(BigInt(paid.amount), decimals),
          guaranteeClaims: receipt?.receipt,
          guaranteeSignature: receipt?.signature,
          resource: resource ?? `http://localhost:3010${PRODUCT_PATH}`,
          description: "Market insight",
        })
        .catch((error) => console.error("[shop] report failed:", error));
    });

  const http = new x402HTTPResourceServer(server, {
    [`GET ${PRODUCT_PATH}`]: {
      accepts: {
        scheme: "4mica-credit",
        price: { amount, asset: asset ?? ZERO_ADDRESS },
        network,
        payTo,
      },
      description: listing.summary ?? listing.name,
    },
  });
  await http.initialize();

  return {
    api,
    http,
    listing,
    payTo,
    asset,
    network,
    priceLabel: [listing.priceAmount, listing.priceCurrency]
      .filter(Boolean)
      .join(" "),
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
