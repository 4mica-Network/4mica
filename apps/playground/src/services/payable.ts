import "server-only";

import type { Prisma } from "./db";

export const PAYABLE_LISTING = {
  network: { not: null },
  payToAddress: { not: null },
  url: { not: null },
  priceAmount: { not: null },
} satisfies Prisma.ApiListingWhereInput;

export const PAYABLE_AGENT = {
  payToAddress: { not: null },
  endpointUrl: { not: null },
  priceAmount: { not: null },
} satisfies Prisma.AgentWhereInput;
