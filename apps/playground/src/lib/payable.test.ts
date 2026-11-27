import { describe, expect, it } from "vitest";
import type { PublicAgent } from "@/schema/agent";
import type { PublicApiListing } from "@/schema/api-listing";
import { agentGaps, listingGaps } from "./payable";

const listing = (over: Partial<PublicApiListing> = {}): PublicApiListing => ({
  id: "listing-1",
  ref: "credit-limits",
  name: "Credit Limits API",
  summary: null,
  description: null,
  url: "https://api.example.com/limits",
  method: "GET",
  docsUrl: null,
  category: null,
  tags: [],
  priceLabel: null,
  visibility: "PUBLIC",
  publishedAt: null,
  network: "BASE_SEPOLIA",
  payToAddress: "0xA11CE00000000000000000000000000000000001",
  assetAddress: null,
  priceAmount: "0.01",
  priceCurrency: "USD",
  x402Endpoint: null,
  ...over,
});

const agent = (over: Partial<PublicAgent> = {}): PublicAgent => ({
  id: "agent-1",
  ref: "atlas",
  name: "Atlas",
  headline: null,
  description: null,
  avatarUrl: null,
  docsUrl: null,
  status: "ACTIVE",
  visibility: "PUBLIC",
  createdAt: "2026-01-01T00:00:00.000Z",
  publishedAt: null,
  network: "BASE_SEPOLIA",
  payToAddress: "0xA11CE00000000000000000000000000000000001",
  assetAddress: null,
  priceAmount: "0.01",
  priceCurrency: "USD",
  priceLabel: null,
  endpointUrl: "https://agents.example.com/atlas",
  x402Endpoint: null,
  walletAddress: null,
  ...over,
});

describe("listingGaps", () => {
  it("is empty for a complete listing", () => {
    expect(listingGaps(listing())).toEqual([]);
  });

  it("names a missing wallet once, whether the network or the address is gone", () => {
    expect(listingGaps(listing({ payToAddress: null }))).toEqual(["wallet"]);
    expect(listingGaps(listing({ network: null }))).toEqual(["wallet"]);
    expect(listingGaps(listing({ network: null, payToAddress: null }))).toEqual(
      ["wallet"],
    );
  });

  it("lists every gap in a stable order", () => {
    expect(
      listingGaps(
        listing({ priceAmount: null, url: null, payToAddress: null }),
      ),
    ).toEqual(["wallet", "endpoint", "price"]);
  });
});

describe("agentGaps", () => {
  it("is empty for a complete agent", () => {
    expect(agentGaps(agent())).toEqual([]);
  });

  it("lists every gap in a stable order", () => {
    expect(
      agentGaps(
        agent({ priceAmount: null, endpointUrl: null, payToAddress: null }),
      ),
    ).toEqual(["wallet", "endpoint", "price"]);
  });
});
