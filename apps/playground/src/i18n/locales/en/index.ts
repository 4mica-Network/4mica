/**
 * Compile-time message catalogue, following apps/web/i18n rather than
 * apps/dashboard's react-i18next.
 *
 * react-i18next init()s a module-scope singleton — per-process mutable state
 * shared across concurrent SSR requests — and forces "use client" on every
 * component that translates anything, which would defeat server rendering on a
 * read-mostly page. A frozen object has none of those problems and costs
 * nothing at runtime.
 */
export const en = {
  common: {
    brandName: "4Mica",
    poweredBy: "Powered by 4Mica",
    backToProfile: "Back to profile",
    viewDocs: "View docs",
    openApi: "Open API",
    loading: "Loading…",
  },

  profile: {
    verified: "Verified",
    verifiedHint: "This account has been verified by 4Mica.",
    agentsHeading: "Agents",
    apisHeading: "APIs",
    noAgents: "No published agents yet.",
    noApis: "No published APIs yet.",
    noAgentsOwner:
      "None of your agents are public yet. Publish one to show it here.",
    noApisOwner:
      "None of your APIs are public yet. Publish one to show it here.",
  },

  agent: {
    status: "Status",
    statusPending: "Pending",
    statusActive: "Active",
    statusSuspended: "Suspended",
    operatedBy: "Operated by @{{username}}",
    aboutHeading: "About this agent",
    registered: "Registered",
  },

  api: {
    baseUrl: "Base URL",
    category: "Category",
    pricing: "Pricing",
    published: "Published {{date}}",
    aboutHeading: "About this API",
    tagsHeading: "Tags",
  },

  integration: {
    heading: "Integration",
    copy: "Copy",
    copied: "Copied",
    viewDocs: "Read the full integration guide",

    installTitle: "Install the SDK",
    installLead: "Add the client packages to your project.",

    // API listing
    apiLead:
      "Pay per call with credit-backed guarantees. No prepaid balance, no gas on the request path.",
    callTitle: "Call this API",
    callLead:
      "Wrap the fetch you already use. The client answers the 402, signs a guarantee, and retries — you get the response.",
    receiptTitle: "See your transactions",
    receiptLead:
      "Each paid response carries its settled payment. Pair it with your own task log to make the spend auditable.",
    endpointsTitle: "Priced endpoints",
    nativeAsset: "Native asset",
    erc20: "ERC-20",
    notPayable: "This API is not accepting 4Mica payments yet.",
    notPayableOwner:
      "Add a network and a receiving address to this listing to show integration instructions here.",

    // Agent
    agentLead:
      "This agent pays for the requests it makes. Wire it up once and every call it issues is credit-backed.",
    payTitle: "Pay as this agent",
    payLead:
      "Register the 4Mica scheme against the agent's signer, then wrap its fetch.",
    collateralTitle: "Fund it and check its credit",
    collateralLead:
      "Credit is extended against deposited collateral. Read the agent's positions to see what is available and what is locked.",
    walletOwnerOnly:
      "The agent's wallet address is only shown to you, the owner.",
    inactiveAgent:
      "This agent cannot sign payments until it is active. The setup below still applies.",
  },

  visibility: {
    public: "Public",
    unlisted: "Unlisted",
    private: "Private",
    unlistedHint: "Reachable by direct link, hidden from your profile.",
    privateHint: "Only visible to you.",
  },

  owner: {
    previewTitle: "Only you can see this",
    previewLead:
      "Your profile is private. Publish it to make this page visible to everyone.",
    publishAction: "Profile settings",
    refreshAction: "Refresh",
    refreshed: "Refreshed",
  },

  errors: {
    notFoundTitle: "Nothing here",
    notFoundLead: "That page does not exist.",
    profileNotFoundTitle: "@{{username}} is available",
    profileNotFoundLead:
      "No one has claimed this handle yet. Create an account to take it.",
    profileNotFoundAction: "Claim this handle",
    agentNotFound: "That agent is not available.",
    apiNotFound: "That API is not available.",
    genericTitle: "Something went wrong",
    genericLead:
      "The page failed to load. Try again, and let us know if it keeps happening.",
    retry: "Try again",
    home: "Go home",
  },
} as const;
