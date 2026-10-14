import { trimAmount } from "@4mica/rules";

export const PLACEHOLDER = {
  baseUrl: "https://api.example.com",
  agentWallet: "0xYourAgentWallet",
} as const;

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
