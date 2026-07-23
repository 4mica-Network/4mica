import { links } from "@4mica/url";

export type SolutionPoint = {
  title: string;
  desc: string;
  icon: string;
};

export type SolutionUseCaseCard = {
  title: string;
  desc: string;
  icon: string;
};

export type SolutionUseCaseGroup = {
  label: string;
  cards: SolutionUseCaseCard[];
};

export type SolutionProcessStep = {
  order: string;
  title: string;
  desc: string;
};

export type SolutionResourceCard = {
  title: string;
  desc: string;
  icon: string;
  href: string;
};

export type SolutionFaq = {
  question: string;
  answer: string;
};

/**
 * Who a solution page is written for.
 *
 * `customer` pages address the people we sell to, in priority order:
 * facilitators first (the primary customer), then API providers and agent
 * frameworks. `useCase` pages address a market or scenario and can be reached
 * by any of them. Individual agents are deliberately absent — they spend
 * against an operator's collateral, so they are end users of the product
 * rather than a party we contract with. See `/solutions/agent-frameworks`.
 */
export type SolutionGroup = "customer" | "useCase";

export type SolutionContent = {
  slug: string;
  label: string;
  icon: string;
  group: SolutionGroup;
  description: string;
  headline: string;
  intro: string;
  /** Overrides the generated `<title>` when the label alone misses the terms. */
  seoTitle?: string;
  points: SolutionPoint[];
  useCases: SolutionUseCaseGroup[];
  process: SolutionProcessStep[];
  resources: SolutionResourceCard[];
  faqs: SolutionFaq[];
};

