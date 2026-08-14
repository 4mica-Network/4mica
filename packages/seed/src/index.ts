import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

loadEnv({
  path: fileURLToPath(new URL("../../../apps/be/.env", import.meta.url)),
  quiet: true,
});
loadEnv({ quiet: true });

const { disconnect, prisma } = await import("@4mica/db");

/**
 * The public-profile fixture. `private` defaults to true on User, so without an
 * explicit opt-in here every profile page in @4mica/playground renders a 404.
 */
const PROFILE = {
  clerkUserId: "user_seed_4mica_workspace",
  username: "4mica-workspace",
  name: "4Mica Workspace",
  email: "workspace@4mica.io",
  bio: "Credit-layer infrastructure for the agentic economy.",
  description:
    "We run settlement agents and publish the APIs that let autonomous agents transact on credit. Everything on this profile is live in sandbox mode.",
  avatarUrl: null,
} as const;

/**
 * One agent, fully populated.
 *
 * ACTIVE + PUBLIC and on a network, because anything less renders a degraded
 * page: a non-ACTIVE agent shows the "cannot sign payments yet" warning, and a
 * non-PUBLIC one is absent from the profile index.
 *
 * Addresses are lower-case on purpose — a mixed-case address is only valid if
 * its EIP-55 checksum is right, and a hand-written one would fail validation in
 * any tool the reader pastes it into.
 */
const AGENTS = [
  {
    slug: "atlas-research",
    name: "Atlas Research Agent",
    headline: "Long-horizon market research with cited sources.",
    description:
      "Atlas crawls primary sources, reconciles conflicting numbers and returns a cited brief. It pays per query on the 4Mica credit layer, so a research run needs no prepaid balance and no gas on the request path.",
    walletAddress: "0x7a9f3c4b2e8d5a1f6c0b4e9d2a8c3f5b7e1d6a04",
    status: "ACTIVE",
    visibility: "PUBLIC",
    creditLimit: "2500",
    network: "BASE_SEPOLIA",
  },
] as const;

/** Canonical USDC on Base Sepolia. */
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

/**
 * One API listing, fully populated.
 *
 * Priced in USDC rather than the native asset so the fixture exercises the
 * ERC-20 branch — the harder of the two paths to get right.
 *
 * The payment fields are what make the playground's integration snippets real:
 * without `network` and `payToAddress` a listing renders the "not accepting
 * payments yet" note instead of code.
 */
const API_LISTINGS = [
  {
    slug: "credit-limits",
    name: "Credit Limits API",
    summary:
      "Read and reserve credit for an agent before it commits to a trade.",
    description:
      "Check an agent's available credit, place a hold, and release or capture it once the counterparty settles. Holds expire automatically, so a crashed agent never strands its own limit.",
    baseUrl: "https://api.4mica.io/v1/credit",
    docsUrl: "https://docs.4mica.io/api-reference/credit-limits",
    category: "Credit",
    tags: ["credit", "settlement", "agents"],
    priceLabel: "$0.01 per call",
    visibility: "PUBLIC",
    network: "BASE_SEPOLIA",
    payToAddress: "0x4e2b8f6a1c9d3b5e7a0f2d4c6b8a1e3f5c7d9b02",
    assetAddress: USDC_BASE_SEPOLIA,
    priceAmount: "0.01",
    priceCurrency: "USD",
    x402Endpoint: "https://api.4mica.io/v1/credit/x402",
    endpoints: [
      {
        method: "GET",
        path: "/limits",
        summary: "Available credit for an agent.",
        priceAmount: null,
        sortOrder: 0,
      },
      {
        method: "POST",
        path: "/holds",
        summary: "Place a hold against an agent's limit.",
        priceAmount: "0.05",
        sortOrder: 1,
      },
      {
        method: "DELETE",
        path: "/holds/:id",
        summary: "Release a hold before it expires.",
        priceAmount: null,
        sortOrder: 2,
      },
    ],
  },
] as const;

