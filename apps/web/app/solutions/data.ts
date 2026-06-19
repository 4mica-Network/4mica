export type SolutionPoint = {
  title: string;
  desc: string;
  icon: string;
};

export type SolutionContent = {
  slug: string;
  label: string;
  icon: string;
  description: string;
  headline: string;
  intro: string;
  points: SolutionPoint[];
};

export const solutions: SolutionContent[] = [
  {
    slug: "agentic-commerce",
    label: "Agentic commerce",
    icon: "ri-robot-2-line",
    description: "Payments for AI agents",
    headline: "Payments built for autonomous agents.",
    intro:
      "Give AI agents a way to transact in real time. Agents sign off-chain guarantees and spend against pooled collateral, so every request settles instantly without prefunding or clearing on-chain.",
    points: [
      {
        title: "Pay per request",
        desc: "Agents spend on credit and settle later — no balance top-ups before each call.",
        icon: "ri-flashlight-line",
      },
      {
        title: "No gas per call",
        desc: "Thousands of spends batch into one on-chain settlement per cycle.",
        icon: "ri-gas-station-line",
      },
      {
        title: "x402-native",
        desc: "Drop-in credit scheme for the x402 standard your agents already speak.",
        icon: "ri-route-line",
      },
    ],
  },
  {
    slug: "ai-companies",
    label: "AI companies",
    icon: "ri-brain-line",
    description: "Charge per API call",
    headline: "Usage-based billing for AI products.",
    intro:
      "Charge for inference, tools, and API calls with credit-backed settlement. Customers pay as they go while your collateral earns yield, making per-task pricing viable at scale.",
    points: [
      {
        title: "Per-call monetization",
        desc: "Bill each request with cryptographic guarantees instead of invoices.",
        icon: "ri-cpu-line",
      },
      {
        title: "Yield on collateral",
        desc: "Deposits route through Aave and accrue yield while they back payments.",
        icon: "ri-percent-line",
      },
      {
        title: "Production-ready SDKs",
        desc: "TypeScript and Python clients wrap your existing HTTP stack.",
        icon: "ri-terminal-box-line",
      },
    ],
  },
  {
    slug: "cryptocurrency",
    label: "Cryptocurrency",
    icon: "ri-coin-line",
    description: "On-chain settlement",
    headline: "Instant settlement across chains.",
    intro:
      "Move at off-chain speed without giving up on-chain guarantees. 4Mica issues BLS-signed certificates that settle on the parent chain, so value never leaks and disputes stay enforceable.",
    points: [
      {
        title: "On-chain guarantees",
        desc: "Every credit spend is backed by enforceable, auditable collateral.",
        icon: "ri-shield-check-line",
      },
      {
        title: "Multi-chain ready",
        desc: "The same credit rails work across Ethereum, Base, and emerging rollups.",
        icon: "ri-links-line",
      },
      {
        title: "Non-custodial",
        desc: "Collateral stays in your control — 4Mica never holds funds.",
        icon: "ri-safe-2-line",
      },
    ],
  },
  {
    slug: "marketplaces",
    label: "Marketplaces",
    icon: "ri-store-2-line",
    description: "Batch buyer payouts",
    headline: "Net settlement for two-sided markets.",
    intro:
      "Replace thousands of individual transfers with one net settlement per cycle. Buyers spend on credit, sellers get guaranteed payouts, and the on-chain footprint stays tiny.",
    points: [
      {
        title: "Batch settlement",
        desc: "Aggregate a full cycle of payments into a single on-chain transaction.",
        icon: "ri-stack-line",
      },
      {
        title: "Guaranteed payouts",
        desc: "Signed guarantees make every seller payment auditable and recoverable.",
        icon: "ri-hand-coin-line",
      },
      {
        title: "Lower fees",
        desc: "Cut gas overhead that makes micro-transactions uneconomical.",
        icon: "ri-coins-line",
      },
    ],
  },
  {
    slug: "platforms",
    label: "Platforms",
    icon: "ri-stack-line",
    description: "Built-in usage billing",
    headline: "Billing infrastructure for platforms.",
    intro:
      "Give every builder on your platform credit-backed, usage-based payments out of the box. One integration adds metered settlement for all of your tenants.",
    points: [
      {
        title: "Embed once",
        desc: "Add the middleware once and expose credit payments to every tenant.",
        icon: "ri-puzzle-line",
      },
      {
        title: "Configurable terms",
        desc: "Tune TTLs, collateral ratios, and SLAs per customer.",
        icon: "ri-settings-3-line",
      },
      {
        title: "Composable",
        desc: "Works with any service that accepts crypto, on-chain or off.",
        icon: "ri-links-line",
      },
    ],
  },
  {
    slug: "enterprises",
    label: "Enterprises",
    icon: "ri-building-2-line",
    description: "Credit rails at scale",
    headline: "Credit rails for serious volume.",
    intro:
      "Run high-volume payments with auditable settlement, clear failure modes, and configurable SLAs. Every guarantee is enforceable on-chain and recoverable by design.",
    points: [
      {
        title: "Auditable by default",
        desc: "Every tab, guarantee, and settlement is verifiable end to end.",
        icon: "ri-file-shield-2-line",
      },
      {
        title: "Configurable SLAs",
        desc: "Set service terms and dispute windows that match your contracts.",
        icon: "ri-shield-keyhole-line",
      },
      {
        title: "Operational tooling",
        desc: "Clear failure modes and monitoring from day one.",
        icon: "ri-dashboard-3-line",
      },
    ],
  },
  {
    slug: "startups",
    label: "Startups",
    icon: "ri-rocket-2-line",
    description: "Live in three lines",
    headline: "Payments that scale with you.",
    intro:
      "Add credit-based payments in three lines and scale without rebuilding. Start on testnets, move to production, and keep the same integration the whole way.",
    points: [
      {
        title: "Three lines to integrate",
        desc: "Wrap your existing fetch or middleware and you're live.",
        icon: "ri-code-s-slash-line",
      },
      {
        title: "No new wallet",
        desc: "Works with the accounts and HTTP clients you already use.",
        icon: "ri-wallet-3-line",
      },
      {
        title: "Grow without limits",
        desc: "The same rails handle your first call and your millionth.",
        icon: "ri-line-chart-line",
      },
    ],
  },
];

export const solutionSlugs = solutions.map((s) => s.slug);

export const getSolution = (slug: string): SolutionContent | undefined =>
  solutions.find((s) => s.slug === slug);
