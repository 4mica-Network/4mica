export const ORG_NAME = "4Mica Workspace";

export interface PageMeta {
  title: string;
  description: string;
  path?: string;
  index?: boolean;
}

export const APP_PAGES: PageMeta[] = [
  {
    index: true,
    title: "Overview",
    description: "Your agents, payments, and settlement at a glance.",
  },
  {
    path: "balances",
    title: "Balances",
    description: "Available and pending funds across your assets and networks.",
  },
  {
    path: "transactions",
    title: "Transactions",
    description: "x402 payments between agents on your account.",
  },
  {
    path: "payments",
    title: "Payments",
    description: "Every x402 payment your account has sent or received.",
  },
  {
    path: "payments/disputes",
    title: "Disputes",
    description:
      "Payments under dispute and their evidence and resolution status.",
  },
  {
    path: "wallet",
    title: "Wallet",
    description: "Your on-chain wallet, collateral, and withdrawal controls.",
  },
  {
    path: "customers",
    title: "Customers",
    description:
      "Counterparties that pay your agents and the value they drive.",
  },
  {
    path: "agents",
    title: "Agents",
    description: "Agents allowed to trade on your account.",
  },
  {
    path: "agents/:id",
    title: "Agent",
    description: "Agent details, pricing, policy, and verification.",
  },
  {
    path: "agents/:id/advanced",
    title: "Advanced",
    description: "Trading limits, suspension, and destructive actions.",
  },
  {
    path: "whitelist",
    title: "Whitelist",
    description: "Agents permitted to trade on your account.",
  },
  {
    path: "apps",
    title: "Apps",
    description: "Connected apps and integrations built on the 4Mica SDK.",
  },
  {
    path: "reports",
    title: "Reports",
    description: "Revenue, volume, and settlement reports you can export.",
  },
  {
    path: "identity",
    title: "Identity",
    description:
      "ERC-8004 validation identity, validators, and trust registries.",
  },
  {
    path: "create-invoice",
    title: "Invoice",
    description: "Bill a customer or agent for a one-off or recurring charge.",
  },
  {
    path: "help",
    title: "Help",
    description: "Guides, API docs, and support for building on 4Mica.",
  },
];

export interface SettingsPageMeta {
  path: string;
  title: string;
  description: string;
}

export const SETTINGS_PAGES: SettingsPageMeta[] = [
  {
    path: "account",
    title: "Account",
    description: "Your name, email, and how you sign in.",
  },
  {
    path: "profile",
    title: "Profile",
    description: "The public profile other agents see when they discover you.",
  },
  {
    path: "business",
    title: "Business",
    description: "Legal entity, address, and tax details for your account.",
  },
  {
    path: "team",
    title: "Team",
    description: "Invite teammates and manage their roles and permissions.",
  },
  {
    path: "notifications",
    title: "Notifications",
    description: "Control alerts for payments, disputes, and agent activity.",
  },
  {
    path: "plans",
    title: "Plans",
    description: "Your current plan, usage, and billing.",
  },
  {
    path: "compliance",
    title: "Compliance",
    description: "KYC/KYB status, verification, and regulatory documents.",
  },
  {
    path: "developer",
    title: "Developer",
    description: "API keys, webhooks, and the sandbox → live switch.",
  },
];
