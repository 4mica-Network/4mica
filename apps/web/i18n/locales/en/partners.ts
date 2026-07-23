import { links } from "@4mica/url";

const mailto = (subject: string, body: string) =>
  `${links.mailto.partnership}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

export const partners = {
  kicker: "Partners",
  title: "Build the agentic economy with 4Mica",
  lead: "Bring instant, credit-backed settlement to the products your users already run. Integrate the protocol, route payments through it, or introduce the builders who need it.",
  primaryCta: "Talk to partnerships",
  primaryCtaHref: mailto(
    "Partnership enquiry",
    "Hi 4Mica team,\n\nWe would like to explore a partnership.\n\nCompany:\nWhat we build:\nWhat we have in mind:\n",
  ),
  secondaryCta: "See partner programs",

  ecosystem: {
    title: "Teams already building with 4Mica",
    lead: "Protocols and networks we work with across validation, agent infrastructure, and settlement.",
  },

  why: {
    kicker: "Why partner",
    title: "Why partner with 4Mica?",
    lead: "4Mica is the credit layer for x402 payments: agents pay on credit, requests clear instantly, and balances settle on-chain once per cycle.",
    cards: [
      {
        icon: "ri-radar-line",
        title: "Reach agent-native demand",
        desc: "Get in front of teams shipping autonomous agents that need to pay for APIs, inference, and data — today, not after a procurement cycle.",
      },
      {
        icon: "ri-plug-line",
        title: "Ship payments without new rails",
        desc: "4Mica is x402-compatible. Partners integrate with the HTTP client and server they already run, rather than building a payment stack from scratch.",
      },
      {
        icon: "ri-scales-3-line",
        title: "Commercial terms that fit",
        desc: "Revenue share, referral terms, and support commitments are agreed per partnership, so the arrangement matches what you actually bring.",
      },
      {
        icon: "ri-team-line",
        title: "Build with the core team",
        desc: "A shared channel with the engineers who maintain the protocol — integration review, roadmap visibility, and fast answers.",
      },
    ],
  },

  programs: {
    kicker: "Programs",
    title: "Which partner program is right for you?",
    lead: "Three ways to work with us. Most partnerships start with one and grow into another.",
    items: [
      {
        icon: "ri-code-box-line",
        label: "Technology partners",
        title: "Integrate 4Mica into your product",
        desc: "For platforms, agent frameworks, and API providers that want credit-backed payments built in.",
        points: [
          "Client and server SDKs in TypeScript and Python",
          "x402-compatible: wrap the fetch or middleware you already use",
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
        desc: "For facilitators, wallets, and infrastructure providers that move agent traffic and want it settled net rather than per request.",
        points: [
          "Facilitator endpoints for verification, settlement, and BLS certificates",
          "Coverage across Base and Ethereum networks",
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
        desc: "For funds, accelerators, communities, and agencies working with teams that are hitting the limits of per-request settlement.",
        points: [
          "Perks and onboarding support for your portfolio or community",
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
    lead: "The same support we give our own integrations.",
    items: [
      {
        icon: "ri-chat-3-line",
        title: "A direct channel to the core team",
        desc: "A shared channel with the engineers maintaining the protocol — not a ticket queue.",
      },
      {
        icon: "ri-tools-line",
        title: "Technical onboarding",
        desc: "Architecture review, integration walkthrough, and help sizing your first cycle.",
      },
      {
        icon: "ri-megaphone-line",
        title: "Co-marketing",
        desc: "Joint launch posts, documentation placement, and social amplification when you ship.",
      },
      {
        icon: "ri-rocket-line",
        title: "Early access",
        desc: "Protocol releases and new scheme features before they reach general availability.",
      },
      {
        icon: "ri-flask-line",
        title: "Testnet environments",
        desc: "Sandbox credentials and funded testnet flows so your team can build against real behaviour.",
      },
      {
        icon: "ri-file-list-3-line",
        title: "Clear commercial terms",
        desc: "Revenue share and referral terms written down per partnership, with the settlement records to audit them.",
      },
    ],
  },

  enablement: {
    kicker: "Go to market",
    title: "How we help you grow",
    lead: "Partnership does not stop at the integration. We back it with the same build, sell, market, and support motion we use for our own launches.",
    pillars: [
      {
        icon: "ri-hammer-line",
        label: "Build",
        title: "Ship the integration",
        points: [
          "Architecture review and a walkthrough of the x402 flow",
          "Client and server SDKs in TypeScript and Python",
          "Funded testnet credentials to build against real settlement",
        ],
      },
      {
        icon: "ri-hand-coin-line",
        label: "Co-sell",
        title: "Reach agent-native demand",
        points: [
          "Warm introductions to teams that need credit-backed payments",
          "Joint account planning and a shared deal channel",
          "Referral and revenue-share terms agreed per partnership",
        ],
      },
      {
        icon: "ri-megaphone-line",
        label: "Co-market",
        title: "Launch it loudly",
        points: [
          "Joint launch posts, docs placement, and social amplification",
          "A listing among the teams building on 4Mica",
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
    title: "Partners already shipping on 4Mica",
    lead: "Real integrations, not logos on a slide.",
    items: [
      {
        partner: "Aligned Layer",
        logo: "/assets/aligned_layer_logo.png",
        tag: "API monetization",
        challenge:
          "Aligned's verification is ultra-cheap — around $0.019 per task — but on-chain payment gas ran about $0.14, eight times the cost of the service itself. Per-task billing was nearly impossible to scale.",
        outcome:
          "Routing payments through 4Mica's credit layer clears each request instantly and settles balances net once per cycle, so the payment stops dwarfing the service.",
        stat: { value: "8×", label: "cheaper than paying gas per task" },
        href: "/solution",
        cta: "Read the case study",
      },
    ],
    invite: {
      title: "Building with 4Mica?",
      desc: "If your users are hitting the limits of per-request settlement, let's tell that story together.",
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
    lead: "Three steps from a first message to a live integration.",
    steps: [
      {
        order: "01",
        title: "Introduce your team",
        desc: "Tell us what you build and where payments hurt today. One call is usually enough to know if there is a fit.",
      },
      {
        order: "02",
        title: "Design the integration",
        desc: "We scope the flow together — guarantees, spending limits, settlement cadence — and agree the commercial terms in writing.",
      },
      {
        order: "03",
        title: "Launch together",
        desc: "Go live on mainnet with integration review, monitoring, and a joint announcement.",
      },
    ],
  },

  other: {
    kicker: "Also",
    title: "Other ways to work with us",
    items: [
      {
        icon: "ri-seedling-line",
        title: "Perks for funds and accelerators",
        desc: "Give your portfolio companies onboarding support and testnet credits so they can ship agent payments in their first sprint.",
        cta: "Set up perks",
        href: mailto(
          "Portfolio perks",
          "Hi 4Mica team,\n\nWe would like to offer 4Mica perks to our portfolio or cohort.\n\nOrganisation:\nPortfolio size:\n",
        ),
      },
      {
        icon: "ri-microscope-line",
        title: "Research collaboration",
        desc: "Working on payment cryptography, credit risk, or agent identity? We publish, review, and co-author with teams doing serious work.",
        cta: "Compare notes",
        href: `${links.mailto.dev}?subject=${encodeURIComponent("Research collaboration")}`,
      },
    ],
  },

  resources: {
    kicker: "Resources",
    title: "Everything you need to get started",
    items: [
      {
        icon: "ri-book-2-line",
        title: "Partner documentation",
        desc: "Integration guides, SDK references, and the full x402 protocol surface.",
        cta: "Read the docs",
        href: links.docs,
        external: true,
      },
      {
        icon: "ri-compass-3-line",
        title: "Explore the ecosystem",
        desc: "See the protocols and networks already building on 4Mica.",
        cta: "View programs",
        href: "#programs",
        external: false,
      },
      {
        icon: "ri-mail-send-line",
        title: "Talk to partnerships",
        desc: "Tell us what you are building and we will come back with a next step.",
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
    title: "Common questions",
    items: [
      {
        question: "Who is a good fit for a partnership?",
        answer:
          "Teams whose users make many small, frequent payments — agent platforms, API providers, inference and data services, wallets, and the funds and communities that back them. If per-request on-chain settlement is a cost or latency problem for you, there is something to talk about.",
      },
      {
        question: "Do we need to change our payment stack?",
        answer:
          "No. 4Mica is x402-compatible: clients wrap the fetch they already use and services add a middleware to the routes they already serve. Most integrations are a small change on both sides rather than a rebuild.",
      },
      {
        question: "How long does an integration take?",
        answer:
          "It depends on your stack, but the protocol surface is deliberately small — sign a guarantee, authorize the request against a limit, settle the cycle. We scope the work with you before anything is committed.",
      },
      {
        question: "How do commercial terms work?",
        answer:
          "They are agreed per partnership rather than fixed, because what partners bring differs — traffic, integration work, or introductions. Whatever is agreed is written down, and settlement records make it auditable.",
      },
    ],
    contactPrompt: "Something else on your mind?",
    contactCta: "Contact us",
  },

  cta: {
    title: "Let's build the payment layer for agents",
    lead: "Tell us what you are building and we will come back with a concrete next step.",
    primary: "Talk to partnerships",
    secondary: "Read the docs",
  },
} as const;
