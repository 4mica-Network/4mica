export const en = {
  common: {
    brandName: "4Mica",
    poweredBy: "Powered by 4Mica",
    backToProfile: "Back to profile",
    viewDocs: "View docs",
    openApi: "Open API",
    loading: "Loading…",
  },

  auth: {
    join: "Join",
    signIn: "Sign in",
    signInTitle: "Welcome back",
    signInSubtitle: "Sign in to your 4Mica account to continue.",
    signUpTitle: "Join 4Mica",
    signUpSubtitle:
      "Create an account to pay for this API with credit-backed guarantees.",
    google: "Continue with Google",
    error: "We could not complete that. Try again.",
    haveAccount: "Already have an account?",
    needAccount: "New to 4Mica?",
    dashboard: "Go to your dashboard",
  },

  profile: {
    verified: "Verified",
    verifiedHint: "This account has been verified by 4Mica.",
    agentsHeading: "Agents",
    apisHeading: "APIs",
    noAgentsTitle: "No agents yet",
    noApisTitle: "No APIs yet",
    noAgents: "No published agents yet.",
    noApis: "No published APIs yet.",
    noAgentsOwner:
      "None of your agents are public yet. Publish one to show it here.",
    noApisOwner:
      "None of your APIs are public yet. Publish one to show it here.",
  },

  agent: {
    statusPending: "Pending",
    statusActive: "Active",
    statusSuspended: "Suspended",
    operatedBy: "Operated by @{{username}}",
    aboutHeading: "About this agent",
    registered: "Registered",
    endpointLabel: "Endpoint",
    paidTo: "Paid to",
    docsLabel: "Docs",
  },

  api: {
    baseUrl: "Base URL",
    category: "Category",
    pricing: "Pricing",
    published: "Published {{date}}",
    publishedLabel: "Published",
    docsLabel: "Docs",
    paidTo: "Paid to",
    aboutHeading: "About this API",
    tagsHeading: "Tags",
    noTags: "No tags yet",

    perRequest: "per request",
    priceUnset: "Pricing not set",
    settlesOn: "Settles on {{network}}",

    endpointsHeading: "Endpoints",
    noEndpointsTitle: "No routes published",
    noEndpointsBody:
      "You have not listed the individual routes yet. Buyers still call the base URL above; adding routes makes the generated snippets specific.",
    endpointsLead:
      "The routes this API exposes. The first one is what the code below calls.",
  },

  faq: {
    heading: "Questions the seller has answered",
  },

  trust: {
    heading: "Before you pay",
    noRatingsTitle: "No ratings yet",
    noRatings:
      "No one has rated this yet. Check the seller's policies below, and prefer a listing whose owner has answered questions.",
    ratingCountOne: "{{count}} rating",
    ratingCountOther: "{{count}} ratings",
    verifiedCount: "{{count}} from verified buyers",
    verifiedPurchase: "Verified purchase",
    hasVerifiedBuyers: "Paid buyers have rated this",
    listedSince: "Listed since {{date}}",
    noPolicy: "No published policy",

    refundLabel: "If a call fails",
    uptimeLabel: "Uptime target",
    supportLabel: "Support response",
    rateLimitLabel: "Rate limit",
    dataLabel: "Your data",

    reviewsHeading: "What buyers say",
    noReviews: "No reviews yet",
    noReviewsBody:
      "Be the first to say whether this returned what you paid for.",
    ownerReplied: "{{name}} replied",
    signInToReview: "Sign in to rate this.",
    signInToReport: "Sign in to report this.",

    rateN: "Rate {{count}} out of 5",
    titlePlaceholder: "Sum it up in a line (optional)",
    bodyPlaceholder: "Did it return what you paid for? How fast? (optional)",
    postReview: "Post rating",
    updateReview: "Update rating",
    deleteReview: "Remove",
    saved: "Saved",

    reportAction: "Report this listing",
    reportSubmit: "Send report",
    reportPlaceholder: "What happened? Include a request id if you have one.",
    reportNote: "Goes to the owner and to 4Mica. Nothing is published.",
    reportThanks:
      "Thanks — the owner and 4Mica can see this now. Nothing about it is shown publicly.",
    reasonScam: "Scam",
    reasonNotWorking: "Does not work",
    reasonMisleadingPricing: "Misleading pricing",
    reasonSpam: "Spam",
    reasonOther: "Something else",

    errorSignedOut: "Sign in first.",
    errorOwnResource: "You cannot rate your own listing.",
    errorInvalidReview: "Check the rating and try again.",
    errorInvalidReport: "Choose a reason and try again.",
    errorAlreadyReported: "You already have an open report on this.",
    errorNotFound: "That listing is no longer available.",
    errorNoRating: "Pick a star rating first.",
    errorGeneric: "That did not go through. Try again.",
  },

  support: {
    heading: "Do you need help?",
    askSeller: "Ask {{name}}",
    askTeam: "Ask the 4Mica team",
    emailSubject: "Question about {{resource}}",
    supportSubject: "Integration help with {{resource}}",
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
    nativeAsset: "Native asset",
    erc20: "ERC-20",
    notPayable: "This API is not accepting 4Mica payments yet.",
    notPayableOwner:
      "Add a network and a receiving address to this listing to show integration instructions here.",

    // Agent
    agentBuyerHeading: "Call this agent",
    agentBuyerLead:
      "Pay per call with credit-backed guarantees. The client answers the 402, signs a guarantee, and retries — you get the response.",
    agentCallTitle: "Send it a request",
    agentCallLead:
      "Wrap the fetch you already use, then post your prompt to the agent's endpoint.",
    agentNotSellable: "This agent is not accepting 4Mica payments yet.",
    agentNotSellableOwner:
      "Add a receiving wallet and an endpoint URL to this agent to show payment instructions here.",

    agentRunHeading: "Run this agent",
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

  payWith: {
    heading: "Pay for this with 4Mica",
    lead: "Credit-backed payments per request. No subscription, no invoice, and no gas on the request path.",

    readyTitle: "Your account is ready to pay.",
    readyAction: "Check your collateral",

    signedOut: {
      accountTitle: "Create a 4Mica account",
      accountBody: "Free, and takes about a minute.",
      walletTitle: "Link and fund a wallet",
      walletBody:
        "Prove you control an address, then deposit collateral. Your credit is extended against it.",
      walletBodyOn:
        "Prove you control an address on {{network}}, then deposit collateral. Your credit is extended against it.",
      payTitle: "Copy the code below",
      payBody:
        "Wrap the fetch you already use. The client answers the 402, signs, and retries for you.",
      cta: "Create an account",
    },

    noWallet: {
      walletTitle: "Link a paying wallet",
      walletBody:
        "You have an account, but no wallet that can sign payments yet.",
      walletBodyOn:
        "You have an account, but no wallet on {{network}} that can sign payments yet.",
      fundTitle: "Deposit collateral",
      fundBody: "Credit is extended against what you deposit, not per request.",
      cta: "Go to wallets",
    },

    wrongNetwork: {
      title: "Add a wallet on {{network}}",
      body: "Your paying wallets are on {{networks}}. A wallet proved on one chain cannot settle on another.",
    },
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
