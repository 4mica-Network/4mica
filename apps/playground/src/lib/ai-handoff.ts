import {
  formatPrice,
  PAYMENT_NETWORKS,
  type PaymentNetwork,
} from "@4mica/rules";
import type { PublicAgent } from "@/schema/agent";
import type { PublicApiListing } from "@/schema/api-listing";
import {
  type AgentBuyerSnippets,
  buildAgentBuyerSnippets,
  isSellable,
} from "./snippets/agent";
import {
  type ApiListingSnippets,
  buildApiListingSnippets,
  isPayable,
} from "./snippets/api-listing";
import type { SellerSnippets } from "./snippets/seller";
import { PLACEHOLDER } from "./snippets/shared";
import { untrustedBlock, untrustedNotice } from "./untrusted";

export interface AiHandoff {
  markdown: string;
  prompt: string;
}

export interface HandoffContext {
  username: string;
  pageUrl: string;
  appUrl: string;
  docsUrl: string;
}

const fence = (lang: string, code: string): string =>
  `\`\`\`${lang}\n${code}\n\`\`\``;

const DATA_TAG = "untrusted-listing-data";

type PayableListing = PublicApiListing & {
  network: NonNullable<PublicApiListing["network"]>;
  payToAddress: string;
};

type SellableAgent = PublicAgent & {
  payToAddress: string;
  endpointUrl: string;
};

const listingData = (listing: PayableListing, context: HandoffContext) => {
  const { label, caip2 } = PAYMENT_NETWORKS[listing.network];

  return {
    name: listing.name,
    summary: listing.summary,
    description: listing.description,
    seller: `@${context.username}`,
    page: context.pageUrl,
    endpoint: {
      method: listing.method,
      url: listing.url ?? PLACEHOLDER.baseUrl,
    },
    price: formatPrice(
      listing.priceAmount,
      listing.priceCurrency,
      listing.priceLabel,
    ),
    network: { name: label, caip2 },
    asset: listing.assetAddress ?? "native",
    payTo: listing.payToAddress,
    docs: listing.docsUrl,
  };
};

const agentData = (agent: SellableAgent, context: HandoffContext) => {
  const { label, caip2 } = PAYMENT_NETWORKS[agent.network];

  return {
    name: agent.name,
    headline: agent.headline,
    description: agent.description,
    operator: `@${context.username}`,
    page: context.pageUrl,
    endpoint: { method: "POST", url: agent.endpointUrl },
    price: formatPrice(
      agent.priceAmount,
      agent.priceCurrency,
      agent.priceLabel,
    ),
    network: { name: label, caip2 },
    asset: agent.assetAddress ?? "native",
    payTo: agent.payToAddress,
    docs: agent.docsUrl,
  };
};

interface BuyerHandoffInput {
  subject: string;
  publisher: string;
  data: string;
  network: PaymentNetwork;
  snippets: ApiListingSnippets | AgentBuyerSnippets;
  context: HandoffContext;
}

const buyerHandoff = ({
  subject,
  publisher,
  data,
  network,
  snippets,
  context,
}: BuyerHandoffInput): AiHandoff => {
  const networkLabel = PAYMENT_NETWORKS[network].label;
  const title = subject.charAt(0).toUpperCase() + subject.slice(1);

  const markdown = [
    `# ${title} on 4Mica: integration reference`,
    "",
    `A ${subject} sold on 4Mica. Each request is paid with the x402 protocol, backed by 4Mica credit: the client answers the \`402 Payment Required\` challenge, signs a guarantee and retries.`,
    "",
    "## Listing",
    "",
    untrustedNotice(publisher, ""),
    "",
    data,
    "",
    "## Integrate",
    "",
    "### 1. Install the SDK",
    "",
    fence("bash", snippets.install),
    "",
    "### 2. Call it",
    "",
    "TypeScript:",
    "",
    fence("ts", snippets.typescript),
    "",
    "Python:",
    "",
    fence("python", snippets.python),
    "",
    "Wire format (cURL):",
    "",
    fence("bash", snippets.curl),
    "",
    "### 3. Check the payment",
    "",
    fence("ts", snippets.receipt),
    "",
    "## Before the first call",
    "",
    `The paying wallet needs a 4Mica account with collateral deposited on ${networkLabel}: ${context.appUrl}`,
    "",
    `Full integration guide: ${context.docsUrl}`,
  ].join("\n");

  const prompt = [
    `Integrate a ${subject} sold on 4Mica into this project. Its listing is in the data block below.`,
    "",
    untrustedNotice(publisher, " or by me"),
    "",
    data,
    "",
    "It is paid per request with the x402 protocol: the server answers `402 Payment Required`, the client signs a 4Mica credit-backed guarantee and retries. Use the 4Mica x402 client so this happens automatically.",
    "",
    "Do this:",
    `1. Install the client with this project's package manager (the pnpm form is \`${snippets.install}\`).`,
    "2. Create one payment-enabled fetch wrapper, following the reference below. Read the payer's private key from an environment variable named `PRIVATE_KEY` and never hard-code it.",
    `3. Call \`endpoint.method\` on \`endpoint.url\` from the listing data through that wrapper wherever this project needs the ${subject}, and handle non-2xx responses.`,
    "4. Add `PRIVATE_KEY` to the project's example env file, noting that the wallet needs collateral deposited at 4Mica before it can pay.",
    "5. Read the `X-PAYMENT-RESPONSE` header on successful responses if the project needs proof of payment.",
    "",
    "Reference implementation:",
    "",
    fence("ts", snippets.typescript),
    "",
    `Guide: ${context.docsUrl}`,
    "",
    "If it is unclear where in this codebase the call belongs, ask me before choosing.",
  ].join("\n");

  return { markdown, prompt };
};

