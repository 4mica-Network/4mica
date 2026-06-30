import { links, routes } from "@4mica/url";

export const benefits = [
  "Users spend now and settle after 7 days",
  "No prefunding or prepaid balances for customers",
  "Every charge is backed by on-chain collateral",
  "BLS-signed guarantees prevent replay and double spend",
  "Default assets: ETH, USDC, USDT with versioned guarantees",
];

export const companyLinks = [
  { href: routes.about, label: "4Mica Mission" },
  { href: routes.team, label: "Team" },
  { href: `${routes.about}#roadmap`, label: "Roadmap" },
];

export const primaryLinks = [
  { href: "/pricing", label: "Pricing" },
  { href: "/solution", label: "Solution" },
];

export const githubUrl = links.social.githubCore;

export const hooks = [
  {
    label: "Star on GitHub",
    href: githubUrl,
  },
  {
    label: "Build with us",
    href: githubUrl,
  },
  {
    label: "Request early access",
    href: links.mailto.earlyAccess,
  },
];

export const teamMembers = [
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
    bio: "Everyone talks about AI and web3. Few understand money. 4mica exists because I grew tired of watching the web3 community claiming it had solved payments. It didn’t. So I decided to.",
  },
  {
    name: "Tomer Ashur",
    role: "Co-Founder",
    image: "/assets/tomer.png",
    imagePosition: "50% 15%",
    bio: "Cryptography-savant, ex-professor, ex-captain, now leading the instant transaction layer for commerce 2.0",
  },
];

export const aboutCards = [
  {
    title: "4Mica Mission",
    description:
      "Mission, product focus, and how 4Mica unlocks credit-backed payments",
    href: routes.about,
  },
  {
    title: "Team",
    description:
      "Meet the founders building the payment layer for instant commerce",
    href: routes.team,
  },
  {
    title: "Roadmap",
    description:
      "Track delivery milestones for the credit layer and network rollout",
    href: `${routes.about}#roadmap`,
  },
];

export const SECURITY_POINTS = [
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
];

export const steps = [
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
];
