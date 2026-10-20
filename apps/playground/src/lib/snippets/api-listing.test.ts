import { describe, expect, it } from "vitest";
import type { PublicApiListing } from "@/schema/api-listing";
import { buildApiListingSnippets, isPayable } from "./api-listing";

const listing = (
  overrides: Partial<PublicApiListing> = {},
): PublicApiListing => ({
  id: "listing-1",
  ref: "credit-limits",
  name: "Credit Limits API",
  summary: null,
  description: null,
  url: "https://api.4mica.io/v1/credit/limits",
  method: "GET",
  docsUrl: null,
  category: "Credit",
  tags: [],
  priceLabel: "$0.01 per call",
  visibility: "PUBLIC",
  publishedAt: null,
  network: "BASE_SEPOLIA",
  payToAddress: "0xA11CE00000000000000000000000000000000001",
  assetAddress: null,
  priceAmount: "0.010000000000000000",
  priceCurrency: "USD",
  x402Endpoint: "https://api.4mica.io/v1/credit/x402",
  ...overrides,
});

describe("isPayable", () => {
  it("requires both a network and a recipient", () => {
    expect(isPayable(listing())).toBe(true);
    expect(isPayable(listing({ network: null }))).toBe(false);
    expect(isPayable(listing({ payToAddress: null }))).toBe(false);
  });
});

describe("buildApiListingSnippets", () => {
  it("returns null rather than inventing a chain id or recipient", () => {
    expect(buildApiListingSnippets(listing({ network: null }))).toBeNull();
    expect(buildApiListingSnippets(listing({ payToAddress: null }))).toBeNull();
  });

  it("puts the listing's real request URL in every language", () => {
    const snippets = buildApiListingSnippets(listing());
    const url = "https://api.4mica.io/v1/credit/limits";

    expect(snippets?.typescript).toContain(url);
    expect(snippets?.python).toContain(url);
    expect(snippets?.curl).toContain(url);
    // The generic marketing placeholder must not survive into a real listing.
    expect(snippets?.typescript).not.toContain("api.example.com");
  });

  it("carries the row's network, recipient and trimmed price", () => {
    const snippets = buildApiListingSnippets(listing());

    expect(snippets?.typescript).toContain('network: "eip155:84532"');
    expect(snippets?.typescript).toContain(
      "0xA11CE00000000000000000000000000000000001",
    );
    expect(snippets?.typescript).toContain("$0.01 per call");
    // Not the raw Decimal(38,18) padding.
    expect(snippets?.typescript).not.toContain("0.010000000000000000");
  });

  it("names the endpoint's own method and path", () => {
    const snippets = buildApiListingSnippets(listing());

    expect(snippets?.typescript).toContain(
      "GET https://api.4mica.io/v1/credit/limits",
    );
    expect(snippets?.curl).toContain("curl -i -X GET '");
  });

  it("adds request options for a non-GET route", () => {
    const snippets = buildApiListingSnippets(
      listing({ method: "POST", url: "https://api.4mica.io/v1/credit/holds" }),
    );

    expect(snippets?.typescript).toContain('method: "POST"');
    expect(snippets?.python).toContain("session.post(");
  });

  it("falls back to a marked placeholder when the URL is unset", () => {
    const snippets = buildApiListingSnippets(listing({ url: null }));

    expect(snippets?.typescript).toContain("https://api.example.com");
    expect(snippets?.typescript).not.toContain("undefined");
  });

  it("never leaks a nullish interpolation", () => {
    const snippets = buildApiListingSnippets(listing());

    for (const source of Object.values(snippets ?? {})) {
      expect(source).not.toContain("undefined");
    }

    // The code snippets carry no `null` at all. cURL is exempt because
    // `"asset": null` there is deliberate JSON, asserted separately above.
    expect(snippets?.typescript).not.toContain("null");
    expect(snippets?.python).not.toContain("null");
    expect(snippets?.receipt).not.toContain("null");
  });

  it("names the ERC-20 token so an allowance can be approved", () => {
    const usdc = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
    const snippets = buildApiListingSnippets(listing({ assetAddress: usdc }));

    expect(snippets?.typescript).toContain(`ERC-20 ${usdc}`);
    expect(snippets?.python).toContain(`ERC-20 ${usdc}`);
    expect(snippets?.curl).toContain(`"asset": "${usdc}"`);
  });

  it("marks a native-asset listing as such rather than omitting it", () => {
    const snippets = buildApiListingSnippets(listing({ assetAddress: null }));

    expect(snippets?.typescript).toContain("native asset");
    expect(snippets?.curl).toContain('"asset": null');
  });

  it("puts the raw amount, not the display price, on the wire", () => {
    const snippets = buildApiListingSnippets(listing());

    // "$0.01" is the human form; the requirements carry the bare number.
    expect(snippets?.curl).toContain('"maxAmountRequired": "0.01"');
    expect(snippets?.curl).not.toContain('"maxAmountRequired": "$0.01"');
  });

  it("omits the wire amount when only a display label was published", () => {
    const snippets = buildApiListingSnippets(
      listing({
        priceAmount: null,
        priceCurrency: null,
        priceLabel: "Usage-based",
      }),
    );

    expect(snippets?.curl).not.toContain("maxAmountRequired");
    // The label still reaches the human-readable comment.
    expect(snippets?.typescript).toContain("Usage-based per call");
  });

  it("advertises the tab-free requirements", () => {
    const snippets = buildApiListingSnippets(listing());

    expect(snippets?.curl).toContain('"scheme": "4mica-credit"');
    expect(snippets?.curl).not.toContain("tabEndpoint");
  });

  it("cannot be broken out of by a hostile URL or name", () => {
    const hostile = 'https://x.example/$(id)`id`"; touch pwn; echo "';
    const snippets = buildApiListingSnippets(
      listing({ name: "Evil\nprocess.exit(1)", url: hostile }),
    );

    expect(snippets?.curl).toContain(`curl -i -X GET '${hostile}'`);
    expect(snippets?.typescript).toContain(JSON.stringify(hostile));
    expect(snippets?.python).toContain(
      `session.get(${JSON.stringify(hostile)})`,
    );
    expect(snippets?.typescript).not.toMatch(/^process\.exit/m);
    expect(snippets?.python).not.toMatch(/^process\.exit/m);
  });
});
