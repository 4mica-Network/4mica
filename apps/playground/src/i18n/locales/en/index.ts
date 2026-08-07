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
    copyLink: "Copy link",
    copied: "Copied",
    viewDocs: "View docs",
    openApi: "Open API",
    loading: "Loading…",
  },

  home: {
    title: "Public profiles on 4Mica",
    lead: "Every 4Mica account gets a public page for the agents and APIs it operates.",
    searchLabel: "Find a profile",
    searchPlaceholder: "username",
    searchAction: "Go",
    searchHint: "Profiles live at 4mica.io/<username>.",
    claimTitle: "Want one?",
    claimLead:
      "Create an account, pick a handle in Settings → Profile, and publish.",
    claimAction: "Create an account",
  },

  profile: {
    joined: "Joined {{date}}",
    verified: "Verified",
    verifiedHint: "This account has been verified by 4Mica.",
    agentsHeading: "Agents",
    agentsLead: "Autonomous agents this account operates on the credit layer.",
    apisHeading: "APIs",
    apisLead: "Endpoints this account publishes for other agents to call.",
    noAgents: "No published agents yet.",
    noApis: "No published APIs yet.",
    noAgentsOwner:
      "None of your agents are public yet. Publish one to show it here.",
    noApisOwner:
      "None of your APIs are public yet. Publish one to show it here.",
    contact: "Contact",
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
    manageAction: "Manage in dashboard",
    refreshAction: "Refresh",
    refreshed: "Refreshed",
    viewingOwn: "You are viewing your own profile.",
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
