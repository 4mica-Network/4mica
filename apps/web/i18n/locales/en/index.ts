export const en = {
  common: {
    brandName: "4Mica",
    logoAlt: "4Mica logo",
    actions: {
      talkToSales: "Talk to sales",
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
    byUseCase: "By use case",
    documentation: "Documentation",
    documentationDescription: "Guides, SDKs, and API reference",
    apiStatus: "API status",
    apiStatusDescription: "Live uptime",
    apiChangelog: "API changelog",
    apiChangelogDescription: "Releases and updates",
    librariesAndSdks: "Libraries and SDKs",
    librariesAndSdksDescription: "TypeScript and Python",
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
      roadmap: "Roadmap",
      contactSales: "Contact sales",
    },
    support: {
      getSupport: "Get support",
      managedSupportPlans: "Managed support plans",
    },
    resources: {
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
        "4Mica gives agents one place to pay on credit, earn yield, and settle transactions without clearing every request on-chain.",
      supportedOn: "Supported on",
      supportedNetworks: {
        base: "Base",
        ethereumSepolia: "Ethereum Sepolia",
        baseSepolia: "Base Sepolia",
      },
    },
    faqs: [
      {
        question: "What exactly is a credit layer for x402?",
        answer:
          "Standard x402 settles every payment on-chain, one transaction per request. 4Mica adds a credit layer: agents sign off-chain guarantees and spend against pooled collateral. Settlements are batched and happen once per window, resulting in orders of magnitude fewer transactions.",
      },
      {
        question: "What is a payment tab?",
        answer:
          "A tab is a credit session opened by the recipient (POST /tabs). It has a tabId, TTL, and version. Individual spends within the tab are identified by a reqId that increments with each signed guarantee.",
      },
      {
        question: "What is a payment guarantee?",
        answer:
          "A payment guarantee is an EIP-712 signed claim that the payer attaches as an X-PAYMENT header. It commits to tabId, reqId, amounts, addresses, and timestamp. The facilitator verifies the signature and issues a BLS-signed certificate for on-chain settlement.",
      },
      {
        question: "How does yield work?",
        answer:
          "Stablecoin deposits route through Aave via depositStablecoin(). The protocol holds aTokens on your behalf. APY accrues continuously and offsets the cost of payments.",
      },
      {
        question: "When do users settle?",
        answer:
          "Users call payTabInERC20Token() after 7 days. If they don't, the recipient's on-chain claim window opens at day 14 (remunerationGracePeriod) and closes at day 21 (tabExpirationTime).",
      },
      {
        question: "How are disputes handled?",
        answer:
          "V2 guarantees use ERC-8004's ValidationRegistry. The payer signs a guarantee committing to a specific validator, agent, score threshold, and job hash. If the validation fails on-chain, remunerate() reverts and collateral stays locked. Validators post a 0–100 score on-chain.",
      },
      {
        question: "How do withdrawals work?",
        answer:
          "Call requestWithdrawal() to start the timelock, then finalizeWithdrawal() after the withdrawalGracePeriod (default 22 days). A 6-hour synchronizationDelay prevents race conditions with open tabs.",
      },
      {
        question: "Which assets are supported?",
        answer:
          "ETH and stablecoins. USDC and USDT are enabled by default. Other ERC-20s can be configured by the operator.",
      },
      {
        question: "Does it work with existing x402 clients?",
        answer:
          "Yes. 4Mica is x402-compatible. Wrap your existing fetch or requests client with the 4Mica scheme adapter. One line of code. No changes to your server or HTTP logic.",
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
      realCostTitle: "Agentic economy breaks at scale.",
      realCostLead: "1M API calls, 10k USDC volume, 1 year.",
      howItWorksKicker: "How it works",
      howItWorksTitle: "Separate payment authorization from settlement",
      howItWorksLead:
        "Pay with programmable cryptographic credit. Settle thousands of payments in one on-chain transaction.",
      howItWorksProtocolNote: "Same x402 protocol. Same HTTP clients.",
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
        title: "Build the payment tab standard",
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
        lead: "4Mica issues cryptographic payment tabs that keep capital productive while delivering real-time UX. We help teams monetize APIs and on-chain commerce without forcing users to pre-fund every request.",
        learnMore: "Learn more",
      },
      team: {
        title: "Meet Our Team",
        lead: "Leading experts in Cryptography, blockchain, and payment infrastructure",
      },
      useCases: {
        kicker: "Use cases",
        title: "Built for the scale you need",
        lead: "API monetization, agentic commerce, paywalled content. 4Mica handles the payment layer so you don't have to.",
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
        title: "Recipient opens a tab",
        description: "Create a tab_id with asset and limits for a user",
      },
      {
        step: "02",
        title: "User spends on credit",
        description: "Users sign guarantees per request with no prefunding",
      },
      {
        step: "03",
        title: "User settles after 7 days",
        description:
          "Settle later, or claim collateral after the on-chain grace period",
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
  },
  pricing: {
    seo: {
      title: "4Mica Pricing | Usage-Based Credit Payments",
      description:
        "Simple, usage-based pricing for 4Mica's credit-backed payment rails. Start free on testnets and pay as you settle.",
      keywords: [
        "4Mica pricing",
        "usage-based pricing",
        "payment infrastructure pricing",
        "x402 pricing",
        "credit payments",
      ],
      imageAlt: "4Mica pricing",
    },
    kicker: "Pricing",
    title: "Pricing that scales with settlement volume",
    lead: "Build free on testnets, then move to volume-based pricing when payments clear on mainnet. No per-request gas billing, no surprise settlement line items.",
    collateralNote:
      "Collateral stays in your control and earns yield — 4Mica never holds funds.",
    includedKicker: "Included",
    includedTitle: "Core rails across every plan",
    includedLead:
      "The plan changes how you go live and operate at scale. The core payment model stays consistent from sandbox to production.",
    tiers: [
      {
        name: "Build",
        price: "Free",
        tagline: "Ship your integration on testnets with full SDK access.",
        features: [
          "All supported testnets",
          "TypeScript & Python SDKs",
          "x402 facilitator access",
          "Community support",
          "Protocol docs and examples",
          "Basic settlement sandbox",
        ],
        ctaLabel: "Start building",
      },
      {
        name: "Scale",
        eyebrow: "Most popular",
        price: "Volume-based",
        tagline:
          "Pay a percentage of cleared transaction volume. Settlement costs included.",
        features: [
          "Mainnet across chains",
          "% fee on cleared volume",
          "Settlement costs covered",
          "Yield passed through",
          "Production facilitator access",
          "Usage and settlement reporting",
          "Email support",
        ],
        ctaLabel: "Talk to sales",
      },
      {
        name: "Enterprise",
        price: "Custom",
        tagline:
          "Custom terms for high volume networks, facilitators, and marketplaces.",
        features: [
          "Custom clearing fee",
          "Volume commitments",
          "Priority settlement",
          "Yield-sharing options",
          "Dedicated support",
          "Custom SLAs and terms",
          "Security review",
        ],
        ctaLabel: "Contact sales",
      },
    ],
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
          "Issue cryptographic tabs so users can pay instantly without prefunding each call.",
      },
      {
        title: "Guaranteed settlement",
        icon: "ri-shield-check-line",
        description:
          "BLS guarantees and enforceable claims keep every tab auditable and recoverable.",
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
        value: "Tabs, guarantees, settlement APIs",
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
    valuesKicker: "Values",
    valuesTitle: "Our values",
    valuesLead: "The principles that guide how we build and work together.",
    benefitsKicker: "Benefits",
    benefitsTitle: "Perks & benefits",
    cultureKicker: "Culture",
    cultureTitle: "Life at 4Mica",
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
  legal: {
    defaultKicker: "Legal",
    lastUpdated: "Last updated:",
    tableOfContents: "Table of contents",
  },
  seo: {
    home: {
      title: "4Mica | Credit Layer for x402 Agent Payments",
      description:
        "4Mica is the clearinghouse for the agentic economy, enabling x402-compatible agents and APIs to pay on credit, net transactions, and settle on-chain.",
      keywords: [
        "4Mica",
        "x402 credit layer",
        "agent payments",
        "AI agent payments",
        "on-chain credit",
        "web3 payment infrastructure",
        "micropayments",
        "agentic economy",
      ],
      imageAlt: "4Mica credit layer for x402 payments",
    },
    careers: {
      title: "Careers | Build Agent Payment Infrastructure",
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
  },
} as const;

export type EnglishMessages = typeof en;
