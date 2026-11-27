import type { PublicAgent } from "@/schema/agent";
import type { PublicApiListing } from "@/schema/api-listing";

export const SETUP_GAPS = ["wallet", "endpoint", "price"] as const;

export type SetupGap = (typeof SETUP_GAPS)[number];

const gaps = (missing: Record<SetupGap, boolean>): SetupGap[] =>
  SETUP_GAPS.filter((gap) => missing[gap]);

export const listingGaps = (listing: PublicApiListing): SetupGap[] =>
  gaps({
    wallet: listing.network === null || listing.payToAddress === null,
    endpoint: listing.url === null,
    price: listing.priceAmount === null,
  });

export const agentGaps = (agent: PublicAgent): SetupGap[] =>
  gaps({
    wallet: agent.payToAddress === null,
    endpoint: agent.endpointUrl === null,
    price: agent.priceAmount === null,
  });