const seed = async (): Promise<void> => {
  const profileFields = {
    username: PROFILE.username,
    name: PROFILE.name,
    email: PROFILE.email,
    emailVerified: true,
    bio: PROFILE.bio,
    description: PROFILE.description,
    avatarUrl: PROFILE.avatarUrl,
    // The public-profile opt-in. Leave any of these at their defaults and the
    // playground correctly refuses to render the page.
    private: false,
    hidden: false,
    verified: true,
    allowSEOIndexing: true,
    allowEmailVisibility: true,
    allowPhoneNumberVisibility: false,
    completeOnboarding: true,
    isSeeded: true,
  };

  const owner = await prisma.user.upsert({
    where: { clerkUserId: PROFILE.clerkUserId },
    update: profileFields,
    create: { clerkUserId: PROFILE.clerkUserId, ...profileFields },
    select: { id: true },
  });

  /**
   * Convergence runs BEFORE the upserts, not after.
   *
   * The agent upsert is keyed on `walletAddress`, so changing an address in the
   * fixture is a create — which then collides with the stale row still holding
   * that `@@unique([ownerId, slug])`. Clearing first frees both keys.
   */
  await prisma.agent.deleteMany({
    where: {
      ownerId: owner.id,
      walletAddress: { notIn: AGENTS.map((agent) => agent.walletAddress) },
    },
  });

  // `api_endpoints` cascades on its FK, so a dropped listing takes its routes.
  await prisma.apiListing.deleteMany({
    where: {
      ownerId: owner.id,
      slug: { notIn: API_LISTINGS.map((listing) => listing.slug) },
    },
  });

  for (const agent of AGENTS) {
    const fields = {
      ownerId: owner.id,
      slug: agent.slug,
      name: agent.name,
      headline: agent.headline,
      description: agent.description,
      status: agent.status,
      visibility: agent.visibility,
      creditLimit: agent.creditLimit,
      network: agent.network,
    };

    await prisma.agent.upsert({
      where: { walletAddress: agent.walletAddress },
      update: fields,
      create: { walletAddress: agent.walletAddress, ...fields },
    });
  }

  for (const listing of API_LISTINGS) {
    const fields = {
      name: listing.name,
      summary: listing.summary,
      description: listing.description,
      baseUrl: listing.baseUrl,
      docsUrl: listing.docsUrl,
      category: listing.category,
      tags: [...listing.tags],
      priceLabel: listing.priceLabel,
      visibility: listing.visibility,
      publishedAt: new Date(),
      network: listing.network,
      payToAddress: listing.payToAddress,
      assetAddress: listing.assetAddress,
      priceAmount: listing.priceAmount,
      priceCurrency: listing.priceCurrency,
      x402Endpoint: listing.x402Endpoint,
    };

    const row = await prisma.apiListing.upsert({
      where: { ownerId_slug: { ownerId: owner.id, slug: listing.slug } },
      update: fields,
      create: { ownerId: owner.id, slug: listing.slug, ...fields },
      select: { id: true },
    });

    for (const endpoint of listing.endpoints) {
      const endpointFields = {
        summary: endpoint.summary,
        priceAmount: endpoint.priceAmount,
        sortOrder: endpoint.sortOrder,
      };

      await prisma.apiEndpoint.upsert({
        where: {
          listingId_method_path: {
            listingId: row.id,
            method: endpoint.method,
            path: endpoint.path,
          },
        },
        update: endpointFields,
        create: {
          listingId: row.id,
          method: endpoint.method,
          path: endpoint.path,
          ...endpointFields,
        },
      });
    }

    // Drop routes a previous seed created that are no longer in the fixture, so
    // re-seeding after an edit converges instead of accumulating.
    await prisma.apiEndpoint.deleteMany({
      where: {
        listingId: row.id,
        NOT: listing.endpoints.map((endpoint) => ({
          method: endpoint.method,
          path: endpoint.path,
        })),
      },
    });
  }

  const [agents, listings, endpoints] = await Promise.all([
    prisma.agent.count(),
    prisma.apiListing.count(),
    prisma.apiEndpoint.count(),
  ]);

  const plural = (count: number, noun: string) =>
    `${count} ${noun}${count === 1 ? "" : "s"}`;

  console.info(
    `[@4mica/seed] upserted profile @${PROFILE.username}, ${plural(AGENTS.length, "agent")} and ${plural(API_LISTINGS.length, "api listing")} (${agents} agent rows, ${listings} listing rows, ${endpoints} endpoint rows total).`,
  );
};

try {
  await seed();
} catch (error) {
  console.error("[@4mica/seed] seeding failed:", error);
  process.exitCode = 1;
} finally {
  await disconnect();
}
