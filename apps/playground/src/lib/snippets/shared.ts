import { trimAmount } from "@4mica/rules";

/**
 * Shared helpers for turning DB rows into snippet source text.
 *
 * Everything here is pure so the builders can be asserted in unit tests — the
 * thing worth testing is that a listing's real values reach the code a customer
 * copies, and that a missing value degrades to a marked placeholder rather than
 * the string "undefined".
 */

/** Stand-ins, all obviously not-real so nobody pastes one into production. */
export const PLACEHOLDER = {
  baseUrl: "https://api.example.com",
  agentWallet: "0xYourAgentWallet",
} as const;

/**
 * Joins the non-null parts of a code comment with `·` separators. `prefix`
 * carries the host language's comment marker.
 */
export const commentLine = (parts: (string | null)[], prefix = "//"): string =>
  `${prefix} ${parts
    .filter((part): part is string => part !== null)
    .map(singleLine)
    .join(" · ")}`;

export const singleLine = (value: string): string =>
  value.replace(/[\p{Cc}\u2028\u2029]+/gu, " ");

export const codeString = (value: string): string => JSON.stringify(value);

export const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", `'\\''`)}'`;

export interface CurlHandshakeInput {
  method: string;
  url: string;
  caip2: string;
  payTo: string;
  assetAddress: string | null;
  wireAmount: string | null;
}

export const buildCurlHandshake = ({
  method,
  url,
  caip2,
  payTo,
  assetAddress,
  wireAmount,
}: CurlHandshakeInput): string => `# 1. An unpaid request answers 402 with the payment requirements.
curl -i -X ${method} ${shellQuote(url)}

# {
#   "x402Version": 1,
#   "accepts": [
#     {
#       "scheme": "4mica-credit",
#       "network": "${caip2}",
#       "payTo": "${payTo}",
#       "asset": ${assetAddress === null ? "null" : `"${assetAddress}"`}${
  wireAmount === null
    ? ""
    : `,\n#       "maxAmountRequired": "${trimAmount(wireAmount)}"`
}
#     }
#   ]
# }
# "asset": null means the chain's native asset. Amounts on the wire are in
# the asset's base units.

# 2. Sign a guarantee for those requirements, then retry with the header.
#    The SDK does steps 1 and 2 for you — this is the wire format.
curl -X ${method} ${shellQuote(url)} \\
  -H "X-PAYMENT: $PAYMENT_HEADER"`;
