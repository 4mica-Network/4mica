import { describe, expect, it, vi } from "vitest";
import type { PublicAgent } from "@/schema/agent";
import type { PublicApiListing } from "@/schema/api-listing";
import { agentGaps, listingGaps } from "./payable";

vi.mock("server-only", () => ({}));

const { PAYABLE_AGENT, PAYABLE_LISTING } = await import("@/services/payable");

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

type Row = Record<string, unknown>;

const satisfies = (where: Row, row: Row): boolean =>
  Object.entries(where).every(([field, condition]) => {
    expect(condition, `${field} must be filtered as { not: null }`).toEqual({
      not: null,
    });
    return row[field] !== null;
  });

const subsets = <T>(items: T[]): T[][] =>
  Array.from({ length: 2 ** items.length }, (_, mask) =>
    items.filter((_, bit) => mask & (1 << bit)),
  );

const rulesAgree = <T extends Row>(
  complete: T,
  where: Row,
  gaps: (row: T) => unknown[],
) => {
  const blank = (fields: string[]): T => ({
    ...complete,
    ...Object.fromEntries(fields.map((field) => [field, null])),
  });
  const required = Object.keys(complete).filter(
    (field) =>
      field in where ||
      (complete[field] !== null && gaps(blank([field])).length > 0),
  );
  const cases = subsets(required);

  for (const missing of cases) {
    const row = blank(missing);
    expect(satisfies(where, row), `missing ${missing.join(", ")}`).toBe(
      gaps(row).length === 0,
    );
  }

  return cases.length;
};

describe("the database filter matches the in-memory rule", () => {
  it("agrees on every combination of listing fields", () => {
    expect(
      rulesAgree(listing() as unknown as Row, PAYABLE_LISTING, (row) =>
        listingGaps(row as unknown as PublicApiListing),
      ),
    ).toBe(16);
  });

  it("agrees on every combination of agent fields", () => {
    expect(
      rulesAgree(agent() as unknown as Row, PAYABLE_AGENT, (row) =>
        agentGaps(row as unknown as PublicAgent),
      ),
    ).toBe(8);
  });
});
