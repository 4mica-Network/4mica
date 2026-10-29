import { formatPrice, PAYMENT_NETWORKS } from "@4mica/rules";
import type { PublicApiListing } from "@/schema/api-listing";
import { buildApiListingSnippets, isPayable } from "./snippets/api-listing";
import { PLACEHOLDER } from "./snippets/shared";

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

const facts = (
  listing: PublicApiListing & {
    network: NonNullable<PublicApiListing["network"]>;
    payToAddress: string;
  },
  context: HandoffContext,
): string[] => {
  const { label, caip2 } = PAYMENT_NETWORKS[listing.network];
  const price = formatPrice(
    listing.priceAmount,
    listing.priceCurrency,
    listing.priceLabel,
  );

  return [
    `Endpoint: \`${listing.method} ${listing.url ?? PLACEHOLDER.baseUrl}\``,
    ...(price ? [`Price: ${price} per request`] : []),
    `Network: ${label} (\`${caip2}\`)`,
    `Asset: ${
      listing.assetAddress
        ? `ERC-20 \`${listing.assetAddress}\``
        : "the network's native asset"
    }`,
    `Pay to: \`${listing.payToAddress}\``,
    ...(listing.docsUrl ? [`API docs: ${listing.docsUrl}`] : []),
    `Seller: @${context.username}`,
    `Listing: ${context.pageUrl}`,
  ];
};

/**
 * Two hand-offs for an AI coding agent: a self-contained markdown reference,
 * and an instruction prompt that tells the agent what to build with it. Both
 * come from the same snippets the page renders, so they cannot drift from it.
 *
 * Returns `null` for a listing that is not payable yet, for the same reason the
 * snippets do: a chain id or recipient cannot be guessed.
 */
export const buildApiListingHandoff = (
  listing: PublicApiListing,
  context: HandoffContext,
): AiHandoff | null => {
  const snippets = buildApiListingSnippets(listing);

  if (!snippets || !isPayable(listing)) {
    return null;
  }

  const list = facts(listing, context).map((fact) => `- ${fact}`);

  const markdown = [
    `# ${listing.name}`,
    ...(listing.summary ? ["", listing.summary] : []),
    "",
    "A paid HTTP API sold on 4Mica. Each request is paid with the x402 protocol, backed by 4Mica credit: the client answers the `402 Payment Required` challenge, signs a guarantee and retries.",
    "",
    "## Details",
    "",
    ...list,
    ...(listing.description
      ? ["", "## About this API", "", listing.description]
      : []),
    "",
    "## Integrate",
    "",
    "### 1. Install the SDK",
    "",
    fence("bash", snippets.install),
    "",
    "### 2. Call the API",
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
    `The paying wallet needs a 4Mica account with collateral deposited on ${PAYMENT_NETWORKS[listing.network].label}: ${context.appUrl}`,
    "",
    `Full integration guide: ${context.docsUrl}`,
  ].join("\n");

  const prompt = [
    `Integrate the paid API "${listing.name}" into this project.`,
    "",
    "It is sold on 4Mica and paid per request with the x402 protocol: the server answers `402 Payment Required`, the client signs a 4Mica credit-backed guarantee and retries. Use the 4Mica x402 client so this happens automatically.",
    "",
    "API details:",
    ...list,
    "",
    "Do this:",
    `1. Install the client with this project's package manager (the pnpm form is \`${snippets.install}\`).`,
    "2. Create one payment-enabled fetch wrapper, following the reference below. Read the payer's private key from an environment variable named `PRIVATE_KEY` and never hard-code it.",
    "3. Call the endpoint through that wrapper wherever this project needs the API, and handle non-2xx responses.",
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
