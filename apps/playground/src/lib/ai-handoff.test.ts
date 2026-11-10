import { describe, expect, it } from "vitest";
import type { PublicApiListing } from "@/schema/api-listing";
import { buildApiListingHandoff } from "./ai-handoff";
import { buildApiListingSnippets } from "./snippets/api-listing";

const listing = (
  overrides: Partial<PublicApiListing> = {},
): PublicApiListing => ({
  id: "listing-1",
  ref: "credit-limits",
  name: "Credit Limits API",
  summary: "Look up a credit limit.",
  description: "Returns the live limit for an account.",
  url: "https://api.4mica.io/v1/credit/limits",
  method: "POST",
  docsUrl: "https://docs.4mica.io/credit",
  category: "Credit",
  tags: [],
  priceLabel: null,
  visibility: "PUBLIC",
  publishedAt: null,
  network: "BASE_SEPOLIA",
  payToAddress: "0xA11CE00000000000000000000000000000000001",
  assetAddress: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
  priceAmount: "0.01",
  priceCurrency: "USD",
  x402Endpoint: null,
  ...overrides,
});

const context = {
  username: "ada",
  pageUrl: "https://4mica.io/ada/api/credit-limits",
  appUrl: "https://app.4mica.io",
  docsUrl: "https://docs.4mica.io",
};

describe("buildApiListingHandoff", () => {
  it("is null until the listing can be paid", () => {
    expect(
      buildApiListingHandoff(listing({ network: null }), context),
    ).toBeNull();
    expect(
      buildApiListingHandoff(listing({ payToAddress: null }), context),
    ).toBeNull();
  });

  it("puts every fact a buyer needs into the markdown", () => {
    const handoff = buildApiListingHandoff(listing(), context);
    const markdown = handoff?.markdown ?? "";

    expect(markdown).toContain("# Credit Limits API");
    expect(markdown).toContain("`POST https://api.4mica.io/v1/credit/limits`");
    expect(markdown).toContain("Price: $0.01 per request");
    expect(markdown).toContain("Base Sepolia (`eip155:84532`)");
    expect(markdown).toContain(
      "ERC-20 `0x036cbd53842c5426634e7929541ec2318f3dcf7e`",
    );
    expect(markdown).toContain(
      "Pay to: `0xA11CE00000000000000000000000000000000001`",
    );
    expect(markdown).toContain("Returns the live limit for an account.");
    expect(markdown).toContain(context.pageUrl);
  });

  it("carries the exact snippets the page renders", () => {
    const snippets = buildApiListingSnippets(listing());
    const handoff = buildApiListingHandoff(listing(), context);

    for (const code of [
      snippets?.install,
      snippets?.typescript,
      snippets?.python,
      snippets?.curl,
      snippets?.receipt,
    ]) {
      expect(handoff?.markdown).toContain(code);
    }
    expect(handoff?.prompt).toContain(snippets?.typescript);
  });

  it("tells the agent to keep the key out of the code", () => {
    const prompt = buildApiListingHandoff(listing(), context)?.prompt ?? "";

    expect(prompt).toMatch(/^Integrate the paid API "Credit Limits API"/);
    expect(prompt).toContain("`PRIVATE_KEY`");
    expect(prompt).toContain("never hard-code it");
  });

  it("leaves out facts the seller did not publish", () => {
    const markdown =
      buildApiListingHandoff(
        listing({
          description: null,
          docsUrl: null,
          priceAmount: null,
          assetAddress: null,
        }),
        context,
      )?.markdown ?? "";

    expect(markdown).not.toContain("## About this API");
    expect(markdown).not.toContain("API docs:");
    expect(markdown).not.toContain("Price:");
    expect(markdown).toContain("the network's native asset");
  });
});