export const solutions: SolutionContent[] = [
  {
    slug: "facilitators",
    label: "Facilitators",
    icon: "ri-cloud-line",
    group: "customer",
    description: "Credit rails behind your facilitator",
    headline: "Offer credit-backed x402 payments under your own brand.",
    intro:
      "Facilitators are who 4Mica is built for first. Add the 4mica-credit scheme to the facilitator you already operate and the sellers behind it get instant authorization and netted settlement — you stay the interface your customers integrate with, and the clearing layer sits behind you.",
    seoTitle: "For Facilitators | x402 Facilitator Infrastructure | 4Mica",
    points: [
      {
        title: "You stay the interface",
        desc: "Your endpoint, your brand, your relationship. 4Mica runs behind it as the credit and clearing layer, the way a CDN sits behind a site.",
        icon: "ri-shield-keyhole-line",
      },
      {
        title: "A scheme, not a stack",
        desc: "Advertise 4mica-credit in /supported and call Core from your settle path. No collateral engine, netting logic, or contracts to build.",
        icon: "ri-puzzle-line",
      },
      {
        title: "Micropayments that clear",
        desc: "Requests are authorized off-chain in one round trip, so traffic that was uneconomic per transfer becomes viable.",
        icon: "ri-flashlight-line",
      },
    ],
    useCases: [
      {
        label: "For facilitator operators",
        cards: [
          {
            title: "Add credit to your scheme list",
            desc: "Keep your existing schemes and offer credit-backed payments alongside them from the same endpoint.",
            icon: "ri-stack-line",
          },
          {
            title: "Cut on-chain writes",
            desc: "Guarantees net down inside clearing cycles, so settlement cost stops scaling with request count.",
            icon: "ri-git-merge-line",
          },
          {
            title: "Keep the trust boundary",
            desc: "Core independently verifies every signed claim, so the facilitator never has to hold payer keys or custody funds.",
            icon: "ri-lock-2-line",
          },
        ],
      },
      {
        label: "For the sellers you serve",
        cards: [
          {
            title: "No prefunding to onboard",
            desc: "Buyers arrive with collateral-backed credit instead of a balance they had to top up with each seller first.",
            icon: "ri-user-add-line",
          },
          {
            title: "Verified before delivery",
            desc: "Expensive work runs only after a guarantee is accepted and a BLS certificate is returned.",
            icon: "ri-shield-check-line",
          },
        ],
      },
    ],
    process: [
      {
        order: "01",
        title: "Advertise the scheme",
        desc: "Add 4mica-credit and the CAIP-2 networks you cover to your /supported response so clients can discover it.",
      },
      {
        order: "02",
        title: "Call Core on settle",
        desc: "Submit the signed guarantee from your settle path, validate V1 and V2 structures, and return the BLS certificate.",
      },
      {
        order: "03",
        title: "Settle cycles net",
        desc: "Payable guarantees enter clearing cycles and commit as net positions on-chain instead of one transfer per request.",
      },
    ],
    resources: [
      {
        title: "Facilitator concepts",
        desc: "Where the facilitator sits between sellers and Core, and what it is not responsible for.",
        icon: "ri-book-open-line",
        href: `${links.docs}/core-concepts/facilitator`,
      },
      {
        title: "Facilitator API reference",
        desc: "The /supported, /verify, /settle, and /health contracts in full.",
        icon: "ri-code-box-line",
        href: `${links.docs}/api-reference/facilitator/settle`,
      },
      {
        title: "Talk to the team",
        desc: "Scope coverage, networks, and settlement cadence for your deployment.",
        icon: "ri-chat-3-line",
        href: links.mailto.partnership,
      },
    ],
    faqs: [
      {
        question: "Do we have to run 4Mica Core ourselves?",
        answer:
          "No. Your facilitator calls Core over its API to submit guarantees and receive BLS certificates. You can also point sellers at the hosted facilitator if you would rather not operate one at all.",
      },
      {
        question: "Do our sellers or buyers have to change clients?",
        answer:
          "Only to register the 4mica-credit scheme. Buyers add the scheme adapter to the fetch wrapper they already use and sellers keep their existing x402 middleware and routes.",
      },
      {
        question: "Does the facilitator take custody of funds?",
        answer:
          "No. Collateral is held by the protocol contracts and authorization comes from the payer's EIP-712 signature. A facilitator can delay or reject a request but cannot rewrite an authorization or move funds.",
      },
      {
        question: "How is this different from settling each x402 request?",
        answer:
          "Per-request settlement puts one transfer on-chain per call. With the credit scheme, requests are authorized off-chain against collateral and only the net position of a clearing cycle is committed.",
      },
    ],
  },
  {
    slug: "api-providers",
    label: "API providers",
    icon: "ri-plug-line",
    group: "customer",
    description: "Charge per request, no accounts",
    headline:
      "Charge per request without accounts, invoices, or prepaid balances.",
    intro:
      "Sellers are the second audience 4Mica serves. Protect a route with x402 middleware, advertise a price, and get paid in stablecoins as clearing cycles settle — no signup flow, no invoicing, and no per-request gas to absorb.",
    seoTitle: "For API Providers | Charge Per Request with x402 | 4Mica",
    points: [
      {
        title: "Price the route, not the customer",
        desc: "Advertise a price per endpoint and let any x402-compatible buyer pay it on first contact.",
        icon: "ri-price-tag-3-line",
      },
      {
        title: "Verify before you spend",
        desc: "Return 402 before expensive work and serve only once Core has accepted the guarantee.",
        icon: "ri-shield-check-line",
      },
      {
        title: "Revenue that reconciles",
        desc: "High-frequency traffic collapses into netted settlement with the guarantee records behind every figure.",
        icon: "ri-file-list-3-line",
      },
    ],
    useCases: [
      {
        label: "For API and platform teams",
        cards: [
          {
            title: "Monetize per call",
            desc: "Charge for inference, data, search, compute, or premium actions at the granularity you actually deliver them.",
            icon: "ri-cpu-line",
          },
          {
            title: "Skip the signup funnel",
            desc: "No account creation, API key issuance, or prepaid balance before a buyer's first paid request.",
            icon: "ri-user-shared-line",
          },
          {
            title: "Sell fractions of a cent",
            desc: "Per-request on-chain cost disappears, so small unit prices stop being eaten by settlement.",
            icon: "ri-coins-line",
          },
        ],
      },
      {
        label: "For finance and ops",
        cards: [
          {
            title: "Settle in stablecoins",
            desc: "Take payout in the assets your deployment enables, with USDC and USDT as the common defaults.",
            icon: "ri-exchange-dollar-line",
          },
          {
            title: "Audit any line item",
            desc: "Every net settlement expands back into the individual guarantees and certificates that produced it.",
            icon: "ri-search-eye-line",
          },
        ],
      },
    ],
    process: [
      {
        order: "01",
        title: "Protect a route",
        desc: "Add the payment middleware to one endpoint and configure scheme, network, asset, price, and payTo.",
      },
      {
        order: "02",
        title: "Verify, then serve",
        desc: "The middleware returns 402 with your price, checks the guarantee through the facilitator, and releases the response.",
      },
      {
        order: "03",
        title: "Get paid per cycle",
        desc: "Accepted guarantees settle as net positions, so revenue arrives without per-request on-chain cost.",
      },
    ],
    resources: [
      {
        title: "Payment middleware",
        desc: "Protect routes in Express, FastAPI, Hono, Next.js, and more.",
        icon: "ri-code-box-line",
        href: `${links.docs}/seller/payment-middleware`,
      },
      {
        title: "Seller quick start",
        desc: "Turn an API, model, dataset, or workflow into a paid 4Mica resource.",
        icon: "ri-book-open-line",
        href: `${links.docs}/seller/quick-start`,
      },
      {
        title: "Pricing",
        desc: "What 4Mica costs as your settlement volume grows.",
        icon: "ri-price-tag-3-line",
        href: "/pricing",
      },
    ],
    faqs: [
      {
        question: "Do buyers need an account with us first?",
        answer:
          "No. A buyer arrives with collateral-backed credit and pays on the first request, so there is no signup, key issuance, or prepaid balance in front of your revenue.",
      },
      {
        question: "What happens if a buyer cannot cover the request?",
        answer:
          "Core rejects an under-backed guarantee, so no certificate is returned and you simply do not serve the work. Keep anything expensive behind that check.",
      },
      {
        question: "Which frameworks are supported?",
        answer:
          "TypeScript and Python middleware covering Express, Hono, Next.js, Nuxt, SvelteKit, Remix, Bun, FastAPI, and Flask, plus the edge-safe server primitive for anything else.",
      },
      {
        question: "Can we still price dynamically?",
        answer:
          "Yes. Fixed prices are advertised in the 402 response, and for variable work you can quote a task with a maximum amount, expiry, and completion rules.",
      },
    ],
  },
  {
    slug: "agent-frameworks",
    label: "Agent frameworks and agents",
    icon: "ri-flow-chart",
    group: "customer",
    description: "Payment rails inside your framework",
    headline: "Give every agent in your framework a way to pay.",
    intro:
      "Frameworks and the teams that operate agents are 4Mica's third audience. Register the credit scheme once and every agent built on your framework can pay for APIs, tools, and data inside ordinary HTTP requests, spending against the operator's collateral within limits the operator sets.",
    seoTitle: "For Agent Frameworks and Agents | x402 Payments | 4Mica",
    points: [
      {
        title: "One integration, every agent",
        desc: "Register the scheme in your HTTP layer and each agent inherits the ability to pay — no per-agent wallet or funding step.",
        icon: "ri-git-branch-line",
      },
      {
        title: "Budgets the operator controls",
        desc: "Limit spend per request, task, seller, asset, or window, and require approval above a threshold.",
        icon: "ri-timer-flash-line",
      },
      {
        title: "Payment proof per task",
        desc: "Every spend carries a request ID and certificate, so payments tie back to the work that triggered them.",
        icon: "ri-shield-user-line",
      },
    ],
    useCases: [
      {
        label: "For framework maintainers",
        cards: [
          {
            title: "Ship payments as a capability",
            desc: "Offer paid tool use as a first-class feature rather than leaving each user to build a payment path.",
            icon: "ri-tools-line",
          },
          {
            title: "Keep the HTTP surface",
            desc: "The credit scheme wraps the client your framework already uses; a 402 becomes a signed retry.",
            icon: "ri-route-line",
          },
        ],
      },
      {
        label: "For teams running agents",
        cards: [
          {
            title: "Fund once, spend anywhere",
            desc: "One collateral position backs every service an agent reaches, instead of a balance per counterparty.",
            icon: "ri-wallet-3-line",
          },
          {
            title: "Stop a run cold",
            desc: "Pause signing, lower budgets, drop a seller, or rotate credentials without touching agent code.",
            icon: "ri-stop-circle-line",
          },
          {
            title: "Reconcile by task",
            desc: "Group spends by task ID to see what a run cost and which services it paid.",
            icon: "ri-list-check-2",
          },
        ],
      },
    ],
    process: [
      {
        order: "01",
        title: "Register the scheme",
        desc: "Add the 4mica-credit client adapter to the fetch or HTTP layer your framework hands to agents.",
      },
      {
        order: "02",
        title: "Set the operator's limits",
        desc: "Back the account with collateral and define the budgets and approval rules agents run inside.",
      },
      {
        order: "03",
        title: "Let agents transact",
        desc: "Each 402 becomes a signed guarantee and a retry, and the spend joins the operator's next clearing cycle.",
      },
    ],
    resources: [
      {
        title: "Buyer quick start",
        desc: "Give an agent spending power with limits, visibility, and payment proof.",
        icon: "ri-book-open-line",
        href: `${links.docs}/buyer/quick-start`,
      },
      {
        title: "Budgets and spending limits",
        desc: "Control how much an agent can spend, when it needs approval, and when it must stop.",
        icon: "ri-timer-flash-line",
        href: `${links.docs}/buyer/budgets-and-spending-limits`,
      },
      {
        title: "Automatic paid requests",
        desc: "Turn 402 responses into automatic paid retries from the client you already use.",
        icon: "ri-code-box-line",
        href: `${links.docs}/buyer/make-paid-requests-automatically`,
      },
    ],
    faqs: [
      {
        question: "Is an individual AI agent a 4Mica customer?",
        answer:
          "No. The customer is whoever operates the agent — the framework, the platform, or the team running it. That operator holds the collateral, sets the limits, and carries the commercial relationship. The agent is the end user that spends inside those limits, which is why there is no signup flow aimed at agents themselves.",
      },
      {
        question: "Does each agent need its own wallet and funding?",
        answer:
          "No. Agents sign against credit backed by the operator's collateral position, so adding an agent does not mean funding another balance.",
      },
      {
        question: "How do we cap what an agent can spend?",
        answer:
          "Set limits per request, task, seller, category, asset, network, or time window, and require manual approval for high-value payments or unfamiliar sellers.",
      },
      {
        question: "What happens when an agent misbehaves?",
        answer:
          "Pause execution, disable signing, remove sellers, lower budgets, or rotate credentials. Check for open guarantees before withdrawing collateral so nothing is settled against a position you are unwinding.",
      },
    ],
  },
  {
    slug: "agentic-commerce",
    label: "Agentic commerce",
    icon: "ri-robot-2-line",
    group: "useCase",
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
    useCases: [
      {
        label: "For agent builders",
        cards: [
          {
            title: "Let agents buy tools",
            desc: "Give autonomous workflows a payment method that works inside ordinary HTTP requests.",
            icon: "ri-tools-line",
          },
          {
            title: "Control spend windows",
            desc: "Set spending limits, expiry, and settlement windows so agents can move quickly inside defined risk bounds.",
            icon: "ri-timer-flash-line",
          },
          {
            title: "Keep UX invisible",
            desc: "No wallet popups or prefunding steps between the agent and the resource it needs.",
            icon: "ri-eye-off-line",
          },
        ],
      },
      {
        label: "For resource providers",
        cards: [
          {
            title: "Accept signed guarantees",
            desc: "Verify every request before serving paid content, compute, data, or actions.",
            icon: "ri-shield-user-line",
          },
          {
            title: "Batch your revenue",
            desc: "Collapse high-frequency agent traffic into settlement cycles that are easy to reconcile.",
            icon: "ri-stack-line",
          },
        ],
      },
    ],
    process: [
      {
        order: "01",
        title: "Give the agent credit",
        desc: "Back the agent with collateral and the spending limits, payer, recipient, and terms it can sign against.",
      },
      {
        order: "02",
        title: "Attach a payment guarantee",
        desc: "The agent signs each request off-chain and the provider verifies the guarantee before responding.",
      },
      {
        order: "03",
        title: "Settle the cycle on-chain",
        desc: "Many small agent payments become one auditable settlement against pooled collateral.",
      },
    ],
    resources: [
      {
        title: "x402 credit middleware",
        desc: "Wrap fetch or server middleware to accept 4Mica-backed x402 payments.",
        icon: "ri-code-box-line",
        href: "/#integration",
      },
      {
        title: "Protocol docs",
        desc: "Read the guarantee, clearing, and settlement flows before production rollout.",
        icon: "ri-book-open-line",
        href: links.docs,
      },
      {
        title: "Talk through agent risk",
        desc: "Design collateral, limits, and settlement windows for your agent network.",
        icon: "ri-chat-3-line",
        href: links.mailto.sales,
      },
    ],
    faqs: [
      {
        question:
          "Can an AI agent pay without holding funds in its own wallet?",
        answer:
          "Yes. The agent can spend against collateral-backed credit and attach signed guarantees to requests. Final settlement happens later on-chain.",
      },
      {
        question: "Does every agent request create a blockchain transaction?",
        answer:
          "No. Individual requests are authorized off-chain. The on-chain footprint is pushed to batched settlement windows.",
      },
      {
        question: "How do providers know a request will be paid?",
        answer:
          "Providers verify the guarantee, payer, amount, asset, and terms before serving the resource.",
      },
    ],
  },
  {
    slug: "ai-companies",
    label: "AI companies",
    icon: "ri-brain-line",
    group: "useCase",
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
    useCases: [
      {
        label: "For API teams",
        cards: [
          {
            title: "Monetize each inference",
            desc: "Price model calls, tool calls, embeddings, and data lookups without forcing prepaid balances.",
            icon: "ri-cpu-line",
          },
          {
            title: "Meter premium endpoints",
            desc: "Add payment checks to routes that are too costly to leave unmetered.",
            icon: "ri-speed-up-line",
          },
          {
            title: "Serve new customers faster",
            desc: "Let crypto-native users and agents start paying immediately from an existing wallet.",
            icon: "ri-user-add-line",
          },
        ],
      },
      {
        label: "For finance and ops",
        cards: [
          {
            title: "Reconcile by settlement cycle",
            desc: "Group many small requests into clear receivables and on-chain settlement records.",
            icon: "ri-file-list-3-line",
          },
          {
            title: "Offset costs with yield",
            desc: "Collateral can earn while it backs usage, helping reduce the cost of payment operations.",
            icon: "ri-percent-line",
          },
        ],
      },
    ],
    process: [
      {
        order: "01",
        title: "Add pricing to protected routes",
        desc: "Define which API endpoints require payment and what each request costs.",
      },
      {
        order: "02",
        title: "Verify payment headers",
        desc: "Use the middleware to validate x402-compatible guarantees before compute is spent.",
      },
      {
        order: "03",
        title: "Collect settled usage",
        desc: "Receive batched, auditable settlement instead of chasing invoices for tiny charges.",
      },
    ],
    resources: [
      {
        title: "SDK examples",
        desc: "Start with TypeScript or Python snippets for paid client and server flows.",
        icon: "ri-terminal-box-line",
        href: "/#integration",
      },
      {
        title: "Pricing models",
        desc: "Map per-call, per-tool, and per-output pricing to credit-backed settlement.",
        icon: "ri-price-tag-3-line",
        href: "/pricing",
      },
      {
        title: "Plan an API rollout",
        desc: "Walk through metering, limits, and settlement design with the 4Mica team.",
        icon: "ri-calendar-check-line",
        href: links.mailto.sales,
      },
    ],
    faqs: [
      {
        question: "Can 4Mica charge for individual API calls?",
        answer:
          "Yes. Each protected request can carry a signed payment guarantee, so you can meter inference, tools, data, and other API usage per call.",
      },
      {
        question: "Do customers need a new account balance inside my app?",
        answer:
          "No. Customers can pay through credit-backed x402 flows instead of maintaining a separate prepaid balance with you.",
      },
      {
        question: "How does this affect expensive AI workloads?",
        answer:
          "Payment verification happens before the response, so you can avoid serving costly compute to requests without a valid guarantee.",
      },
    ],
  },
  {
    slug: "cryptocurrency",
    label: "Cryptocurrency",
    icon: "ri-coin-line",
    group: "useCase",
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
    useCases: [
      {
        label: "For protocol teams",
        cards: [
          {
            title: "Keep settlement enforceable",
            desc: "Use signed credit guarantees while preserving a path to on-chain claims and dispute handling.",
            icon: "ri-shield-check-line",
          },
          {
            title: "Reduce transaction pressure",
            desc: "Move high-frequency payments off-chain until there is a meaningful net position to settle.",
            icon: "ri-arrow-left-right-line",
          },
          {
            title: "Support EVM ecosystems",
            desc: "Build payment flows that can follow users across Ethereum, Base, and compatible networks.",
            icon: "ri-links-line",
          },
        ],
      },
      {
        label: "For wallet users",
        cards: [
          {
            title: "Deposit once",
            desc: "Back many payment interactions from a single collateral position instead of signing every spend on-chain.",
            icon: "ri-wallet-3-line",
          },
          {
            title: "Withdraw with clear rules",
            desc: "Use timelocks and settlement windows that make open obligations visible before funds leave.",
            icon: "ri-lock-unlock-line",
          },
        ],
      },
    ],
    process: [
      {
        order: "01",
        title: "Route collateral to the vault",
        desc: "Users deposit supported crypto assets and retain a non-custodial position that backs future spends.",
      },
      {
        order: "02",
        title: "Issue off-chain certificates",
        desc: "Payment guarantees are signed and verified off-chain, then represented by settlement-ready certificates.",
      },
      {
        order: "03",
        title: "Claim or settle on-chain",
        desc: "Participants settle net obligations through the protocol instead of broadcasting every micro-payment.",
      },
    ],
    resources: [
      {
        title: "Settlement architecture",
        desc: "Understand how guarantees, certificates, and collateral interact.",
        icon: "ri-node-tree",
        href: links.docs,
      },
      {
        title: "Security model",
        desc: "Review non-custodial assumptions, dispute windows, and withdrawal timing.",
        icon: "ri-lock-line",
        href: "/#faq",
      },
      {
        title: "Discuss chain support",
        desc: "Coordinate network requirements for your protocol or app.",
        icon: "ri-chat-3-line",
        href: links.mailto.sales,
      },
    ],
    faqs: [
      {
        question: "Is 4Mica custodial?",
        answer:
          "No. Collateral remains controlled by protocol contracts and user positions. 4Mica does not need to hold customer funds.",
      },
      {
        question: "Why not settle every cryptocurrency payment directly?",
        answer:
          "Direct settlement works for larger transfers, but high-frequency micro-payments become expensive and slow. 4Mica keeps authorization fast and batches final settlement.",
      },
      {
        question: "Which chains can this support?",
        answer:
          "The architecture is designed for EVM-compatible settlement layers, with Ethereum, Base, and emerging rollups as natural targets.",
      },
    ],
  },
  {
    slug: "marketplaces",
    label: "Marketplaces",
    icon: "ri-store-2-line",
    group: "useCase",
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
    useCases: [
      {
        label: "For marketplace operators",
        cards: [
          {
            title: "Net buyer activity",
            desc: "Aggregate many purchases into cycle-level obligations instead of one transfer per order.",
            icon: "ri-shopping-bag-3-line",
          },
          {
            title: "Guarantee seller payouts",
            desc: "Give sellers cryptographic evidence that accepted purchases are backed by collateral.",
            icon: "ri-hand-coin-line",
          },
          {
            title: "Lower micro-payment friction",
            desc: "Make tiny digital goods, API calls, and service tasks viable without fee drag.",
            icon: "ri-scales-3-line",
          },
        ],
      },
      {
        label: "For marketplace participants",
        cards: [
          {
            title: "Buy without repeated top-ups",
            desc: "Spend across sellers from a credit-backed position rather than refilling balances constantly.",
            icon: "ri-bank-card-line",
          },
          {
            title: "Track settlement status",
            desc: "Expose simple states for authorized, netted, settled, and claimable payments.",
            icon: "ri-list-check-3",
          },
        ],
      },
    ],
    process: [
      {
        order: "01",
        title: "Authorize buyer spends",
        desc: "Each purchase is represented by a signed guarantee tied to the buyer, seller, and amount.",
      },
      {
        order: "02",
        title: "Net both sides of the market",
        desc: "Buyer debits and seller credits are aggregated across the settlement cycle.",
      },
      {
        order: "03",
        title: "Settle the marketplace ledger",
        desc: "One settlement flow clears the cycle and gives sellers enforceable payout records.",
      },
    ],
    resources: [
      {
        title: "Marketplace payment design",
        desc: "Model buyer guarantees, seller claims, and cycle settlement for your market.",
        icon: "ri-store-2-line",
        href: links.docs,
      },
      {
        title: "Batch settlement economics",
        desc: "Compare per-transaction settlement with netted marketplace cycles.",
        icon: "ri-bar-chart-grouped-line",
        href: "/pricing",
      },
      {
        title: "Design a rollout",
        desc: "Scope the buyer and seller experience with 4Mica.",
        icon: "ri-chat-3-line",
        href: links.mailto.sales,
      },
    ],
    faqs: [
      {
        question:
          "Can sellers trust payouts before the final settlement transaction?",
        answer:
          "Accepted purchases are backed by signed guarantees and collateral rules, giving sellers an auditable claim path.",
      },
      {
        question: "Does net settlement change marketplace fees?",
        answer:
          "It can reduce settlement overhead substantially because many small transfers are collapsed into fewer on-chain actions.",
      },
      {
        question: "What types of marketplaces fit this best?",
        answer:
          "Digital goods, agent services, APIs, compute, data, and other high-frequency markets benefit most from batched payment rails.",
      },
    ],
  },
  {
    slug: "platforms",
    label: "Platforms",
    icon: "ri-stack-line",
    group: "useCase",
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
    useCases: [
      {
        label: "For platform teams",
        cards: [
          {
            title: "Expose payments to every tenant",
            desc: "Add credit-backed x402 once, then let builders configure paid routes and resources.",
            icon: "ri-layout-grid-line",
          },
          {
            title: "Standardize billing primitives",
            desc: "Give teams the same credit, guarantee, and settlement model across many products.",
            icon: "ri-instance-line",
          },
          {
            title: "Tune terms by customer",
            desc: "Support different limits, windows, and service requirements without custom payment plumbing.",
            icon: "ri-equalizer-line",
          },
        ],
      },
      {
        label: "For tenant builders",
        cards: [
          {
            title: "Launch paid features faster",
            desc: "Monetize APIs, automations, content, and tools using rails already embedded in the platform.",
            icon: "ri-rocket-2-line",
          },
          {
            title: "Keep the native workflow",
            desc: "Charge inside the product experience without sending users to a separate checkout.",
            icon: "ri-window-line",
          },
        ],
      },
    ],
    process: [
      {
        order: "01",
        title: "Embed the payment layer",
        desc: "Integrate the client and server middleware into the platform's shared infrastructure.",
      },
      {
        order: "02",
        title: "Configure tenant terms",
        desc: "Set supported assets, limits, TTLs, and settlement behavior for each tenant or product line.",
      },
      {
        order: "03",
        title: "Operate one settlement system",
        desc: "Use consistent reporting, claims, and reconciliation across every builder using the platform.",
      },
    ],
    resources: [
      {
        title: "Platform integration guide",
        desc: "Plan shared middleware, tenant configuration, and operational handoffs.",
        icon: "ri-guide-line",
        href: links.docs,
      },
      {
        title: "Developer examples",
        desc: "Show tenants how to add paid routes with familiar SDKs.",
        icon: "ri-code-s-slash-line",
        href: "/#integration",
      },
      {
        title: "Architecture review",
        desc: "Map 4Mica into your platform's billing, risk, and support model.",
        icon: "ri-chat-3-line",
        href: links.mailto.sales,
      },
    ],
    faqs: [
      {
        question: "Can a platform configure different rules per tenant?",
        answer:
          "Yes. Terms such as limits, TTLs, supported routes, and settlement behavior can be modeled per customer or product area.",
      },
      {
        question: "Do tenant builders need to understand the whole protocol?",
        answer:
          "No. Platform teams can expose higher-level SDKs or configuration while 4Mica handles the underlying guarantees and settlement.",
      },
      {
        question: "Can this sit beside existing billing?",
        answer:
          "Yes. 4Mica is best used where usage-based, agentic, or crypto-native payments need instant authorization and later settlement.",
      },
    ],
  },
  {
    slug: "enterprises",
    label: "Enterprises",
    icon: "ri-building-2-line",
    group: "useCase",
    description: "Credit rails at scale",
    headline: "Credit rails for serious volume.",
    intro:
      "Run high-volume payments with auditable settlement, clear failure modes, and configurable SLAs. Every guarantee is enforceable on-chain and recoverable by design.",
    points: [
      {
        title: "Auditable by default",
        desc: "Every guarantee, clearing cycle, and settlement is verifiable end to end.",
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
    useCases: [
      {
        label: "For enterprise product teams",
        cards: [
          {
            title: "Support high-volume flows",
            desc: "Handle many small authorizations without making every interaction wait on-chain.",
            icon: "ri-dashboard-3-line",
          },
          {
            title: "Define enforceable rules",
            desc: "Use explicit settlement windows, dispute periods, and withdrawal timing instead of informal credit.",
            icon: "ri-file-shield-2-line",
          },
          {
            title: "Integrate with existing systems",
            desc: "Bring credit-backed payment events into monitoring, reconciliation, and support operations.",
            icon: "ri-plug-line",
          },
        ],
      },
      {
        label: "For risk and finance",
        cards: [
          {
            title: "Audit every obligation",
            desc: "Trace signed guarantees, BLS certificates, clearing cycles, and claims end to end.",
            icon: "ri-search-eye-line",
          },
          {
            title: "Set clear failure modes",
            desc: "Know what happens when a payer delays, disputes, settles, or withdraws collateral.",
            icon: "ri-alarm-warning-line",
          },
        ],
      },
    ],
    process: [
      {
        order: "01",
        title: "Map payment obligations",
        desc: "Identify the products, customers, and transaction types that need instant authorization.",
      },
      {
        order: "02",
        title: "Set controls and SLAs",
        desc: "Configure collateral, service windows, dispute assumptions, and operational reporting.",
      },
      {
        order: "03",
        title: "Scale with monitored settlement",
        desc: "Run production cycles with auditable records and clear escalation paths.",
      },
    ],
    resources: [
      {
        title: "Enterprise readiness",
        desc: "Review controls, audit trails, settlement states, and support workflows.",
        icon: "ri-building-4-line",
        href: links.docs,
      },
      {
        title: "Security questions",
        desc: "Start with the protocol FAQ and non-custodial settlement model.",
        icon: "ri-question-answer-line",
        href: "/#faq",
      },
      {
        title: "Contact sales",
        desc: "Discuss SLAs, implementation planning, and production rollout support.",
        icon: "ri-chat-3-line",
        href: links.mailto.sales,
      },
    ],
    faqs: [
      {
        question: "What makes 4Mica enterprise-ready?",
        answer:
          "It provides explicit payment states, auditable guarantees, configurable settlement terms, and non-custodial collateral rules.",
      },
      {
        question: "Can operations teams monitor failed or delayed settlement?",
        answer:
          "Yes. Settlement cycles, open obligations, claims, and withdrawal windows can be surfaced in operational tooling.",
      },
      {
        question: "Is this intended to replace all enterprise payments?",
        answer:
          "No. It is strongest for high-volume, programmable, usage-based flows where instant authorization and batched settlement matter.",
      },
    ],
  },
  {
    slug: "startups",
    label: "Startups",
    icon: "ri-rocket-2-line",
    group: "useCase",
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
    useCases: [
      {
        label: "For founders",
        cards: [
          {
            title: "Ship paid APIs early",
            desc: "Start charging for useful endpoints before building a full billing department.",
            icon: "ri-rocket-line",
          },
          {
            title: "Avoid prepaid wallet UX",
            desc: "Let users and agents pay as they go without forcing awkward top-up flows.",
            icon: "ri-wallet-line",
          },
          {
            title: "Keep the integration portable",
            desc: "Use the same x402-compatible flow from prototype to production.",
            icon: "ri-git-branch-line",
          },
        ],
      },
      {
        label: "For small teams",
        cards: [
          {
            title: "Start with SDKs",
            desc: "Add client and server wrappers around the HTTP stack you already use.",
            icon: "ri-terminal-window-line",
          },
          {
            title: "Grow into settlement controls",
            desc: "Begin simple, then add limits, reporting, and custom settlement terms as volume increases.",
            icon: "ri-line-chart-line",
          },
        ],
      },
    ],
    process: [
      {
        order: "01",
        title: "Protect one valuable route",
        desc: "Choose an endpoint or resource that should be paid and add the 4Mica middleware.",
      },
      {
        order: "02",
        title: "Test with credit payments",
        desc: "Send requests through an x402-compatible client and verify guarantees before serving responses.",
      },
      {
        order: "03",
        title: "Scale the same pattern",
        desc: "Add more paid routes, tune limits, and move from testnet experiments to production flows.",
      },
    ],
    resources: [
      {
        title: "Quick integration",
        desc: "Use the SDK snippets to get a paid route running quickly.",
        icon: "ri-flashlight-line",
        href: "/#integration",
      },
      {
        title: "Startup pricing",
        desc: "Understand the pieces that matter as usage grows.",
        icon: "ri-price-tag-3-line",
        href: "/pricing",
      },
      {
        title: "Founder support",
        desc: "Get help deciding where payments should enter your product.",
        icon: "ri-chat-3-line",
        href: links.mailto.sales,
      },
    ],
    faqs: [
      {
        question: "Can a startup integrate 4Mica before it has mature billing?",
        answer:
          "Yes. 4Mica is designed to wrap existing HTTP clients and middleware so teams can start with one paid route.",
      },
      {
        question: "Do I need to rebuild if volume increases?",
        answer:
          "No. The same credit-backed flow can scale from early experiments to larger settlement cycles.",
      },
      {
        question: "What should I monetize first?",
        answer:
          "Start with a route that has clear marginal cost or clear value, such as inference, data, premium actions, or automation.",
      },
    ],
  },
];

export const solutionSlugs = solutions.map((s) => s.slug);

export const getSolution = (slug: string): SolutionContent | undefined =>
  solutions.find((s) => s.slug === slug);

/** Audience pages, in customer priority order: facilitators lead. */
export const customerSolutions = solutions.filter(
  (s) => s.group === "customer",
);

/** Market and scenario pages, reachable from any audience. */
export const useCaseSolutions = solutions.filter((s) => s.group === "useCase");
