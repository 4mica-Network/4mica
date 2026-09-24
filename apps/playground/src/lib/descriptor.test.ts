import { describe, expect, it } from "vitest";
import type { PublicAgent } from "@/schema/agent";
import type { PublicApiListing } from "@/schema/api-listing";
import type { PublicProfile } from "@/schema/profile";
import {
  buildAgentDescriptor,
  buildApiListingDescriptor,
  NATIVE_ASSET_ADDRESS,
} from "./descriptor";

const profile = (over: Partial<PublicProfile> = {}): PublicProfile =>
  ({
    username: "mo",
    name: "Mohsen Shafiei",
    bio: null,
    description: null,
    avatarUrl: null,
    verified: false,
    memberSince: "2026-01-01",
    email: "seller@example.com",
    phoneNumber: null,
    primaryBrandColor: null,
    secondaryBrandColor: null,
    allowSEOIndexing: true,
    showBranding: true,
    isOwner: false,
    isPublished: true,
    ...over,
  }) as PublicProfile;

const listing = (over: Partial<PublicApiListing> = {}): PublicApiListing =>
  ({
    id: "id-1",
    ref: "dad-s-joke",
    name: "Dad's Joke",
    summary: "One more joke",
    description: null,
    baseUrl: "https://api.example.com",
    docsUrl: null,
    category: "Search",
    tags: ["jokes"],
    priceLabel: "Usage-based",
    visibility: "PUBLIC",
    publishedAt: "2026-09-22T00:00:00.000Z",
    network: "BASE_SEPOLIA",
    payToAddress: "0x6c5cc69e4c4863dbc3439ab2673806ea7715ebd5",
    assetAddress: null,
    priceAmount: "0.020000000000000000",
    priceCurrency: "USD",
    x402Endpoint: null,
    endpoints: [
      {
        id: "e1",
        method: "GET",
        path: "/joke",
        summary: null,
        priceAmount: null,
      },
    ],
    ...over,
  }) as PublicApiListing;

const agent = (over: Partial<PublicAgent> = {}): PublicAgent =>
  ({
    id: "a-1",
    ref: "atlas",
    name: "Atlas",
    headline: "Research",
    description: null,
    avatarUrl: null,
    docsUrl: null,
    status: "ACTIVE",
    visibility: "PUBLIC",
    createdAt: "2026-08-14T00:00:00.000Z",
    publishedAt: "2026-08-14T00:00:00.000Z",
    network: "BASE_SEPOLIA",
    walletAddress: null,
    payToAddress: "0x3d8e1f5a7c9b2d4e6a8c0f2b4d6e8a1c3f5b7d09",
    assetAddress: "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
    priceAmount: "0.002",
    priceCurrency: "USD",
    priceLabel: null,
    endpointUrl: "https://agents.example.com/atlas",
    x402Endpoint: null,
    ...over,
  }) as PublicAgent;

describe("buildApiListingDescriptor", () => {
  it("joins the base url with the first endpoint so the url is callable", () => {
    const result = buildApiListingDescriptor(listing(), profile());

    expect(result.resource).toEqual({
      url: "https://api.example.com/joke",
      method: "GET",
    });
    expect(result.invocable).toBe(true);
  });

  it("names the zero address for a native-asset listing", () => {
    const result = buildApiListingDescriptor(listing(), profile());

    expect(result.payment?.asset).toBe(NATIVE_ASSET_ADDRESS);
    expect(result.payment?.assetKind).toBe("native");
  });

  it("marks an ERC-20 listing as such", () => {
    const result = buildApiListingDescriptor(
      listing({ assetAddress: "0x036cbd53842c5426634e7929541ec2318f3dcf7e" }),
      profile(),
    );

    expect(result.payment?.assetKind).toBe("erc20");
  });

  it("trims the Decimal tail off the advertised price", () => {
    const result = buildApiListingDescriptor(listing(), profile());

    expect(result.payment?.price.amount).toBe("0.02");
    expect(result.payment?.price.display).toBe("$0.02");
  });

  it("says the 402 is authoritative rather than implying the price is the wire amount", () => {
    const result = buildApiListingDescriptor(listing(), profile());

    expect(result.payment?.wireAmountUnits).toBe("base");
    expect(result.payment?.authoritativeSource).toMatch(/402 response/);
  });

  it("is not payable without a receiving wallet", () => {
    const result = buildApiListingDescriptor(
      listing({ payToAddress: null }),
      profile(),
    );

    expect(result.payable).toBe(false);
    expect(result.payment).toBeNull();
    expect(result.integration).toBeNull();
  });

  it("is not invocable without a base url", () => {
    const result = buildApiListingDescriptor(
      listing({ baseUrl: null }),
      profile(),
    );

    expect(result.payable).toBe(true);
    expect(result.invocable).toBe(false);
    expect(result.resource).toBeNull();
  });

  it("points at its own machine descriptor", () => {
    const result = buildApiListingDescriptor(listing(), profile());

    expect(result.descriptor).toBe(`${result.page}/x402.json`);
  });

  it("carries only the contact the profile published", () => {
    expect(
      buildApiListingDescriptor(listing(), profile({ email: null })).contact
        .seller,
    ).toBeNull();
  });
});

describe("buildAgentDescriptor", () => {
  it("describes a sellable agent as a POST resource", () => {
    const result = buildAgentDescriptor(agent(), profile());

    expect(result.resource).toEqual({
      url: "https://agents.example.com/atlas",
      method: "POST",
    });
    expect(result.payment?.assetKind).toBe("erc20");
  });

  it("is not invocable while the agent is suspended", () => {
    expect(
      buildAgentDescriptor(agent({ status: "SUSPENDED" }), profile()).invocable,
    ).toBe(false);
  });

  it("never leaks the agent's payer wallet address", () => {
    const result = buildAgentDescriptor(
      agent({ walletAddress: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" }),
      profile(),
    );

    expect(JSON.stringify(result)).not.toContain("0xdeadbeef");
  });

  it("is not payable without an endpoint", () => {
    expect(
      buildAgentDescriptor(agent({ endpointUrl: null }), profile()).payable,
    ).toBe(false);
  });
});
