import { toBaseUnits, toCaip2, ZERO_ADDRESS } from "@4mica/sdk";
import { createAppClient, parseSettlement } from "@4mica/sdk/app";
import {
  FourMicaEvmScheme,
  FourMicaFacilitatorClient,
  x402HTTPResourceServer,
  x402ResourceServer,
} from "@4mica/x402/server";
import type { HTTPTransportContext } from "@x402/core/server";

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

  if (
    !listing?.payToAddress ||
    !listing.network ||
    !listing.priceAmount ||
    listing.assetDecimals === null
  ) {
    throw new Error(
      "Give the listing a receiving wallet, a network and a price in the dashboard first.",
    );
  }

  const payTo = listing.payToAddress;
  const asset = listing.assetAddress;
  const decimals = listing.assetDecimals;
  const network = toCaip2(listing.network);

  const facilitator = new FourMicaFacilitatorClient(
    process.env.FACILITATOR_URL
      ? { url: process.env.FACILITATOR_URL }
      : undefined,
  );

  // Settlement runs after the route answers, so the guarantee receipt is only
  // known here, not in the handler.
  const server = new x402ResourceServer(facilitator);
  server.register(network, new FourMicaEvmScheme());

  server.onAfterSettle(async (settlement) => {
    const { reqId, payerAddress, amount, guaranteeClaims, guaranteeSignature } =
      parseSettlement(settlement);
    const http = settlement.transportContext as
      | HTTPTransportContext
      | undefined;
    const resource =
      http?.request.adapter.getUrl() ?? `http://localhost:3010${PRODUCT_PATH}`;

    try {
      await api.reportPayment({
        reqId,
        payerAddress,
        amount,
        guaranteeClaims,
        guaranteeSignature,
        recipientAddress: payTo,
        network,
        assetAddress: asset,
        resource,
        description: "Market insight",
      });
    } catch (error) {
      console.error("[shop] report failed:", error);
    }
  });

  const http = new x402HTTPResourceServer(server, {
    [`GET ${PRODUCT_PATH}`]: {
      accepts: {
        scheme: "4mica-credit",
        price: {
          amount: toBaseUnits(listing.priceAmount, decimals).toString(),
          asset: asset ?? ZERO_ADDRESS,
        },
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
    decimals,
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
