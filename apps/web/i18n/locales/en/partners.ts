import { links } from "@4mica/url";

const mailto = (subject: string, body: string) =>
  `${links.mailto.partnership}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

export const partners = {
  kicker: "Partners",
  title: "Build the payment layer for the agentic economy",
  lead: "Add credit-backed payments to the products your users already use. Integrate 4Mica, route payments through it, or introduce teams that need it.",
  primaryCta: "Talk to partnerships",
  primaryCtaHref: mailto(
    "Partnership enquiry",
    "Hi 4Mica team,\n\nWe would like to explore a partnership.\n\nCompany:\nWhat we build:\nWhat we have in mind:\n",
  ),
  secondaryCta: "See partner programs",

  ecosystem: {
    title: "Teams already building with 4Mica",
    lead: "Protocols and networks working with us across validation, agent infrastructure, and settlement.",
  },

  why: {
    kicker: "Why partner",
    title: "Why work with 4Mica?",
    lead: "4Mica adds credit and clearing to x402. Agents pay against collateral, requests are authorized off-chain, and net balances settle on-chain once per cycle.",
    cards: [
      {
        icon: "ri-radar-line",
        title: "Reach teams building agents",
        desc: "Reach teams building agents that need to pay for APIs, inference, and data.",
      },
      {
        icon: "ri-plug-line",
        title: "Add payments without rebuilding",
        desc: "4Mica works with x402-compatible clients and servers, so you can add it to your existing HTTP stack instead of building new payment infrastructure.",
      },
      {
        icon: "ri-scales-3-line",
        title: "Terms based on the partnership",
        desc: "We agree on revenue share, referral terms, and support based on what each partner provides.",
      },
      {
        icon: "ri-team-line",
        title: "Work with the core team",
        desc: "Work directly with the engineers who maintain the protocol through integration reviews, roadmap updates, and a shared support channel.",
      },
    ],
  },

  programs: {
    kicker: "Programs",
    title: "Choose how you want to work with us",
    lead: "Start with the program that matches what you build or who you support.",
    items: [
      {
        icon: "ri-code-box-line",
        label: "Technology partners",
        title: "Integrate 4Mica into your product",
        desc: "For platforms, agent frameworks, and API providers adding credit-backed payments to their products.",
        points: [
          "Client and server SDKs in TypeScript and Python",
          "Wrap the fetch client or middleware you already use",
          "Integration review and joint launch support",
        ],
        cta: "Start an integration",
        href: mailto(
          "Technology partnership",
          "Hi 4Mica team,\n\nWe would like to integrate 4Mica into our product.\n\nCompany:\nProduct:\nStack:\nTimeline:\n",
        ),
      },
      {
        icon: "ri-node-tree",
        label: "Infrastructure partners",
        title: "Route payments through the credit layer",
        desc: "For facilitators, wallets, and infrastructure providers that want to clear agent payments in cycles instead of settling each request on-chain.",
        points: [
          "Facilitator endpoints for verification, settlement, and BLS certificates",
          "Support for Base and Ethereum networks",
          "Shared operational runbooks and status reporting",
        ],
        cta: "Talk to the team",
        href: mailto(
          "Infrastructure partnership",
          "Hi 4Mica team,\n\nWe operate infrastructure and would like to route payments through 4Mica.\n\nCompany:\nWhat we run:\nVolume today:\n",
        ),
      },
      {
        icon: "ri-shake-hands-line",
        label: "Ecosystem partners",
        title: "Introduce the builders who need credit rails",
        desc: "For funds, accelerators, communities, and agencies that support teams using high-frequency payments.",
        points: [
          "Onboarding support for your portfolio or community",
          "Co-marketing: launch posts, workshops, and events",
          "Referral terms agreed per partner",
        ],
        cta: "Become a referral partner",
        href: mailto(
          "Ecosystem partnership",
          "Hi 4Mica team,\n\nWe work with builders who may need 4Mica.\n\nOrganisation:\nCommunity or portfolio:\nWhat we have in mind:\n",
        ),
      },
    ],
  },

  benefits: {
    kicker: "Benefits",
    title: "What partners get",
    lead: "Practical support from integration through launch.",
    items: [
      {
        icon: "ri-chat-3-line",
        title: "A direct channel to the core team",
        desc: "A shared channel with the engineers who maintain the protocol.",
      },
      {
        icon: "ri-tools-line",
        title: "Technical onboarding",
        desc: "An architecture review, an integration walkthrough, and help planning your first clearing cycle.",
      },
      {
        icon: "ri-megaphone-line",
        title: "Co-marketing",
        desc: "Joint launch posts, documentation placement, and coordinated promotion.",
      },
      {
        icon: "ri-rocket-line",
        title: "Early access",
        desc: "Early access to protocol releases and new scheme features.",
      },
      {
        icon: "ri-flask-line",
        title: "Testnet environments",
        desc: "Funded testnet flows so your team can test the integration before mainnet.",
      },
      {
        icon: "ri-file-list-3-line",
        title: "Clear commercial terms",
        desc: "Written revenue-share and referral terms, supported by auditable settlement records.",
      },
    ],
  },

  enablement: {
    kicker: "Go to market",
    title: "Support from integration to launch",
    lead: "We help you integrate, launch, reach customers, and operate the payment flow.",
    pillars: [
      {
        icon: "ri-hammer-line",
        label: "Build",
        title: "Ship the integration",
        points: [
          "Architecture review and a walkthrough of the x402 flow",
          "Client and server SDKs in TypeScript and Python",
          "Funded testnet flows for testing settlement",
        ],
      },
      {
        icon: "ri-hand-coin-line",
        label: "Co-sell",
        title: "Reach teams building agents",
        points: [
          "Warm introductions to teams that need credit-backed payments",
          "Joint account planning and a shared sales channel",
          "Referral and revenue-share terms agreed per partnership",
        ],
      },
      {
        icon: "ri-megaphone-line",
        label: "Co-market",
        title: "Launch together",
        points: [
          "Joint launch posts, docs placement, and social amplification",
          "A listing in the 4Mica ecosystem",
          "Co-hosted workshops, demos, and events",
        ],
      },
      {
        icon: "ri-customer-service-2-line",
        label: "Engage",
        title: "Stay close to the protocol",
        points: [
          "A direct channel to the engineers who maintain the protocol",
          "Roadmap visibility and early access to new scheme features",
          "Operational runbooks and status reporting for live traffic",
        ],
      },
    ],
  },

  stories: {
    kicker: "Proof",
    title: "Partners building with 4Mica",
    lead: "See how partners use 4Mica to reduce payment overhead.",
    items: [
      {
        partner: "Aligned Layer",
        logo: "/assets/aligned_layer_logo.png",
        tag: "API monetization",
        challenge:
          "Aligned's verification costs about $0.019 per task, while on-chain payment gas cost about $0.14. The payment cost was roughly eight times the cost of the service.",
        outcome:
          "4Mica authorizes each payment off-chain and settles net balances once per cycle, reducing the settlement cost relative to the service.",
        stat: { value: "8×", label: "payment gas versus service cost" },
        href: "/solution",
        cta: "Read the case study",
      },
    ],
    invite: {
      title: "Building with 4Mica?",
      desc: "Share how your team uses 4Mica and what changed after integration.",
      cta: "Share your story",
      href: mailto(
        "Partner success story",
        "Hi 4Mica team,\n\nWe would like to share our story building on 4Mica.\n\nCompany:\nWhat we shipped:\nResults so far:\n",
      ),
    },
  },

  process: {
    kicker: "Process",
    title: "How a partnership starts",
    lead: "Three steps from the first conversation to launch.",
    steps: [
      {
        order: "01",
        title: "Introduce your team",
        desc: "Tell us what you build, how payments work today, and what you want to improve.",
      },
      {
        order: "02",
        title: "Design the integration",
        desc: "We define the guarantees, spending limits, settlement cadence, responsibilities, and commercial terms.",
      },
      {
        order: "03",
        title: "Launch together",
        desc: "Launch on mainnet with an integration review, operational monitoring, and a joint announcement.",
      },
    ],
  },

  other: {
    kicker: "More ways to partner",
    title: "Other ways to work with us",
    items: [
      {
        icon: "ri-seedling-line",
        title: "Perks for funds and accelerators",
        desc: "Give your portfolio companies onboarding support and testnet access for agent payments.",
        cta: "Set up perks",
        href: mailto(
          "Portfolio perks",
          "Hi 4Mica team,\n\nWe would like to offer 4Mica perks to our portfolio or cohort.\n\nOrganisation:\nPortfolio size:\n",
        ),
      },
      {
        icon: "ri-microscope-line",
        title: "Research collaboration",
        desc: "Work with us on payment cryptography, credit risk, or agent identity research.",
        cta: "Compare notes",
        href: `${links.mailto.dev}?subject=${encodeURIComponent("Research collaboration")}`,
      },
    ],
  },

  resources: {
    kicker: "Resources",
    title: "Resources for partners",
    items: [
      {
        icon: "ri-book-2-line",
        title: "Partner documentation",
        desc: "Integration guides, SDK references, and x402 protocol documentation.",
        cta: "Read the docs",
        href: links.docs,
        external: true,
      },
      {
        icon: "ri-compass-3-line",
        title: "Explore the ecosystem",
        desc: "See the protocols and networks working with 4Mica.",
        cta: "View programs",
        href: "#programs",
        external: false,
      },
      {
        icon: "ri-mail-send-line",
        title: "Talk to partnerships",
        desc: "Tell us what you are building, and we will suggest the next step.",
        cta: "Get in touch",
        href: mailto(
          "Partnership enquiry",
          "Hi 4Mica team,\n\nWe would like to explore a partnership.\n\nCompany:\nWhat we build:\nWhat we have in mind:\n",
        ),
        external: false,
      },
    ],
  },

  faq: {
    kicker: "FAQ",
    title: "Partnership questions",
    items: [
      {
        question: "Who is a good fit for a partnership?",
        answer:
          "Facilitators are our primary partners and customers. We also work with agent platforms, API providers, wallets, infrastructure teams, and organizations that support them. The strongest fit is a product with many small payments where per-request on-chain settlement adds too much cost or delay.",
      },
      {
        question: "Do we need to change our payment stack?",
        answer:
          "No. Clients wrap the fetch client they already use, and services add middleware to existing routes. Most integrations extend the current payment flow rather than replace it.",
      },
      {
        question: "How long does an integration take?",
        answer:
          "It depends on your stack and deployment requirements. The core flow is small: sign a guarantee, authorize the request against a limit, and settle the clearing cycle. We define the scope before work begins.",
      },
      {
        question: "How do commercial terms work?",
        answer:
          "We agree on terms for each partnership based on traffic, integration work, support, or referrals. We document the terms, and settlement records provide an audit trail.",
      },
    ],
    contactPrompt: "Something else on your mind?",
    contactCta: "Contact us",
  },

  cta: {
    title: "Build the payment layer for the agentic economy",
    lead: "Tell us what you are building, and we will suggest a concrete next step.",
    primary: "Talk to partnerships",
    secondary: "Read the docs",
  },
} as const;
