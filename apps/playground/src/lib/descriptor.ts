import type { PublicAgent } from "@/schema/agent";
import type { PublicApiListing } from "@/schema/api-listing";
import type { PaymentNetwork } from "@/schema/params";
import type { PublicProfile } from "@/schema/profile";
import { links } from "@/services/links";
import { isSellable } from "./snippets/agent";
import { isPayable } from "./snippets/api-listing";
import { networkInfo } from "./snippets/networks";
import { formatPrice, joinUrl, trimAmount } from "./snippets/shared";

export const DESCRIPTOR_SCHEMA =
  "https://4mica.io/schemas/resource-descriptor/v1";

export const NATIVE_ASSET_ADDRESS =
  "0x0000000000000000000000000000000000000000";

export const DESCRIPTOR_FILENAME = "x402.json";

export interface DescriptorPrice {
  amount: string | null;
  currency: string | null;
  label: string | null;
  display: string | null;
}

export interface DescriptorPayment {
  protocol: "x402";
  scheme: "4mica-credit";
  network: string;
  networkLabel: string;
  payTo: string;
  asset: string;
  assetKind: "native" | "erc20";
  price: DescriptorPrice;
  wireAmountUnits: "base";
  authoritativeSource: string;
}

export interface DescriptorEndpoint {
  method: string;
  path: string;
  summary: string | null;
  url: string | null;
  price: DescriptorPrice;
}

export interface DescriptorSeller {
  username: string;
  name: string;
  verified: boolean;
  profile: string;
}

export interface DescriptorContact {
  seller: string | null;
  sellerProfile: string;
  support: string;
  docs: string;
  status: string;
}

export interface DescriptorIntegration {
  install: string;
  sdkNetwork: string;
  steps: string[];
  guide: string;
  docs: string;
}

export interface ResourceDescriptor {
  $schema: string;
  kind: "api" | "agent";
  ref: string;
  name: string;
  summary: string | null;
  description: string | null;
  category: string | null;
  tags: string[];
  page: string;
  descriptor: string;
  docs: string | null;
  publishedAt: string | null;
  seller: DescriptorSeller;
  payable: boolean;
  invocable: boolean;
  resource: { url: string; method: string } | null;
  endpoints: DescriptorEndpoint[];
  payment: DescriptorPayment | null;
  integration: DescriptorIntegration | null;
  contact: DescriptorContact;
}

const priceOf = (
  amount: string | null,
  currency: string | null,
  label: string | null,
): DescriptorPrice => ({
  amount: amount === null ? null : trimAmount(amount),
  currency,
  label,
  display: formatPrice(amount, currency, label),
});

const sellerOf = (profile: PublicProfile): DescriptorSeller => ({
  username: profile.username,
  name: profile.name,
  verified: profile.verified,
  profile: links.profile(profile.username),
});

const contactOf = (profile: PublicProfile): DescriptorContact => ({
  seller: profile.email,
  sellerProfile: links.profile(profile.username),
  support: links.email.support,
  docs: links.docs,
  status: links.status,
});

const paymentOf = (
  network: PaymentNetwork,
  payToAddress: string,
  assetAddress: string | null,
  price: DescriptorPrice,
): DescriptorPayment => {
  const info = networkInfo(network);

  return {
    protocol: "x402",
    scheme: "4mica-credit",
    network: info.caip2,
    networkLabel: info.label,
    payTo: payToAddress,
    asset: assetAddress ?? NATIVE_ASSET_ADDRESS,
    assetKind: assetAddress === null ? "native" : "erc20",
    price,
    wireAmountUnits: "base",
    authoritativeSource:
      "Request the resource without a payment header. The 402 response carries the binding accepts[] with the on-wire amount in the asset's base units.",
  };
};

const integrationOf = (
  network: PaymentNetwork,
  page: string,
): DescriptorIntegration => ({
  install: "pnpm add @4mica/x402 @x402/fetch viem",
  sdkNetwork: networkInfo(network).sdkName,
  steps: [
    `Deposit collateral at 4Mica for the wallet that will pay, on ${networkInfo(network).label}.`,
    "Create FourMicaEvmScheme with that signer, then wrap fetch with wrapFetchWithPaymentFromConfig.",
    "Call the resource url. The client answers the 402, signs a guarantee and retries automatically.",
    "Read the settled payment certificate from the X-PAYMENT-RESPONSE header.",
  ],
  guide: page,
  docs: links.docs,
});

export const buildApiListingDescriptor = (
  listing: PublicApiListing,
  profile: PublicProfile,
): ResourceDescriptor => {
  const page = `${links.profile(profile.username)}/api/${listing.ref}`;
  const payable = isPayable(listing);
  const first = listing.endpoints[0];
  const resourceUrl = listing.baseUrl
    ? joinUrl(listing.baseUrl, first?.path ?? "")
    : null;

  return {
    $schema: DESCRIPTOR_SCHEMA,
    kind: "api",
    ref: listing.ref,
    name: listing.name,
    summary: listing.summary,
    description: listing.description,
    category: listing.category,
    tags: listing.tags,
    page,
    descriptor: `${page}/${DESCRIPTOR_FILENAME}`,
    docs: listing.docsUrl,
    publishedAt: listing.publishedAt,
    seller: sellerOf(profile),
    payable,
    invocable: payable && resourceUrl !== null,
    resource: resourceUrl
      ? { url: resourceUrl, method: first?.method ?? "GET" }
      : null,
    endpoints: listing.endpoints.map((endpoint) => ({
      method: endpoint.method,
      path: endpoint.path,
      summary: endpoint.summary,
      url: listing.baseUrl ? joinUrl(listing.baseUrl, endpoint.path) : null,
      price: priceOf(
        endpoint.priceAmount ?? listing.priceAmount,
        listing.priceCurrency,
        listing.priceLabel,
      ),
    })),
    payment: payable
      ? paymentOf(
          listing.network,
          listing.payToAddress,
          listing.assetAddress,
          priceOf(
            listing.priceAmount,
            listing.priceCurrency,
            listing.priceLabel,
          ),
        )
      : null,
    integration: payable ? integrationOf(listing.network, page) : null,
    contact: contactOf(profile),
  };
};

export const buildAgentDescriptor = (
  agent: PublicAgent,
  profile: PublicProfile,
): ResourceDescriptor => {
  const page = `${links.profile(profile.username)}/agents/${agent.ref}`;
  const sellable = isSellable(agent);

  return {
    $schema: DESCRIPTOR_SCHEMA,
    kind: "agent",
    ref: agent.ref,
    name: agent.name,
    summary: agent.headline,
    description: agent.description,
    category: null,
    tags: [],
    page,
    descriptor: `${page}/${DESCRIPTOR_FILENAME}`,
    docs: agent.docsUrl,
    publishedAt: agent.publishedAt,
    seller: sellerOf(profile),
    payable: sellable,
    invocable: sellable && agent.status === "ACTIVE",
    resource: agent.endpointUrl
      ? { url: agent.endpointUrl, method: "POST" }
      : null,
    endpoints: [],
    payment: sellable
      ? paymentOf(
          agent.network,
          agent.payToAddress,
          agent.assetAddress,
          priceOf(agent.priceAmount, agent.priceCurrency, agent.priceLabel),
        )
      : null,
    integration: sellable ? integrationOf(agent.network, page) : null,
    contact: contactOf(profile),
  };
};
