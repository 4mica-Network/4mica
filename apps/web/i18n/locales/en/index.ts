import { partners } from "./partners";

export const en = {
  partners,
  common: {
    brandName: "4Mica",
    logoAlt: "4Mica logo",
    actions: {
      talkToSales: "Talk to our team",
      tryForFree: "Try for free",
      startBuilding: "Start building",
      seeHowItWorks: "See how it works",
      chatWithUs: "Chat with us",
      starOnGithub: "Star on GitHub",
      meetTheTeam: "Meet the team",
      viewOpenRoles: "View open roles",
    },
    a11y: {
      toggleMobileMenu: "Toggle mobile menu",
      toggleMenu: "Toggle menu",
      email4Mica: "Email 4Mica",
      github: "4Mica on GitHub",
      linkedin: "4Mica on LinkedIn",
      x: "4Mica on X",
    },
  },
  navigation: {
    solutions: "Solutions",
    developers: "Developers",
    pricing: "Pricing",
    byCustomer: "By customer",
    byUseCase: "By use case",
    documentation: "Documentation",
    documentationDescription: "Guides, SDKs, and API reference",
    apiStatus: "API status",
    apiStatusDescription: "Live uptime",
    apiChangelog: "API changelog",
    apiChangelogDescription: "Releases and updates",
    librariesAndSdks: "Libraries and SDKs",
    librariesAndSdksDescription: "TypeScript and Python",
    blog: "Blog",
    blogDescription: "Engineering notes and product updates",
    partners: "Partners",
  },
  footer: {
    sections: {
      solutions: "Solutions",
      product: "Product",
      developers: "Developers",
      company: "Company",
      support: "Support",
      resources: "Resources",
    },
    product: {
      solution: "Solution",
      pricing: "Pricing",
      systemStatus: "System status",
    },
    company: {
      about: "About",
      jobs: "Jobs",
      team: "Team",
      partners: "Partners",
      roadmap: "Roadmap",
      contactSales: "Contact sales",
    },
    support: {
      getSupport: "Get support",
      managedSupportPlans: "Managed support plans",
    },
    resources: {
      blog: "Blog",
      licences: "Licences",
      restrictedBusinesses: "Prohibited and restricted businesses",
      sitemap: "Sitemap",
      privacy: "Privacy",
      terms: "Terms",
      dpa: "DPA",
    },
  },
  home: {
    hero: {
      titleLine1: "The clearing house for",
      titleLine2: "the agentic economy",
      subtitle:
        "4Mica is the credit and clearing layer for x402: agents pay for APIs with stablecoin-backed credit, earn yield on collateral, and settle net on-chain instead of clearing every request.",
      supportedOn: "Supported on",
      supportedNetworks: {
        base: "Base Mainnet",
        ethereumSepolia: "Base/Ethereum Sepolia Testnets",
        baseSepolia: "Base Sepolia",
      },
    },
    faqs: [
      {
        question: "Does 4Mica work with existing x402 clients?",
        answer:
          "Yes, as long as the client and server can register the 4mica-credit scheme. Buyers add the scheme adapter to the fetch wrapper they already use; sellers configure their x402 middleware to advertise and verify it. No change to your HTTP logic.",
      },
      {
        question: "What assets does 4Mica support?",
        answer:
          "ETH and the ERC-20 tokens enabled by the active Core deployment. USDC and USDT are the defaults where enabled, and operators can configure others. A route only accepts the asset it advertises, so check the deployment's token list before going live.",
      },
      {
        question: "How does yield work?",
        answer:
          "Configured stablecoin collateral is supplied to Aave, and the protocol holds the interest-bearing aTokens. Collateral keeps accruing while capacity is reserved for guarantees, and the yield belongs to the collateral position — the payer — not the seller. Yield is variable and not guaranteed, so verify the current deployment configuration before depositing production funds.",
      },
      {
        question: "What is a clearing layer?",
        answer:
          "It is the layer between authorizing a payment and moving money. Instead of a transfer per request, buyers sign collateral-backed guarantees that are batched into clearing cycles. A cycle accepts guarantees, closes, computes net positions, and commits those positions on-chain — the same job a clearing house does for traditional payments.",
      },
      {
        question: "How is 4Mica different from standard x402?",
        answer:
          "Standard x402 turns every request into its own on-chain transfer. 4Mica's 4mica-credit scheme authorizes the request against collateral-backed credit and settles later, so requests clear off-chain in one round trip and only net positions ever move on-chain.",
      },
      {
        question: "Who should integrate 4Mica?",
        answer:
          "x402 facilitators first: adding the 4mica-credit scheme lets every seller behind your endpoint take credit-backed payments, with 4Mica running as the clearing layer behind your brand. Then API and service providers who want to charge per request without accounts, invoices, or prepaid balances, and agent frameworks that want paid tool use built in. The fit is high-volume, low-value payments where checkout and invoicing infrastructure is the bottleneck.",
      },
      {
        question: "Are individual AI agents 4Mica customers?",
        answer:
          "No — an agent is the end user, not the counterparty. The customer is whoever operates it: the facilitator, platform, framework, or team that holds the collateral, sets the spending limits, and carries the commercial relationship. Agents spend inside those limits, which is why there is no signup aimed at agents themselves.",
      },
      {
        question: "How does 4Mica reduce settlement costs?",
        answer:
          "Authorization is separated from settlement. Per request there is an off-chain signature and a Core verification — no chain write, no gas. Payable guarantees then enter a clearing cycle and settle as net positions: 40 outgoing and 27 incoming guarantees become a single net debit of 13, so one movement replaces 67. Netting changes settlement movement, not payment history — every individual record stays intact.",
      },
      {
        question: "Is 4Mica live on mainnet?",
        answer:
          "Yes. Base (eip155:8453) is the production network. Base Sepolia (eip155:84532) is the development network and Ethereum Sepolia (eip155:11155111) is there for cross-network compatibility testing. We recommend building against Base Sepolia first and moving to mainnet once your flows are tested.",
      },
      {
        question: "How can facilitators integrate 4Mica?",
        answer:
          "Existing x402 facilitators add the 4mica-credit scheme to their /supported response, call Core from their settle logic to submit guarantees and return the BLS certificate, validate both V1 and V2 guarantee structures, and use CAIP-2 network identifiers. You can also point sellers at the hosted facilitator instead of running your own.",
      },
      {
        question: "What is a payment guarantee?",
        answer:
          "The buyer's signed commitment to pay a specific amount to a specific recipient. It binds payer, recipient, amount, asset, request ID, and timestamp, and travels with the request. Core verifies the signature and available collateral, then issues a BLS certificate — that certificate is what proves the guarantee was accepted.",
      },
      {
        question: "When does settlement happen?",
        answer:
          "Guarantees enter clearing cycles configured per deployment. A cycle accepts guarantees, closes, computes net positions, commits them on-chain, and opens the payment and finality windows. Check your deployment's parameters rather than assuming a fixed schedule.",
      },
      {
        question: "How are disputes handled?",
        answer:
          "V1 guarantees become payable once Core verifies them. V2 guarantees wait on a validation condition — a registry, validator, score threshold, and job hash committed in the signature — so payment is bound to an objectively verifiable outcome. 4Mica records signatures, certificates, lifecycle state, and settlement evidence; subjective quality, retries, and refunds stay a product policy decision.",
      },
      {
        question: "How do withdrawals work?",
        answer:
          "Withdrawals are request-and-finalize with a delay in between. Finalization requires the configured grace period to pass and no obligations preventing it, so check open guarantees before withdrawing collateral. Durations are deployment parameters, not fixed constants.",
      },
    ],
    useCases: [
      {
        icon: "ri-robot-line",
        kicker: "AI Agents",
        title: "Agents pay APIs on credit, settle once",
        desc: "An AI agent calls dozens of endpoints per task: data feeds, inference, storage. No account setup, no API keys. It pays on credit from one pool and settles net exposure once per epoch.",
        tags: ["No account setup", "Instant onboarding", "Auto-settlement"],
      },
      {
        icon: "ri-exchange-line",
        kicker: "Agentic Commerce",
        title: "Agent-to-agent micropayments at scale",
        desc: "When agents transact with each other at high frequency, on-chain settlement per call is unworkable. 4Mica natively nets bilateral flows and collapses them into one settlement.",
        tags: ["Agent-to-agent", "Bilateral netting", "High-frequency"],
      },
      {
        icon: "ri-code-box-line",
        kicker: "API Monetization",
        title: "Accept payments with one line of code",
        desc: "Add 4Mica middleware and charge per HTTP request. Works with any x402-compatible client. No SDK on the client side, no KYC, no credits to manage. Money moves at the speed of the internet.",
        tags: ["x402-compatible", "Any HTTP client", "Zero friction"],
      },
      {
        icon: "ri-bank-line",
        kicker: "Financial Infrastructure",
        title: "Clearinghouse for on-chain apps",
        desc: "Build a payment rail that aggregates millions of micro-transfers, earns yield on float, and settles net positions on-chain. The same primitive that banks use, but permissionless.",
        tags: ["Yield on float", "Programmable disputes", "Non-custodial"],
      },
    ],
    steps: [
      {
        num: "01",
        badge: "Deposit",
        title: "Deposit collateral once",
        desc: "Funds go into Aave and earn yield. A single collateral deposit covers all credit.",
        code: `await client.user.approveErc20(usdc.address, AMOUNT);
await client.user.deposit(AMOUNT, usdc.address);`,
      },
      {
        num: "02",
        badge: "Spend",
        title: "Spend on credit: instant, off-chain",
        desc: "The agent signs an EIP-712 guarantee claim and receives BLS-signed credit. No gas, no chain transaction. Verified in milliseconds.",
        code: `const payment = await signGuarantee({
  cycleId:   "0xabc",  
  reqId:     "0x0",
  amount:    "0x64",
  recipient: "0x72e1…ResourceHub",
});

// GET /resource
// X-PAYMENT: <base64(payment)>
// HTTP 200 OK`,
      },
      {
        num: "03",
        badge: "Netting",
        title: "Netting across the cycle",
        desc: "Every 7 days the cycle closes. Bilateral flows collapse into one net position per participant.",
        code: `// Cycle closes every 7 days, netting begins
// Bilateral edges this cycle:
Alice → Bob:  800 USDC  (40 guarantees)
Bob → Alice:  300 USDC  (15 guarantees)
// net_debit[Alice]  = max(800 - 300, 0) = 500 USDC
// net_credit[Bob]   = 500 USDC
// 55 guarantees turns into 1 net position per participant`,
      },
      {
        num: "04",
        badge: "Settle",
        title: "Settle on-chain, one net payment",
        desc: "Net debtors pay once. Creditors claim once. Defaults are covered by vault collateral.",
        code: `// Debtor pays net position to ClearingHouse
await clearingHouse.payNetDebit(
  cycleId,
  netDebit,       // 500 USDC (not 800)
  merkleProof,
);

// Creditor claims once debtor has paid
await clearingHouse.claimNetCredit(
  cycleId,
  netCredit,
  merkleProof,
);

// 55 off-chain payments → 1 on-chain settlement`,
      },
    ],
    stats: [
      { value: "1 tx", label: "per settlement" },
      { value: "~0", label: "gas per call" },
      { value: "APY", label: "on collateral" },
    ],
    primitives: [
      {
        name: "x402",
        role: "Payment protocol",
        desc: "The HTTP payment standard 4Mica extends with a credit layer. Any x402-compatible client works out of the box.",
        icon: "ri-global-line",
      },
      {
        name: "Aave",
        role: "Yield layer",
        desc: "All collateral routes directly to Aave. Deposits earn APY continuously. Your payment infrastructure generates returns.",
        icon: "ri-plant-line",
      },
      {
        name: "Ethereum / Base",
        role: "Settlement layer",
        desc: "Net positions settle on-chain via EVM-compatible contracts. One transaction per settlement window, cryptographically enforced.",
        icon: "ri-links-line",
      },
    ],
    trustPoints: [
      {
        icon: "ri-lock-line",
        label: "Non-custodial",
        desc: "You own your collateral. 4Mica never holds funds.",
      },
      {
        icon: "ri-code-s-slash-line",
        label: "Open-source core",
        desc: "Contracts and SDKs are public on GitHub.",
      },
      {
        icon: "ri-test-tube-line",
        label: "Testnet live",
        desc: "Deposit, spend, and earn on Sepolia today.",
      },
    ],
    scenarioLines: {
      x402: [
        {
          label: "Capital locked in wallet",
          value: "$10,000 USDC",
          note: "earns 0%, just sitting there",
        },
        { label: "Yield earned", value: "$0", note: "no yield mechanism" },
        {
          label: "Gas fees paid (1M on-chain txs)",
          value: "+$1,000 USDC",
          note: "~$0.001 × 1,000,000 settlements",
        },
        {
          label: "Time waiting for finality",
          value: "278 hours",
          note: "1M txs × ~1 s avg block time",
        },
      ],
      mica: [
        {
          label: "Capital deployed in Aave vault",
          value: "$10,000 USDC",
          note: "non-custodial · withdraw anytime",
        },
        {
          label: "Yield earned over 1 year",
          value: "+$500 USDC",
          note: "~5% Aave USDC APY",
        },
        {
          label: "Gas fees",
          value: "< $1",
          note: "batch + netting · sponsored · $0 for payer",
        },
        {
          label: "Time waiting for finality",
          value: "2.7 hours",
          note: "10ms BLS signature + verification per request",
        },
      ],
    },
    sections: {
      realCostKicker: "The real cost",
      realCostTitle: "Agentic payments break at scale.",
      realCostLead: "1M API calls, 10k USDC volume, 1 year.",
      howItWorksKicker: "How it works",
      howItWorksTitle: "Separate payment authorization from settlement",
      howItWorksLead:
        "Pay with programmable cryptographic credit. Payment clearing runs off-chain, so thousands of API payments settle in one on-chain transaction.",
      howItWorksProtocolNote:
        "Same x402 protocol. Same HTTP clients. Works with any x402 facilitator.",
      replaceTransactions: "Replace thousands of transactions",
      oneSettlement: "one net settlement per cycle",
      includedKicker: "Included",
      x402Eyebrow: "x402",
      x402Subtitle: "per-transaction settlement",
      micaEyebrow: "With 4Mica",
      micaSubtitle: "credit layer + batch settlement",
      totalCost: "Total cost",
      netCost: "Net cost",
      deltaLead: "Same 1M calls. Same starting capital.",
      saved: "saved",
      reclaimed: "reclaimed",
      faqKicker: "FAQ",
      faqTitle: "Common questions",
      faqSupportPrompt: "Something else on your mind?",
      contactUs: "Contact us",
      finalCtaKicker: "Start building",
      finalCtaTitle: "Stop paying per transaction.",
      finalCtaLead:
        "Batch thousands of payments, settle once, and let your collateral earn yield while your agents scale.",
      viewSource: "View Source",
    },
  },
  sharedContent: {
    sections: {
      community: {
        kicker: "Community",
        title: "Build the agentic payments standard",
        lead: "We are building in public with developers who ship infra. Join the discussion, open issues, and help shape the protocol.",
        joinCommunity: "Join Community",
      },
      security: {
        kicker: "Security",
        title: "Plain UX, hard guarantees",
        lead: "The protocol is designed so that trust is enforced by math and contracts, not by 4Mica.",
        cardTitle: "Non-custodial by design",
        cardLead:
          "Your collateral is in Aave. Your guarantees are on-chain. 4Mica is the coordination layer. It cannot move your funds.",
      },
      benefits: {
        kicker: "Benefits",
        title: "Built for developers who ship fast",
        lead: "Start with plain UX. Add verifiable credit guarantees when you are ready.",
      },
      howItWorks: {
        kicker: "How it works",
        title: "Three steps to instant spend",
        lead: "Plain flow first, cryptographic guarantees underneath",
      },
      about: {
        kicker: "About Us",
        title: "The credit layer for instant, on-chain commerce",
        lead: "4Mica is the credit and clearing layer for x402 payments: agents pay on credit against collateral, requests clear instantly, and balances settle net on-chain. We help teams monetize APIs and agentic commerce without forcing users to pre-fund every request.",
        learnMore: "Learn more",
      },
      team: {
        title: "Meet Our Team",
        lead: "Leading experts in Cryptography, blockchain, and payment infrastructure",
      },
      useCases: {
        kicker: "Use cases",
        title: "Built for the scale you need",
        lead: "Built first for x402 facilitators, then for the API providers and agent frameworks behind them. 4Mica handles the credit and clearing layer so you don't have to.",
      },
      ecosystem: {
        kicker: "Ecosystem",
        title: "Built on primitives you already trust",
        lead: "4Mica is not a new protocol stack. It is a credit layer on top of production infrastructure.",
      },
    },
    benefits: [
      "Users spend now and settle after 7 days",
      "No prefunding or prepaid balances for customers",
      "Every charge is backed by on-chain collateral",
      "BLS-signed guarantees prevent replay and double spend",
      "Default assets: ETH, USDC, USDT with versioned guarantees",
    ],
    companyLinks: {
      mission: "4Mica Mission",
      team: "Team",
      roadmap: "Roadmap",
    },
    primaryLinks: {
      pricing: "Pricing",
      solution: "Solution",
    },
    hooks: {
      starOnGithub: "Star on GitHub",
      buildWithUs: "Build with us",
      requestEarlyAccess: "Request early access",
    },
    aboutCards: [
      {
        title: "4Mica Mission",
        description:
          "Mission, product focus, and how 4Mica unlocks credit-backed payments",
      },
      {
        title: "Team",
        description:
          "Meet the founders building the payment layer for instant commerce",
      },
      {
        title: "Roadmap",
        description:
          "Track delivery milestones for the credit layer and network rollout",
      },
    ],
    securityPoints: [
      {
        icon: "ri-safe-line",
        label: "Collateral stays in Aave",
        desc: "Deposits go directly to Aave, not to 4Mica. Users can withdraw at any time. 4Mica never holds funds.",
        color: "rgb(74 222 128)",
      },
      {
        icon: "ri-fingerprint-line",
        label: "BLS-signed guarantees",
        desc: "Every payment is backed by an EIP-712 signed guarantee with domain separation. Cryptographic proof exists for every spend.",
        color: "rgb(var(--brand))",
      },
      {
        icon: "ri-shield-check-line",
        label: "On-chain enforcement",
        desc: "If a payer defaults, recipients claim collateral directly from the contract. No trusted intermediary. No custodian risk.",
        color: "#c084fc",
      },
      {
        icon: "ri-git-branch-line",
        label: "AccessManaged + Pausable",
        desc: "Role-based access control, emergency pause, and reentrancy guards on all critical contract flows.",
        color: "rgb(var(--color-warning))",
      },
    ],
    teamMembers: [
      {
        name: "Akash Madhusudan",
        role: "CEO & Co-Founder",
        image: "/assets/akash.jpg",
        imagePosition: "50% 18%",
        bio: "Spent a decade solving real problems across banking, AI, and cryptography to build 4Mica",
      },
      {
        name: "Mairon Mahzoun",
        role: "CTO & Co-Founder",
        image: "/assets/mairon.jpg",
        imagePosition: "50% 20%",
        bio: "Everyone talks about AI and web3. Few understand money. 4mica exists because I grew tired of watching the web3 community claiming it had solved payments. It didn't. So I decided to.",
      },
      {
        name: "Tomer Ashur",
        role: "Co-Founder",
        image: "/assets/tomer.png",
        imagePosition: "50% 15%",
        bio: "Cryptography-savant, ex-professor, ex-captain, now leading the instant transaction layer for commerce 2.0",
      },
    ],
    steps: [
      {
        step: "01",
        title: "Deposit collateral once",
        description:
          "One collateral position backs credit across every service an agent pays",
      },
      {
        step: "02",
        title: "User spends on credit",
        description: "Users sign guarantees per request with no prefunding",
      },
      {
        step: "03",
        title: "Settle net, once per cycle",
        description:
          "Payable guarantees enter a clearing cycle and settle as net positions on-chain",
      },
    ],
  },
  careers: {
    seoTitle: "Careers | Build Agent Payment Infrastructure",
    kicker: "Careers",
    title: "Build with us",
    lead: "We're not actively hiring right now — but we always welcome contributions and collaboration with builders who care about instant, on-chain commerce.",
    getInvolved: [
      {
        title: "Contribute code",
        icon: "ri-git-branch-line",
        desc: "Open a PR or an issue on our repos — every protocol component is open and auditable.",
      },
      {
        title: "Share research",
        icon: "ri-flask-line",
        desc: "Working on payments, cryptography, or credit? We'd love to compare notes.",
      },
      {
        title: "Partner with us",
        icon: "ri-shake-hands-line",
        desc: "Building a service that needs instant settlement? Let's explore an integration.",
      },
    ],
    ctaTitle: "Let's chat",
    ctaLead:
      "If you want to contribute, share research, or explore a partnership, reach out and we'll get back quickly.",
    valuesKicker: "Values",
    valuesTitle: "Our values",
    valuesLead: "The principles that guide how we build and work together.",
    benefitsKicker: "Benefits",
    benefitsTitle: "Perks & benefits",
    benefitsLead:
      "The support and the resources to do your best work — wherever in the world you happen to be.",
    cultureKicker: "Team notes",
    cultureTitle: "Voices from the team",
    cultureLead: "Notes from the team on what it's like to build here.",
    values: [
      {
        title: "Relentless",
        icon: "ri-fire-line",
        desc: "We push through hard problems and don't stop until it ships.",
      },
      {
        title: "Open",
        icon: "ri-eye-line",
        desc: "We default to transparency, open standards, and honest feedback.",
      },
      {
        title: "Delightful",
        icon: "ri-sparkling-2-line",
        desc: "We obsess over the details that make every interaction effortless.",
      },
      {
        title: "Unified",
        icon: "ri-team-line",
        desc: "We move as one team with shared goals and shared ownership.",
      },
      {
        title: "Innovative",
        icon: "ri-lightbulb-flash-line",
        desc: "We question defaults and build what doesn't exist yet.",
      },
    ],
    perks: [
      {
        title: "Competitive equity",
        icon: "ri-money-dollar-circle-fill",
        color: "text-purple-400",
        desc: "We pay well and we pay fairly, with transparent compensation practices.",
      },
      {
        title: "Health benefits",
        icon: "ri-heart-pulse-fill",
        color: "text-pink-400",
        desc: "We've got you covered with comprehensive health, dental, and vision plans.",
      },
      {
        title: "Equipment & office",
        icon: "ri-computer-fill",
        color: "text-blue-400",
        desc: "You get a laptop, of course, plus an additional $1,000 USD to upgrade your home office.",
      },
      {
        title: "Flexible time-off",
        icon: "ri-time-fill",
        color: "text-green-400",
        desc: "Unlimited PTO and sick leave. When you work, we pay. When you don't work, we still pay.",
      },
      {
        title: "Retirement benefits",
        icon: "ri-bank-fill",
        color: "text-sky-400",
        desc: "We offer retirement support with coverage varying by country.",
      },
      {
        title: "Paid leave",
        icon: "ri-user-fill",
        color: "text-yellow-400",
        desc: "Time off to help you rest, care for loved ones, or welcome a new addition to your family.",
      },
      {
        title: "L&D stipend",
        icon: "ri-book-open-fill",
        color: "text-pink-300",
        desc: "Get $3,000 USD per year towards your professional learning and development.",
      },
      {
        title: "Wellness stipend",
        icon: "ri-settings-4-fill",
        color: "text-orange-500",
        desc: "Get $200 USD a month for a gym membership, new shoes, or the world's largest smoothie.",
      },
    ],
    testimonials: [
      {
        id: "priya-protocol",
        quote:
          "The bar for correctness is high here — we move real money, and everyone treats it that way.",
        name: "Priya S.",
        role: "Protocol Engineer",
        avatar: "PS",
      },
      {
        id: "daniel-backend",
        quote:
          "I shipped to mainnet in my first month. There's real trust to own big problems from day one.",
        name: "Daniel V.",
        role: "Backend Engineer",
        avatar: "DV",
      },
      {
        id: "lena-research",
        quote:
          "Research and product sit at the same table. Ideas go from a whiteboard proof to production fast.",
        name: "Lena K.",
        role: "Cryptography Researcher",
        avatar: "LK",
      },
      {
        id: "marco-product",
        quote:
          "Remote-first but tight-knit. We disagree openly, decide quickly, and keep building.",
        name: "Marco T.",
        role: "Product",
        avatar: "MT",
      },
      {
        id: "sofia-security",
        quote:
          "Every line of the protocol is auditable, and so is every decision. That clarity is rare.",
        name: "Sofia R.",
        role: "Security Engineer",
        avatar: "SR",
      },
    ],
  },
  pricing: {
    seo: {
      title: "Pricing for x402 API Payments | 4Mica",
      description:
        "Usage-based pricing for 4Mica's x402 credit and clearing layer. Start free on testnets, pay as you settle, and charge per API request in stablecoins.",
      keywords: [
        "4Mica pricing",
        "x402 pricing",
        "API payments",
        "stablecoin payments",
        "usage-based pricing",
        "payment credit",
        "settlement infrastructure",
      ],
      imageAlt: "4Mica pricing for x402 API payments",
    },
    kicker: "Pricing",
    title: "Pricing that tracks what you settle",
    lead: "There is no seat count and no monthly tier. Building and testing is free, and once you are clearing real volume on mainnet you pay a clearing fee on what actually settles — while your collateral keeps earning.",
    collateralNote:
      "Collateral stays under protocol control and keeps earning while it backs payments — 4Mica never takes custody of your funds.",

    model: {
      kicker: "How it works",
      title: "How 4Mica pricing works",
      lead: "Four things determine what 4Mica costs you, and only one of them is a fee.",
      cards: [
        {
          icon: "ri-flask-line",
          title: "Free while you build",
          desc: "Full SDK, facilitator, and testnet access on Base Sepolia and Ethereum Sepolia at no cost. Nothing is metered until you clear volume on mainnet.",
        },
        {
          icon: "ri-percent-line",
          title: "A clearing fee on settled volume",
          desc: "The fee applies to volume that actually clears, not to requests you authorize. Idle capacity, retries, and rejected guarantees cost nothing.",
        },
        {
          icon: "ri-gas-station-line",
          title: "Gas per cycle, not per request",
          desc: "Off-chain authorization means your on-chain footprint tracks settlement cycles instead of call volume — the saving grows with every request you add.",
        },
        {
          icon: "ri-seedling-line",
          title: "Yield stays with your collateral",
          desc: "Supported stablecoin collateral can earn while it backs open guarantees, and that yield belongs to your position, offsetting the cost of holding it.",
        },
      ],
    },

    fee: {
      kicker: "Clearing fee",
      title: "How the clearing fee is calculated",
      lead: "One line of arithmetic, applied once per clearing cycle.",
      formula: "clearing fee = net settled volume × your agreed rate",
      steps: [
        {
          order: "01",
          title: "Guarantees accumulate",
          desc: "Every authorized request adds a signed guarantee to the open cycle. Nothing is charged and nothing touches the chain yet.",
        },
        {
          order: "02",
          title: "The cycle nets down",
          desc: "When the cycle closes, obligations between the same two parties offset each other and only the net position remains.",
        },
        {
          order: "03",
          title: "The fee applies to what settles",
          desc: "Your rate is applied to that net settled figure, and the settlement commits on-chain with the records behind it.",
        },
      ],
      notes: [
        "Netting is what makes the fee base smaller than gross request volume — offsetting flows never become settlement movement.",
        "Rates are agreed per integration rather than published as a fixed table, because facilitator, seller, and marketplace economics differ.",
        "Network gas for the settlement transaction is separate and paid once per cycle, not once per request.",
      ],
    },

    calculator: {
      kicker: "Calculator",
      title: "See what netting saves you",
      lead: "Move the sliders to your own volume. The comparison is against settling every x402 request on-chain, which is what standard per-request payment costs today.",
      baselineLabel: "Settling every request on-chain",
      micaLabel: "With 4Mica",
      inputs: {
        requests: "Paid requests per month",
        price: "Average price per request",
        cadence: "Settlement cadence",
        rate: "Your clearing rate",
        gas: "Network cost per on-chain settlement",
        collateral: "Collateral deposited",
        apy: "Collateral yield (APY)",
      },
      cadenceOptions: {
        monthly: "Monthly",
        weekly: "Weekly",
        daily: "Daily",
        hourly: "Hourly",
      },
      rows: {
        volume: "Payment volume",
        onchain: "On-chain settlements",
        gas: "Network gas",
        fee: "Clearing fee",
        yield: "Yield on collateral",
        total: "Net monthly cost",
        perRequest: "Effective cost per request",
      },
      results: {
        savingTitle: "Monthly saving with 4Mica",
        savingNegative:
          "At this volume and rate, per-request settlement still costs less",
        savingNegativeHint:
          "Raise the volume or lengthen the cycle to find the crossover point.",
        txAvoided: "On-chain transactions avoided",
        reduction: "Lower cost of settlement",
        breakeven: "Break-even volume at these settings",
      },
      disclaimer:
        "Illustrative model, not a quote. Gas, yield, and clearing rate are inputs you control here — your rate is agreed per integration, network gas varies with chain conditions, and collateral yield is variable and not guaranteed.",
    },

    facilitators: {
      kicker: "For facilitators",
      title: "How facilitators save on settlement fees",
      lead: "A facilitator settling per request pays for every call it passes through. On the credit scheme, it pays for cycles.",
      example: {
        title: "One cycle, two counterparties",
        outgoing: "40 outgoing payable guarantees",
        incoming: "27 incoming payable guarantees",
        net: "13 settles as one net position",
        note: "Sixty-seven obligations become a single settlement movement. Netting changes what moves, not what is recorded — every guarantee stays auditable.",
      },
      points: [
        {
          icon: "ri-git-merge-line",
          title: "Gas tracks cycles, not calls",
          desc: "Doubling the requests through your facilitator does not double your settlement cost, because the number of on-chain writes is set by cadence.",
        },
        {
          icon: "ri-scales-3-line",
          title: "Offsetting flows cancel",
          desc: "When the parties behind your endpoint pay each other, those obligations net out before anything settles, so the fee base shrinks with them.",
        },
        {
          icon: "ri-server-line",
          title: "No clearing stack to run",
          desc: "You add a scheme rather than building collateral accounting, netting, and settlement infrastructure and paying to operate it.",
        },
      ],
    },

    yieldSection: {
      kicker: "Yield",
      title: "How deposited capital can earn",
      lead: "Collateral is not idle while it backs payments.",
      points: [
        {
          icon: "ri-bank-line",
          title: "Supplied to Aave",
          desc: "Configured stablecoin collateral is supplied to Aave's lending markets and the protocol holds the interest-bearing aTokens.",
        },
        {
          icon: "ri-lock-unlock-line",
          title: "Earning while reserved",
          desc: "Reserving capacity for guarantees locks the capacity, not the accrual — the underlying stablecoin keeps earning through the cycle.",
        },
        {
          icon: "ri-user-star-line",
          title: "It belongs to the payer",
          desc: "Yield accrues to the collateral position rather than the seller receiving payments, offsetting the carrying cost of the capital you posted.",
        },
        {
          icon: "ri-error-warning-line",
          title: "Variable, not guaranteed",
          desc: "Supply rates move with the market and principal carries smart-contract, depeg, and liquidity risk. Check the deployment configuration before depositing production funds.",
        },
      ],
    },

    volume: {
      kicker: "Large volume",
      title: "Custom pricing for high-volume integrations",
      lead: "Facilitators, marketplaces, and networks clearing serious volume are priced individually rather than off a table.",
      points: [
        "A clearing rate that steps down as settled volume grows",
        "Volume commitments in exchange for a lower rate",
        "Yield-sharing arrangements on posted collateral",
        "Settlement cadence and cycle windows tuned to your flow",
        "Dedicated support, custom SLAs, and security review",
      ],
      cta: "Talk about volume pricing",
    },

    faqKicker: "FAQ",
    faqTitle: "Questions about the fee",
    faqs: [
      {
        question: "Am I charged per request?",
        answer:
          "No. Authorizing a request is off-chain and free of both gas and fee. The clearing fee applies to the net volume that settles when a cycle closes.",
      },
      {
        question: "What if a cycle nets to zero?",
        answer:
          "Nothing settles, so there is nothing to charge a rate against. That is the point of netting — offsetting obligations never become settlement movement.",
      },
      {
        question: "Who pays the network gas?",
        answer:
          "Gas is paid on the settlement transaction and on collateral actions such as deposits and withdrawals. Because settlement happens per cycle rather than per request, that cost stops scaling with traffic.",
      },
      {
        question: "Does the yield reduce what I pay 4Mica?",
        answer:
          "It is separate. Yield accrues to your collateral position and offsets the cost of holding capital; the clearing fee is charged on settled volume. Both show up in the calculator above so you can see the net position.",
      },
      {
        question: "Is there a free tier for production?",
        answer:
          "Testnets are free and unmetered. Mainnet volume is priced, and if you are still validating a product we would rather agree a small starting arrangement than have you rebuild later.",
      },
    ],

    includedKicker: "Included",
    includedTitle: "In every integration, at any volume",
    includedLead:
      "Pricing changes with volume. The payment model does not — the same rails run from your first sandbox request to production settlement.",
    included: [
      {
        icon: "ri-bank-line",
        title: "Non-custodial collateral",
        desc: "Collateral remains controlled by protocol contracts and backs open payment obligations.",
      },
      {
        icon: "ri-exchange-dollar-line",
        title: "Batched settlement",
        desc: "Many off-chain guarantees collapse into fewer on-chain settlement actions.",
      },
      {
        icon: "ri-seedling-line",
        title: "Yield-aware design",
        desc: "Supported collateral can earn yield while it backs credit-based payment activity.",
      },
      {
        icon: "ri-code-box-line",
        title: "SDK-first integration",
        desc: "Use TypeScript and Python clients with x402-compatible HTTP payment flows.",
      },
    ],
  },
  about: {
    kicker: "Company",
    title: "Our mission",
    whyWeExist: "Why we exist",
    missionStrong:
      "4Mica is a lightweight overlay that enables services to extend cryptographically backed lines of credit across any blockchain.",
    missionBody:
      "Acting as a credit layer for instant, low-friction settlements and guaranteed fair exchange, 4Mica fixes Web3's inefficient pre-funded model and makes programmable credit accessible to all.",
    companyInfoTitle: "Company Info",
    founderTitle: "A few words from the founders",
    founderLead: "Why we started 4Mica and what we believe in.",
    founderQuote:
      "We started 4Mica to make programmable credit effortless. Just like APIs connect the web, we believe value should flow with the same clarity between agents.",
    careersTitle: "Help us build the future of coordination",
    highlights: [
      {
        title: "Credit-backed UX",
        icon: "ri-bank-card-line",
        description:
          "Agents pay on credit against collateral, so no one prefunds a balance for every API call.",
      },
      {
        title: "Guaranteed settlement",
        icon: "ri-shield-check-line",
        description:
          "BLS-certified guarantees and enforceable claims keep every payment auditable and recoverable.",
      },
      {
        title: "Cross-chain ready",
        icon: "ri-links-line",
        description:
          "Support Ethereum, Solana, and emerging rollups with the same credit rails.",
      },
      {
        title: "Built for production",
        icon: "ri-rocket-2-line",
        description:
          "SDKs, clear failure modes, and operational tooling from day one.",
      },
    ],
    companyInfo: [
      {
        label: "Focus",
        icon: "ri-focus-3-line",
        value: "Credit-backed payment rails",
      },
      {
        label: "Core product",
        icon: "ri-stack-line",
        value: "Guarantees, clearing cycles, settlement APIs",
      },
      {
        label: "Integrations",
        icon: "ri-plug-line",
        value: "SDKs, x402 facilitator, on-chain contracts",
      },
      {
        label: "Status",
        icon: "ri-pulse-line",
        value: "Production-ready pilot deployments",
      },
    ],
    roadmap: {
      kicker: "Roadmap",
      title: "Product roadmap",
      lead: "Our journey to revolutionize web3 commerce.",
      pathTitle: "Roadmap path",
      milestones: [
        {
          quarter: "Q2 2025",
          title: "PoC Release",
          description:
            "Initial proof of concept with basic transaction capabilities and single-chain support",
          done: true,
        },
        {
          quarter: "Q3 2025",
          title: "Alpha Release",
          description:
            "Alpha Release to Ethereum and Solana with credit capabilities for Agents and APIs",
          done: true,
        },
        {
          quarter: "Q4 2025",
          title: "Strategic Partnerships",
          description:
            "Partnerships with AI platforms and DeFi companies to enhance ecosystem integration",
          done: true,
        },
        {
          quarter: "Q1 2026",
          title: "Beta Release",
          description:
            "Beta release to Ethereum and Solana and support for retail payments",
          done: true,
        },
        {
          quarter: "Q2 2026",
          title: "Regularity Compliance",
          description:
            "Achieving compliance with financial regulations and prepare for mainnet launch",
          done: false,
        },
        {
          quarter: "Q3 2026",
          title: "Mainnet Launch",
          description:
            "Full mainnet launch with multi-chain support, cross-chain credit, and off-ramping to fiat",
          done: false,
        },
      ],
    },
  },
  team: {
    kicker: "Team",
    title: "Meet the team",
    lead: "4Mica is led by founders who have shipped payment infrastructure across finance, AI, and cryptography. We are focused on bringing production-grade credit rails to web3 commerce.",
    howWeWorkTitle: "How we work",
    howWeWorkLead:
      "We build with a security-first mindset and keep every protocol component auditable. The team ships with a focus on production reliability, clear integration paths, and measurable outcomes for partners.",
    readMission: "Read our mission",
    openRolesTitle: "Help us build the future of agentic commerce",
    galleryKicker: "Culture",
    galleryTitle: "Life at 4Mica",
    galleryLead:
      "We're builders from all corners of the world who care deeply about our work, but we also know when to step back and enjoy life. Some of our best ideas come when we're not staring at screens.",
    gallery: [
      {
        src: "/team/team_2.avif",
        alt: "The 4Mica team and fellow builders gathered outside the Base Batches venue.",
        width: 1600,
        height: 1200,
      },
      {
        src: "/team/team_3.avif",
        alt: "Two 4Mica teammates at a Base community event.",
        width: 1200,
        height: 1600,
      },
      {
        src: "/team/team_1.avif",
        alt: "A 4Mica founder presenting the protocol on stage at Base Batches.",
        width: 1600,
        height: 890,
      },
      {
        src: "/team/team_4.avif",
        alt: "Two teammates in front of a fountain on a team offsite.",
        width: 1200,
        height: 1600,
      },
      {
        src: "/team/team_5.avif",
        alt: "A teammate in front of a wall of brightly coloured lava lamps.",
        width: 1600,
        height: 1200,
      },
      {
        src: "/team/team_6.avif",
        alt: "A teammate out in a snowy city street during a winter conference trip.",
        width: 960,
        height: 1280,
      },
    ],
  },
  legal: {
    defaultKicker: "Legal",
    lastUpdated: "Last updated:",
    tableOfContents: "Table of contents",
  },
  blog: {
    heading: "The 4Mica blog: x402, agentic payments, and settlement",
    allArticles: "All articles",
    minRead: "min read",
    empty: "No posts yet — check back soon.",
    emptyCategory: "No posts in this category yet.",
    backToBlog: "All posts",
    author: "Written by",
    published: "Published",
    tags: "Tags",
    readPost: "Read post",
  },
  seo: {
    home: {
      title: "4Mica | x402 Credit and Clearing Layer for Agent Payments",
      description:
        "4Mica is the credit and clearing layer for x402: AI agents pay for APIs with stablecoin-backed credit, clear requests instantly, and settle net on-chain.",
      keywords: [
        "4Mica",
        "x402",
        "x402 credit layer",
        "agentic payments",
        "agentic commerce",
        "payment clearing",
        "settlement infrastructure",
        "payment credit",
        "API payments",
        "stablecoin payments",
        "AI agent payments",
      ],
      imageAlt: "4Mica x402 credit and clearing layer for agentic payments",
    },
    careers: {
      title: "Careers | Build x402 Settlement Infrastructure | 4Mica",
      description:
        "Explore collaboration and contribution opportunities with 4Mica as we build credit-backed payment infrastructure for web3 commerce.",
      keywords: [
        "4Mica careers",
        "web3 jobs",
        "agent payment jobs",
        "payment infrastructure careers",
        "blockchain engineering",
        "open source collaboration",
      ],
      imageAlt: "4Mica careers",
    },
    partners: {
      title: "x402 Facilitator and Integration Partners | 4Mica",
      description:
        "Partner with 4Mica: integrate credit-backed x402 payments, run facilitator infrastructure on the clearing layer, or refer the teams building agentic commerce.",
      keywords: [
        "4Mica partners",
        "x402 facilitators",
        "facilitator infrastructure",
        "x402 integration",
        "agentic payments",
        "settlement infrastructure",
        "partner program",
        "referral partner",
      ],
      imageAlt: "4Mica x402 facilitator and integration partner program",
    },
    blog: {
      title: "Blog | x402 and Agentic Payments | 4Mica",
      description:
        "Engineering deep dives on x402, payment clearing, credit-backed settlement, and the infrastructure behind agentic commerce, from the team building 4Mica.",
      keywords: [
        "4Mica blog",
        "x402",
        "agentic payments",
        "payment clearing",
        "settlement infrastructure",
        "payment credit",
        "engineering blog",
      ],
      imageAlt: "4Mica blog on x402 and agentic payments",
    },
  },
} as const;

export type EnglishMessages = typeof en;
