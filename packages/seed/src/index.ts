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

/** Canonical USDC on Base Sepolia. */
const USDC_BASE_SEPOLIA = "0x036cbd53842c5426634e7929541ec2318f3dcf7e";

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
    status: "ACTIVE",
    visibility: "PUBLIC",
    network: "BASE_SEPOLIA",

    walletAddress: "0x7a9f3c4b2e8d5a1f6c0b4e9d2a8c3f5b7e1d6a04",
    creditLimit: "2500",

    payToAddress: "0x3d8e1f5a7c9b2d4e6a8c0f2b4d6e8a1c3f5b7d09",
    assetAddress: USDC_BASE_SEPOLIA,
    priceAmount: "0.002",
    priceCurrency: "USD",
    priceLabel: "$0.002 per research run",
    endpointUrl: "https://agents.4mica.io/atlas/brief",
    x402Endpoint: "https://agents.4mica.io/atlas/x402",
    docsUrl: "https://docs.4mica.io/agents/atlas",
  },
] as const;

const WALLETS = [
  {
    label: "Atlas payer",
    description: "Signs payment guarantees for the Atlas research agent.",
    address: "0x7a9f3c4b2e8d5a1f6c0b4e9d2a8c3f5b7e1d6a04",
    network: "BASE_SEPOLIA",
    role: "PAYER",
    status: "ACTIVE",
    isDefault: false,
    verifiedChainId: 84532,
  },
  {
    label: "Atlas earnings",
    description: "Receives payment for Atlas research runs.",
    address: "0x3d8e1f5a7c9b2d4e6a8c0f2b4d6e8a1c3f5b7d09",
    network: "BASE_SEPOLIA",
    role: "RECIPIENT",
    status: "ACTIVE",
    isDefault: false,
    verifiedChainId: 84532,
  },
  {
    label: "Settlement treasury",
    description: "Receives settlement for the credit-limits listing.",
    address: "0x4f2c8b6d1e9a3f5c7b0d2e4a6c8f1b3d5e7a9c02",
    network: "BASE_SEPOLIA",
    role: "RECIPIENT",
    status: "ACTIVE",
    isDefault: true,
    verifiedChainId: 84532,
  },
] as const;

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
    payToAddress: "0x4f2c8b6d1e9a3f5c7b0d2e4a6c8f1b3d5e7a9c02",
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

