import type { PublicApiEndpoint, PublicApiListing } from "@/schema/api-listing";
import { networkInfo } from "./networks";
import {
  commentLine,
  formatPrice,
  joinUrl,
  PLACEHOLDER,
  trimAmount,
} from "./shared";

export interface ApiListingSnippets {
  install: string;
  typescript: string;
  python: string;
  curl: string;
  receipt: string;
}

/**
 * A listing can only produce runnable code once its owner has published where
 * payment goes and on which chain. Everything else (base URL, endpoints, price)
 * degrades to a placeholder; these two cannot, because a guarantee signed
 * against the wrong chain or recipient is not a near-miss — it is unpayable.
 */
export const isPayable = (
  listing: PublicApiListing,
): listing is PublicApiListing & {
  network: NonNullable<PublicApiListing["network"]>;
  payToAddress: string;
} => listing.network !== null && listing.payToAddress !== null;

/** The route a snippet demonstrates: the first one, or a plain GET fallback. */
const exampleEndpoint = (
  listing: PublicApiListing,
): Pick<PublicApiEndpoint, "method" | "path" | "priceAmount"> =>
  listing.endpoints[0] ?? { method: "GET", path: "", priceAmount: null };

/**
 * Build the copyable integration snippets for one API listing.
 *
 * Returns `null` when the listing is not payable, so the caller renders an
 * explanatory note instead of fabricating a chain id and recipient.
 */
export const buildApiListingSnippets = (
  listing: PublicApiListing,
): ApiListingSnippets | null => {
  if (!isPayable(listing)) {
    return null;
  }

  const { caip2, sdkName } = networkInfo(listing.network);
  const endpoint = exampleEndpoint(listing);
  const url = joinUrl(listing.baseUrl ?? PLACEHOLDER.baseUrl, endpoint.path);
  const price = formatPrice(
    endpoint.priceAmount ?? listing.priceAmount,
    listing.priceCurrency,
    listing.priceLabel,
  );

  const descriptorParts = [
    listing.name,
    `${endpoint.method} ${endpoint.path || "/"}`,
    price === null ? null : `${price} per call`,
  ];

  // Which token the price is denominated in. Without this an ERC-20 listing
  // reads as though it were priced in the chain's native asset.
  const paidToParts = [
    `Paid to ${listing.payToAddress}`,
    listing.assetAddress === null
      ? "native asset"
      : `ERC-20 ${listing.assetAddress}`,
  ];

  const descriptor = commentLine(descriptorParts);
  const paidTo = commentLine(paidToParts);

  // Anything other than GET needs a body, so the fetch call grows options.
  const requestArgs =
    endpoint.method === "GET"
      ? `\n  "${url}",\n`
      : `\n  "${url}",\n  {\n    method: "${endpoint.method}",\n    headers: { "content-type": "application/json" },\n    body: JSON.stringify({}),\n  },\n`;

  const install = "pnpm add @4mica/x402 @x402/fetch viem";

  const typescript = `import { FourMicaEvmScheme } from "@4mica/x402/client";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";

// Pay from a dedicated wallet with collateral deposited at 4Mica.
const account = privateKeyToAccount(
  process.env.PRIVATE_KEY as \`0x\${string}\`,
);
const scheme = await FourMicaEvmScheme.create(account);

const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: "${caip2}", client: scheme }],
});

${descriptor}
${paidTo}
const response = await fetchWithPayment(${requestArgs});

const data = await response.json();`;

  const pythonCall =
    endpoint.method === "GET"
      ? `response = session.get("${url}")`
      : `response = session.${endpoint.method.toLowerCase()}("${url}", json={})`;

  const python = `import os

from x402 import x402ClientSync
from x402.http.clients import x402_requests
from fourmica_x402.client_scheme import FourMicaEvmScheme

client = x402ClientSync()
client.register("${caip2}", FourMicaEvmScheme(os.environ["PRIVATE_KEY"]))
session = x402_requests(client)

${commentLine(descriptorParts, "#")}
${commentLine(paidToParts, "#")}
${pythonCall}
data = response.json()`;

  const tabEndpoint = listing.x402Endpoint ?? `${PLACEHOLDER.baseUrl}/x402`;

  // The wire amount is the raw number, not the "$0.01" display form, and it is
  // denominated in the asset's base units. Omitted entirely when the seller
  // published only a display label, rather than guessed at.
  const wireAmount = endpoint.priceAmount ?? listing.priceAmount;

  const curl = `# 1. An unpaid request answers 402 with the payment requirements.
curl -i -X ${endpoint.method} "${url}"

# {
#   "x402Version": 1,
#   "accepts": [
#     {
#       "scheme": "4mica-credit",
#       "network": "${caip2}",
#       "payTo": "${listing.payToAddress}",
#       "asset": ${
    listing.assetAddress === null ? "null" : `"${listing.assetAddress}"`
  },${
    wireAmount === null
      ? ""
      : `\n#       "maxAmountRequired": "${trimAmount(wireAmount)}",`
  }
#       "extra": { "tabEndpoint": "${tabEndpoint}" }
#     }
#   ]
# }
# "asset": null means the chain's native asset. Amounts on the wire are in
# the asset's base units.

# 2. Sign a guarantee for those requirements, then retry with the header.
#    The SDK does steps 1 and 2 for you — this is the wire format.
curl -X ${endpoint.method} "${url}" \\
  -H "X-PAYMENT: $PAYMENT_HEADER"`;

  const receipt = `import { Client, ConfigBuilder } from "@4mica/sdk";

// Every paid response carries its settled payment on this header.
const receipt = response.headers.get("X-PAYMENT-RESPONSE");

const client = await Client.new(
  new ConfigBuilder()
    .network("${sdkName}")
    .walletPrivateKey(process.env.PRIVATE_KEY)
    .build(),
);

try {
  // One entry per asset: collateral, locked credit, pending withdrawal.
  const positions = await client.user.getUser();
  console.log({ receipt, positions });
} finally {
  await client.aclose();
}`;

  return { install, typescript, python, curl, receipt };
};
