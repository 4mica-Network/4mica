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

const AGENTS = [
  {
    slug: "atlas-research",
    name: "Atlas Research Agent",
    headline: "Long-horizon market research with cited sources.",
    description:
      "Atlas crawls primary sources, reconciles conflicting numbers and returns a cited brief. It settles per-query on the 4Mica credit layer.",
    walletAddress: "0x1111111111111111111111111111111111111111",
    status: "ACTIVE",
    visibility: "PUBLIC",
    creditLimit: "2500",
  },
  {
    slug: "helios-trading",
    name: "Helios Trading Agent",
    headline: "Execution agent for allow-listed venues.",
    description:
      "Helios routes orders across allow-listed venues and posts settlement intents. Credit limits are enforced before execution, not after.",
    walletAddress: "0x2222222222222222222222222222222222222222",
    status: "ACTIVE",
    visibility: "PUBLIC",
    creditLimit: "10000",
  },
  {
    slug: "vega-settlement",
    name: "Vega Settlement Agent",
    headline: "Net-settles agent obligations on a fixed cadence.",
    description:
      "Vega batches outstanding obligations and settles them net, so counterparties exchange one transfer instead of hundreds.",
    walletAddress: "0x3333333333333333333333333333333333333333",
    status: "PENDING",
    visibility: "UNLISTED",
    creditLimit: "0",
  },
  {
    slug: "orion-data",
    name: "Orion Data Agent",
    headline: "Streams normalised market data to subscriber agents.",
    description:
      "Orion normalises feeds from multiple providers into one schema and bills subscribers per message.",
    walletAddress: "0x4444444444444444444444444444444444444444",
    status: "SUSPENDED",
    visibility: "PRIVATE",
    creditLimit: "500",
  },
] as const;

const API_LISTINGS = [
  {
    slug: "credit-limits",
    name: "Credit Limits API",
    summary:
      "Read and reserve credit for an agent before it commits to a trade.",
    description:
      "Check an agent's available credit, place a hold, and release or capture it once the counterparty settles. Holds expire automatically so a crashed agent never strands its own limit.",
    baseUrl: "https://api.4mica.io/v1/credit",
    docsUrl: "https://4mica.io/docs/credit-limits",
    category: "Credit",
    tags: ["credit", "settlement", "agents"],
    priceLabel: "Free in sandbox",
    visibility: "PUBLIC",
  },
  {
    slug: "settlement-events",
    name: "Settlement Events API",
    summary: "Webhook and polling access to the settlement event stream.",
    description:
      "Subscribe to payment.succeeded, payment.failed and agent.suspended events. Every delivery is signed, and replays are available for 30 days.",
    baseUrl: "https://api.4mica.io/v1/events",
    docsUrl: "https://4mica.io/docs/settlement-events",
    category: "Events",
    tags: ["webhooks", "events"],
    priceLabel: "Usage-based",
    visibility: "PUBLIC",
  },
  {
    slug: "agent-registry",
    name: "Agent Registry API",
    summary: "Resolve an agent's wallet, status and credit standing.",
    description:
      "Look up an agent by wallet address or handle before transacting with it. Returns status and credit standing, never the counterparty's limit.",
    baseUrl: "https://api.4mica.io/v1/registry",
    docsUrl: "https://4mica.io/docs/agent-registry",
    category: "Identity",
    tags: ["registry", "identity", "agents"],
    priceLabel: "Free",
    visibility: "UNLISTED",
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
    };

    await prisma.apiListing.upsert({
      where: { ownerId_slug: { ownerId: owner.id, slug: listing.slug } },
      update: fields,
      create: { ownerId: owner.id, slug: listing.slug, ...fields },
    });
  }

  const [agents, listings] = await Promise.all([
    prisma.agent.count(),
    prisma.apiListing.count(),
  ]);

  console.info(
    `[@4mica/seed] upserted profile @${PROFILE.username}, ${AGENTS.length} agents and ${API_LISTINGS.length} api listings (${agents} agent rows, ${listings} listing rows total).`,
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
