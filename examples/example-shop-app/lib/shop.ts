import { NETWORKS } from "@4mica/sdk";
import { createAppClient, fromAppNetwork } from "@4mica/sdk/app";
import {
  FourMicaEvmScheme,
  FourMicaFacilitatorClient,
  x402HTTPResourceServer,
  x402ResourceServer,
} from "@4mica/x402/server";
import type { HTTPTransportContext } from "@x402/core/server";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const PRODUCT_PATH = "/insight";

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
          amount: paid.amount,
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
        price: { amount: listing.priceAmount, asset: asset ?? ZERO_ADDRESS },
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