const poster = (label: string, fill: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">` +
      `<rect width="320" height="180" fill="${fill}"/>` +
      `<text x="50%" y="53%" fill="#7BCBFF" font-family="sans-serif" font-size="15" text-anchor="middle">${label}</text>` +
      `</svg>`,
  )}`;

const SAMPLE_VIDEO =
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

const inNinetyDays = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

const PAYMENTS = [
  { monthsAgo: 4, direction: "in", amount: "0.01", status: "SETTLED", day: 4 },
  { monthsAgo: 4, direction: "in", amount: "0.01", status: "SETTLED", day: 19 },
  { monthsAgo: 3, direction: "in", amount: "0.05", status: "SETTLED", day: 2 },
  { monthsAgo: 3, direction: "in", amount: "0.01", status: "FAILED", day: 8 },
  { monthsAgo: 2, direction: "in", amount: "0.05", status: "SETTLED", day: 11 },
  { monthsAgo: 2, direction: "in", amount: "0.01", status: "SETTLED", day: 14 },
  {
    monthsAgo: 2,
    direction: "out",
    amount: "0.002",
    status: "SETTLED",
    day: 21,
  },
  { monthsAgo: 1, direction: "in", amount: "0.05", status: "SETTLED", day: 3 },
  { monthsAgo: 1, direction: "in", amount: "0.05", status: "SETTLED", day: 9 },
  { monthsAgo: 1, direction: "in", amount: "0.01", status: "SETTLED", day: 17 },
  {
    monthsAgo: 1,
    direction: "out",
    amount: "0.002",
    status: "SETTLED",
    day: 23,
  },
  { monthsAgo: 0, direction: "in", amount: "0.05", status: "SETTLED", day: 2 },
  { monthsAgo: 0, direction: "in", amount: "0.05", status: "SETTLED", day: 5 },
  { monthsAgo: 0, direction: "in", amount: "0.01", status: "PENDING", day: 6 },
  {
    monthsAgo: 0,
    direction: "out",
    amount: "0.002",
    status: "SETTLED",
    day: 7,
  },
] as const;

const CUSTOMER_ADDRESS = "0x8a1c3f5b7d092e4a6c8b0d2f4e6a8c1b3d5f7e90";

const REVIEWERS = [
  {
    clerkUserId: "user_seed_buyer_dana",
    username: "dana-builds",
    name: "Dana Okafor",
    email: "dana@example.com",
  },
  {
    clerkUserId: "user_seed_buyer_linus",
    username: "linus-ships",
    name: "Linus Marek",
    email: "linus@example.com",
  },
] as const;

const LISTING_REVIEWS = [
  {
    reviewer: 0,
    rating: 5,
    title: "Settled every call, no surprises",
    body: "Ran about 400 lookups over two weeks. Median latency around 280ms and the 402 handshake never needed a retry. The certificate in X-PAYMENT-RESPONSE matches what my ledger recorded.",
    verifiedPurchase: true,
    ownerReply: null,
  },
  {
    reviewer: 1,
    rating: 3,
    title: "Works, but the docs lagged the API",
    body: "The response added a field that the docs did not mention, which broke my parser for a day. Support answered the next morning.",
    verifiedPurchase: true,
    ownerReply:
      "Fair — the docs are regenerated from the schema now, so this cannot drift again. Thanks for the nudge.",
  },
] as const;

const AGENT_REVIEWS = [
  {
    reviewer: 0,
    rating: 4,
    title: "Good citations, slow on long briefs",
    body: "Sources check out and it declines rather than inventing one when it cannot find anything. A 20-page brief took closer to four minutes than the one it advertises.",
    verifiedPurchase: false,
    ownerReply: null,
  },
] as const;

const LISTING_POLICY = {
  refundPolicy:
    "Any 5xx, timeout, or empty body is refunded automatically within one settlement cycle — you do not need to ask. Email us for anything the automation misses.",
  uptimeTarget: "99.9% monthly, measured at the edge",
  supportResponse: "Within one business day",
  supportEmail: "api-support@4mica.io",
  rateLimit: "60 requests/minute per payer address",
  dataRetention:
    "Request payloads are held for 24 hours for debugging, then deleted. We never train on them.",
  testEndpoint: "https://api.4mica.io/sandbox/limits",
  termsUrl: "https://4mica.io/terms",
  privacyUrl: "https://4mica.io/privacy",
  statusUrl: "https://status.4mica.io",
} as const;

const AGENT_POLICY = {
  refundPolicy:
    "If a brief comes back with no usable sources we refund the run in full.",
  uptimeTarget: "99.5% monthly",
  supportResponse: "Within two business days",
  supportEmail: null,
  rateLimit: "10 concurrent briefs per payer",
  dataRetention: "Prompts are retained for 7 days, then deleted.",
  testEndpoint: null,
  termsUrl: "https://4mica.io/terms",
  privacyUrl: "https://4mica.io/privacy",
  statusUrl: null,
} as const;

const LISTING_FAQS = [
  {
    question: "What happens if a call times out?",
    answer:
      "Anything over 10s is cut off and refunded on the next settlement cycle. You are never charged for a response you did not get.",
  },
  {
    question: "Do you rate limit?",
    answer:
      "60 requests per minute per payer address. Burst above that and you get a 429 with a Retry-After header — 429s are never charged.",
  },
  {
    question: "Is there a sandbox I can try first?",
    answer:
      "Yes. https://api.4mica.io/sandbox/limits returns the same shape with fixture data and costs nothing.",
  },
] as const;

const AGENT_FAQS = [
  {
    question: "How long does a brief take?",
    answer:
      "Most finish inside 90 seconds. A brief spanning more than 20 sources can take four minutes.",
  },
  {
    question: "What happens if it finds no sources?",
    answer:
      "It returns an empty result rather than inventing citations, and the run is refunded in full.",
  },
] as const;

const LISTING_REPORT = {
  reviewer: 1,
  reason: "NOT_WORKING",
  detail:
    "Three calls in a row returned 502 around 09:00 UTC. Request id 0x8f21. Charged for one of them.",
} as const;

const BANNERS = [
  {
    slug: "series-a-1m",
    title: "We raised $1M",
    message:
      "Seed round closed. We're putting it into faster settlement and higher credit limits.",
    url: "https://4mica.io/blog",
    thumbnailUrl: null,
    videoUrl: null,
    alt: null,
    isVideo: false,
    priority: 30,
    active: true,
    startsAt: null,
    endsAt: inNinetyDays,
  },
  {
    slug: "integrate-with-4mica",
    title: "Integrate with 4Mica",
    message:
      "Two minutes: issue an API key, sign your first payment, settle on Base.",
    url: "https://docs.4mica.io",
    thumbnailUrl: poster("Integration walkthrough", "#123c4a"),
    videoUrl: SAMPLE_VIDEO,
    alt: "Integration walkthrough",
    isVideo: true,
    priority: 20,
    active: true,
    startsAt: null,
    endsAt: null,
  },
  {
    slug: "set-up-your-account",
    title: "Finish setting up",
    message:
      "Add your business details and verify KYB so payouts can reach you.",
    url: "https://docs.4mica.io",
    thumbnailUrl: poster("Account setup", "#0f2a2e"),
    videoUrl: SAMPLE_VIDEO,
    alt: "Account setup walkthrough",
    isVideo: true,
    priority: 10,
    active: true,
    startsAt: null,
    endsAt: null,
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

  await prisma.wallet.deleteMany({
    where: {
      ownerId: owner.id,
      address: { notIn: WALLETS.map((wallet) => wallet.address) },
    },
  });

  const walletIds = new Map<string, string>();
  const walletKey = (address: string, network: string) =>
    `${address}:${network}`;

  for (const wallet of WALLETS) {
    const fields = {
      label: wallet.label,
      description: wallet.description,
      role: wallet.role,
      status: wallet.status,
      isDefault: wallet.isDefault,
      verifiedAt: new Date(),
      verificationMethod: "EOA_SIGNATURE" as const,
      verifiedChainId: wallet.verifiedChainId,
    };

    const row = await prisma.wallet.upsert({
      where: {
        ownerId_address_network: {
          ownerId: owner.id,
          address: wallet.address,
          network: wallet.network,
        },
      },
      update: fields,
      create: {
        ownerId: owner.id,
        address: wallet.address,
        network: wallet.network,
        ...fields,
      },
      select: { id: true },
    });

    walletIds.set(walletKey(wallet.address, wallet.network), row.id);
  }

  const requireWalletId = (address: string, network: string, use: string) => {
    const id = walletIds.get(walletKey(address, network));
    if (!id) {
      throw new Error(
        `${use} references ${address} on ${network}, which is not in WALLETS`,
      );
    }
    return id;
  };

  for (const agent of AGENTS) {
    const fields = {
      ownerId: owner.id,
      slug: agent.slug,
      name: agent.name,
      headline: agent.headline,
      description: agent.description,
      docsUrl: agent.docsUrl,
      status: agent.status,
      visibility: agent.visibility,
      network: agent.network,
      publishedAt: new Date(),

      creditLimit: agent.creditLimit,
      payerWalletId: requireWalletId(
        agent.walletAddress,
        agent.network,
        `agent ${agent.slug} payer wallet`,
      ),

      walletId: requireWalletId(
        agent.payToAddress,
        agent.network,
        `agent ${agent.slug} recipient wallet`,
      ),
      payToAddress: agent.payToAddress,
      assetAddress: agent.assetAddress,
      priceAmount: agent.priceAmount,
      priceCurrency: agent.priceCurrency,
      priceLabel: agent.priceLabel,
      endpointUrl: agent.endpointUrl,
      x402Endpoint: agent.x402Endpoint,
    };

    await prisma.agent.upsert({
      where: {
        walletAddress_network: {
          walletAddress: agent.walletAddress,
          network: agent.network,
        },
      },
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
      walletId: requireWalletId(
        listing.payToAddress,
        listing.network,
        `listing ${listing.slug} recipient wallet`,
      ),
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

  await prisma.banner.deleteMany({
    where: { slug: { notIn: BANNERS.map((item) => item.slug) } },
  });

  for (const item of BANNERS) {
    const fields = {
      title: item.title,
      message: item.message,
      url: item.url,
      thumbnailUrl: item.thumbnailUrl,
      videoUrl: item.videoUrl,
      alt: item.alt,
      isVideo: item.isVideo,
      priority: item.priority,
      active: item.active,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
    };

    await prisma.banner.upsert({
      where: { slug: item.slug },
      update: fields,
      create: { slug: item.slug, ...fields },
      select: { id: true },
    });
  }

  const TREASURY = "0x4f2c8b6d1e9a3f5c7b0d2e4a6c8f1b3d5e7a9c02";
  const ATLAS_PAYER = "0x7a9f3c4b2e8d5a1f6c0b4e9d2a8c3f5b7e1d6a04";

  const listingRow = await prisma.apiListing.findFirst({
    where: { ownerId: owner.id, slug: API_LISTINGS[0].slug },
    select: { id: true },
  });

  await prisma.payment.deleteMany({
    where: { ownerId: owner.id, reqId: { startsWith: "0xseed" } },
  });

  const now = new Date();
  for (const [index, entry] of PAYMENTS.entries()) {
    const when = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() - entry.monthsAgo,
        entry.day,
        12,
      ),
    );
    const incoming = entry.direction === "in";

    await prisma.payment.create({
      data: {
        ownerId: owner.id,
        listingId: incoming ? (listingRow?.id ?? null) : null,
        payerAddress: incoming ? CUSTOMER_ADDRESS : ATLAS_PAYER,
        recipientAddress: incoming ? TREASURY : CUSTOMER_ADDRESS,
        network: "BASE_SEPOLIA",
        assetAddress: USDC_BASE_SEPOLIA,
        amount: entry.amount,
        status: entry.status,
        failureReason:
          entry.status === "FAILED"
            ? "The payer had no free collateral for this asset."
            : null,
        reqId: `0xseed${index.toString(16).padStart(4, "0")}`,
        resource: incoming
          ? `${API_LISTINGS[0].baseUrl}/limits`
          : "https://agents.4mica.io/atlas/brief",
        description: incoming ? "Credit limit lookup" : "Research run",
        settledAt: entry.status === "SETTLED" ? when : null,
        createdAt: when,
      },
    });
  }

  const agentRow = await prisma.agent.findFirst({
    where: { ownerId: owner.id, slug: AGENTS[0].slug },
    select: { id: true },
  });

  const reviewers = [];
  for (const entry of REVIEWERS) {
    const fields = {
      username: entry.username,
      name: entry.name,
      email: entry.email,
      emailVerified: true,
      private: false,
      completeOnboarding: true,
      isSeeded: true,
    };

    reviewers.push(
      await prisma.user.upsert({
        where: { clerkUserId: entry.clerkUserId },
        update: fields,
        create: { clerkUserId: entry.clerkUserId, ...fields },
        select: { id: true },
      }),
    );
  }

  if (listingRow) {
    for (const entry of LISTING_REVIEWS) {
      const authorId = reviewers[entry.reviewer].id;
      await prisma.review.upsert({
        where: { listingId_authorId: { listingId: listingRow.id, authorId } },
        update: {
          rating: entry.rating,
          title: entry.title,
          body: entry.body,
          verifiedPurchase: entry.verifiedPurchase,
          ownerReply: entry.ownerReply,
          ownerRepliedAt: entry.ownerReply ? new Date() : null,
        },
        create: {
          listingId: listingRow.id,
          authorId,
          rating: entry.rating,
          title: entry.title,
          body: entry.body,
          verifiedPurchase: entry.verifiedPurchase,
          ownerReply: entry.ownerReply,
          ownerRepliedAt: entry.ownerReply ? new Date() : null,
        },
      });
    }

    const existingPolicy = await prisma.resourcePolicy.findFirst({
      where: { listingId: listingRow.id },
      select: { id: true },
    });

    if (existingPolicy) {
      await prisma.resourcePolicy.update({
        where: { id: existingPolicy.id },
        data: LISTING_POLICY,
      });
    } else {
      await prisma.resourcePolicy.create({
        data: { listingId: listingRow.id, ...LISTING_POLICY },
      });
    }

    const reporterId = reviewers[LISTING_REPORT.reviewer].id;
    const openReport = await prisma.report.findFirst({
      where: { listingId: listingRow.id, reporterId },
      select: { id: true },
    });

    if (!openReport) {
      await prisma.report.create({
        data: {
          listingId: listingRow.id,
          reporterId,
          reason: LISTING_REPORT.reason,
          detail: LISTING_REPORT.detail,
        },
      });
    }
    await prisma.faqItem.deleteMany({ where: { listingId: listingRow.id } });
    for (const [index, entry] of LISTING_FAQS.entries()) {
      await prisma.faqItem.create({
        data: {
          listingId: listingRow.id,
          question: entry.question,
          answer: entry.answer,
          sortOrder: index,
        },
      });
    }
  }

  if (agentRow) {
    await prisma.faqItem.deleteMany({ where: { agentId: agentRow.id } });
    for (const [index, entry] of AGENT_FAQS.entries()) {
      await prisma.faqItem.create({
        data: {
          agentId: agentRow.id,
          question: entry.question,
          answer: entry.answer,
          sortOrder: index,
        },
      });
    }
    for (const entry of AGENT_REVIEWS) {
      const authorId = reviewers[entry.reviewer].id;
      await prisma.review.upsert({
        where: { agentId_authorId: { agentId: agentRow.id, authorId } },
        update: {
          rating: entry.rating,
          title: entry.title,
          body: entry.body,
          verifiedPurchase: entry.verifiedPurchase,
        },
        create: {
          agentId: agentRow.id,
          authorId,
          rating: entry.rating,
          title: entry.title,
          body: entry.body,
          verifiedPurchase: entry.verifiedPurchase,
        },
      });
    }

    const existingAgentPolicy = await prisma.resourcePolicy.findFirst({
      where: { agentId: agentRow.id },
      select: { id: true },
    });

    if (existingAgentPolicy) {
      await prisma.resourcePolicy.update({
        where: { id: existingAgentPolicy.id },
        data: AGENT_POLICY,
      });
    } else {
      await prisma.resourcePolicy.create({
        data: { agentId: agentRow.id, ...AGENT_POLICY },
      });
    }
  }

  const [agents, wallets, listings, endpoints, banners, payments] =
    await Promise.all([
      prisma.agent.count(),
      prisma.wallet.count(),
      prisma.apiListing.count(),
      prisma.apiEndpoint.count(),
      prisma.banner.count(),
      prisma.payment.count(),
    ]);

  const plural = (count: number, noun: string) =>
    `${count} ${noun}${count === 1 ? "" : "s"}`;

  console.info(
    `[@4mica/seed] upserted profile @${PROFILE.username}, ${plural(AGENTS.length, "agent")}, ${plural(WALLETS.length, "wallet")}, ${plural(API_LISTINGS.length, "api listing")} ${plural(BANNERS.length, "banner")} and ${plural(PAYMENTS.length, "payment")} (${agents} agent rows, ${wallets} wallet rows, ${listings} listing rows, ${endpoints} endpoint rows, ${banners} banner rows, ${payments} payment rows total).`,
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