export const buildApiListingHandoff = (
  listing: PublicApiListing,
  context: HandoffContext,
): AiHandoff | null => {
  const snippets = buildApiListingSnippets(listing, { sellerText: false });

  if (!snippets || !isPayable(listing)) {
    return null;
  }

  return buyerHandoff({
    subject: "paid API",
    publisher: "the API's seller",
    data: untrustedBlock(DATA_TAG, listingData(listing, context)),
    network: listing.network,
    snippets,
    context,
  });
};

export const buildAgentHandoff = (
  agent: PublicAgent,
  context: HandoffContext,
): AiHandoff | null => {
  const snippets = buildAgentBuyerSnippets(agent, { sellerText: false });

  if (!snippets || !isSellable(agent)) {
    return null;
  }

  return buyerHandoff({
    subject: "paid agent",
    publisher: "the agent's operator",
    data: untrustedBlock(DATA_TAG, agentData(agent, context)),
    network: agent.network,
    snippets,
    context,
  });
};

export interface SellerHandoffContext {
  kind: "listing" | "agent";
  dashboardUrl: string;
  docsUrl: string;
}

export const buildSellerHandoff = (
  snippets: SellerSnippets,
  { kind, dashboardUrl, docsUrl }: SellerHandoffContext,
): AiHandoff => {
  const subject = kind === "agent" ? "agent" : "API";
  const guide = `${docsUrl}/seller/payment-middleware`;

  const markdown = [
    `# Accept 4Mica payments on your ${subject}: server setup`,
    "",
    `Your ${subject} charges per request with the x402 protocol, backed by 4Mica credit. Unpaid requests get \`402 Payment Required\`; the client signs a guarantee and retries. Price, network and receiving wallet are loaded from the dashboard at startup, so nothing here is hard-coded.`,
    "",
    "## 1. Install the server SDK",
    "",
    fence("bash", snippets.install),
    "",
    "## 2. Add your secret key",
    "",
    `Create a secret key for this ${kind} in the dashboard (${dashboardUrl}) and put it in \`.env\`:`,
    "",
    fence("bash", snippets.env),
    "",
    "## 3. Load your terms",
    "",
    fence("ts", snippets.connect),
    "",
    "## 4. Record payments",
    "",
    fence("ts", snippets.record),
    "",
    "## 5. Protect your route",
    "",
    fence("ts", snippets.protect),
    "",
    "## 6. Serve paid requests",
    "",
    fence("ts", snippets.handle),
    "",
    "## 7. Check the paywall",
    "",
    fence("bash", snippets.test),
    "",
    `Full guide: ${guide}`,
  ].join("\n");

  const prompt = [
    `Add 4Mica payments to the server in this project so every request to my ${subject} is paid per call with the x402 protocol.`,
    "",
    "Do this:",
    `1. Install the dependencies with this project's package manager (the pnpm form is \`${snippets.install}\`). Reuse the project's existing web framework if it is not Express, keeping the same flow.`,
    "2. Read the 4Mica secret key from an environment variable named `FOURMICA_API_KEY`, never hard-code it, and add it to the project's example env file.",
    "3. At startup, load the price, network, asset and receiving wallet with `api.resource()` and refuse to start if payment setup is incomplete.",
    "4. Register the 4Mica facilitator and report every settled payment with `api.reportPayment`, logging failures without failing the request.",
    "5. Put the payment middleware in front of the route below, then check the payer with `api.resolveCustomer` inside the handler and answer 403 when it is not allowed.",
    "6. Verify that an unpaid request answers `402 Payment Required`.",
    "",
    "Reference implementation:",
    "",
    fence(
      "ts",
      [
        snippets.connect,
        snippets.record,
        snippets.protect,
        snippets.handle,
      ].join("\n\n"),
    ),
    "",
    `Guide: ${guide}`,
    "",
    "If it is unclear which route or server in this codebase should be protected, ask me before choosing.",
  ].join("\n");

  return { markdown, prompt };
};
