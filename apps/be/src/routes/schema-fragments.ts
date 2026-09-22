const bool = { type: "boolean" } as const;
const str = { type: "string" } as const;
const nullStr = { type: "string", nullable: true } as const;
const int = { type: "integer" } as const;
const date = { type: "string", format: "date-time" } as const;
const nullDate = {
  type: "string",
  format: "date-time",
  nullable: true,
} as const;

export const userResponseSchema = {
  type: "object",
  required: ["id", "clerkUserId"],
  properties: {
    id: str,
    clerkUserId: str,
    username: nullStr,
    name: str,
    email: nullStr,
    emailVerified: bool,
    phoneNumber: nullStr,
    phoneNumberVerified: bool,
    avatarUrl: nullStr,
    description: nullStr,
    bio: nullStr,
    private: bool,
    hidden: bool,
    verified: bool,
    locked: bool,
    banned: bool,
    theme: str,
    appTheme: str,
    language: str,
    timeZone: str,
    privacyMode: bool,
    twoFactorEnabled: bool,
    defaultHome: str,
    disableBranding: bool,
    allowCustomBrandColor: bool,
    primaryBrandColor: str,
    secondaryBrandColor: str,
    allowSEOIndexing: bool,
    allowNotification: bool,
    allowSMS: bool,
    notificationPlacement: {
      type: "string",
      enum: ["topLeft", "topRight", "bottomLeft", "bottomRight"],
    },
    allowMonthlyEmails: bool,
    allowInviteAcceptedEmails: bool,
    allowChangelogNewsletterEmails: bool,
    allowMarketingOnboardingEmails: bool,
    allowPrivacyLegalEmails: bool,
    allowDpaEmails: bool,
    allowEmailVisibility: bool,
    allowPhoneNumberVisibility: bool,
    completeOnboarding: bool,
    lastViewed: nullStr,
    lastLogin: date,
    usageTime: int,
    createdAt: date,
    updatedAt: date,
  },
} as const;

export const businessResponseSchema = {
  type: "object",
  nullable: true,
  required: ["id", "ownerId"],
  properties: {
    id: str,
    ownerId: str,
    legalName: str,
    tradingName: nullStr,
    businessType: {
      type: "string",
      nullable: true,
      enum: [
        "SOLE_TRADER",
        "PARTNERSHIP",
        "LLC",
        "CORPORATION",
        "NON_PROFIT",
        null,
      ],
    },
    registrationNumber: nullStr,
    taxId: nullStr,
    vatNumber: nullStr,
    industry: nullStr,
    website: nullStr,
    description: nullStr,
    supportEmail: nullStr,
    supportPhone: nullStr,
    addressLine1: nullStr,
    addressLine2: nullStr,
    city: nullStr,
    region: nullStr,
    postalCode: nullStr,
    country: nullStr,
    statementDescriptor: nullStr,
    payoutCurrency: str,
    kybStatus: {
      type: "string",
      enum: ["UNVERIFIED", "PENDING", "VERIFIED", "REJECTED"],
    },
    kybVerifiedAt: nullDate,
    createdAt: date,
    updatedAt: date,
  },
} as const;

export const meResponseSchema = {
  type: "object",
  required: ["user"],
  properties: {
    user: userResponseSchema,
    business: businessResponseSchema,
  },
} as const;

export const apiKeyResponseSchema = {
  type: "object",
  required: ["id", "name", "prefix"],
  properties: {
    id: str,
    name: str,
    prefix: str,
    last4: str,
    lastUsedAt: nullDate,
    expiresAt: nullDate,
    revokedAt: nullDate,
    createdAt: date,
    updatedAt: date,
  },
} as const;

export const createdApiKeyResponseSchema = {
  type: "object",
  required: ["apiKey", "plaintext"],
  properties: {
    apiKey: apiKeyResponseSchema,
    // Present in this one response and never retrievable again.
    plaintext: str,
  },
} as const;

export const webhookResponseSchema = {
  type: "object",
  required: ["id", "url", "events", "status"],
  properties: {
    id: str,
    url: str,
    description: nullStr,
    events: { type: "array", items: str },
    status: { type: "string", enum: ["ENABLED", "DISABLED"] },
    secretPrefix: str,
    lastDeliveryAt: nullDate,
    lastDeliveryStatus: { type: "integer", nullable: true },
    failureCount: int,
    createdAt: date,
    updatedAt: date,
  },
} as const;

export const createdWebhookResponseSchema = {
  type: "object",
  required: ["webhook", "plaintext"],
  properties: {
    webhook: webhookResponseSchema,
    plaintext: str,
  },
} as const;

export const webhookEventsResponseSchema = {
  type: "array",
  items: {
    type: "object",
    required: ["slug", "group", "description"],
    properties: { slug: str, group: str, description: str },
  },
} as const;

/**
 * Deliberately says nothing about who holds a taken handle — the serializer
 * strips anything the handler did not put here, which is the point.
 */
export const usernameAvailabilityResponseSchema = {
  type: "object",
  required: ["username", "available"],
  properties: {
    username: str,
    available: bool,
    reason: {
      type: "string",
      nullable: true,
      enum: ["taken", "reserved", "blacklisted", null],
    },
  },
} as const;

export const bannerResponseSchema = {
  type: "array",
  items: {
    type: "object",
    required: ["id"],
    properties: {
      id: str,
      title: nullStr,
      message: nullStr,
      url: nullStr,
      thumbnailUrl: nullStr,
      videoUrl: nullStr,
      alt: nullStr,
      isVideo: bool,
    },
  },
} as const;

const paymentNetworkEnum = {
  type: "string",
  enum: ["BASE", "BASE_SEPOLIA", "ETHEREUM_SEPOLIA"],
} as const;

export const walletResponseSchema = {
  type: "object",
  required: ["id", "label", "address", "network", "role", "status"],
  properties: {
    id: str,
    label: str,
    description: nullStr,
    address: str,
    network: paymentNetworkEnum,
    role: { type: "string", enum: ["PAYER", "RECIPIENT", "BOTH"] },
    status: { type: "string", enum: ["ACTIVE", "PAUSED", "RETIRED"] },
    isDefault: bool,
    verifiedAt: date,
    verificationMethod: {
      type: "string",
      enum: ["EOA_SIGNATURE", "ERC1271"],
    },
    verifiedChainId: int,
    createdAt: date,
    updatedAt: date,
  },
} as const;

export const walletListResponseSchema = {
  type: "object",
  required: ["items", "total", "page", "limit"],
  properties: {
    items: { type: "array", items: walletResponseSchema },
    total: int,
    page: int,
    limit: int,
  },
} as const;

export const walletNonceResponseSchema = {
  type: "object",
  required: ["nonce", "message", "expiresAt"],
  properties: {
    nonce: str,
    message: str,
    expiresAt: date,
  },
} as const;

const visibilityEnum = {
  type: "string",
  enum: ["PRIVATE", "UNLISTED", "PUBLIC"],
} as const;

const httpMethodEnum = {
  type: "string",
  enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
} as const;

const nullableNetworkEnum = {
  type: "string",
  nullable: true,
  enum: ["BASE", "BASE_SEPOLIA", "ETHEREUM_SEPOLIA", null],
} as const;

export const apiEndpointResponseSchema = {
  type: "object",
  required: ["id", "method", "path"],
  properties: {
    id: str,
    method: httpMethodEnum,
    path: str,
    summary: nullStr,
    // A string, not a number: Decimal(38,18) does not survive an IEEE-754
    // double, and this one is a price.
    priceAmount: nullStr,
    sortOrder: int,
  },
} as const;

export const apiListingResponseSchema = {
  type: "object",
  required: ["id", "slug", "name", "visibility"],
  properties: {
    id: str,
    slug: str,
    name: str,
    summary: nullStr,
    description: nullStr,
    baseUrl: nullStr,
    docsUrl: nullStr,
    category: nullStr,
    tags: { type: "array", items: str },
    priceLabel: nullStr,
    visibility: visibilityEnum,
    publishedAt: nullDate,
    walletId: nullStr,
    network: nullableNetworkEnum,
    payToAddress: nullStr,
    assetAddress: nullStr,
    priceAmount: nullStr,
    priceCurrency: nullStr,
    x402Endpoint: nullStr,
    createdAt: date,
    updatedAt: date,
    endpoints: { type: "array", items: apiEndpointResponseSchema },
  },
} as const;

export const apiListingListResponseSchema = {
  type: "object",
  required: ["items", "total", "page", "limit"],
  properties: {
    items: { type: "array", items: apiListingResponseSchema },
    total: int,
    page: int,
    limit: int,
  },
} as const;

/**
 * Both wallet addresses are present here because this is the OWNER's view of
 * their own agent. The public projection lives in apps/playground and omits
 * `walletAddress` and `creditLimit` on purpose.
 */
export const agentResponseSchema = {
  type: "object",
  required: ["id", "name", "status", "visibility", "network"],
  properties: {
    id: str,
    slug: nullStr,
    name: str,
    headline: nullStr,
    description: nullStr,
    avatarUrl: nullStr,
    docsUrl: nullStr,
    status: { type: "string", enum: ["PENDING", "ACTIVE", "SUSPENDED"] },
    visibility: visibilityEnum,
    network: paymentNetworkEnum,

    walletAddress: nullStr,
    payerWalletId: nullStr,
    creditLimit: str,

    walletId: nullStr,
    payToAddress: nullStr,
    assetAddress: nullStr,
    priceAmount: nullStr,
    priceCurrency: nullStr,
    priceLabel: nullStr,
    endpointUrl: nullStr,
    x402Endpoint: nullStr,

    publishedAt: nullDate,
    createdAt: date,
    updatedAt: date,
  },
} as const;

export const agentListResponseSchema = {
  type: "object",
  required: ["items", "total", "page", "limit"],
  properties: {
    items: { type: "array", items: agentResponseSchema },
    total: int,
    page: int,
    limit: int,
  },
} as const;

const paymentStatusEnum = {
  type: "string",
  enum: ["PENDING", "SETTLED", "FAILED"],
} as const;

export const paymentResponseSchema = {
  type: "object",
  required: ["id", "payerAddress", "recipientAddress", "amount", "status"],
  properties: {
    id: str,
    listingId: nullStr,
    agentId: nullStr,
    payerAddress: str,
    recipientAddress: str,
    network: paymentNetworkEnum,
    assetAddress: nullStr,
    amount: str,
    status: paymentStatusEnum,
    failureReason: nullStr,
    reqId: str,
    txHash: nullStr,
    resource: nullStr,
    description: nullStr,
    settledAt: nullStr,
    createdAt: date,
    updatedAt: date,
    listingSlug: nullStr,
    listingName: nullStr,
    agentSlug: nullStr,
    agentName: nullStr,
    direction: { type: "string", enum: ["sent", "received"] },
  },
} as const;

export const paymentListResponseSchema = {
  type: "object",
  required: ["items", "total", "page", "limit"],
  properties: {
    items: { type: "array", items: paymentResponseSchema },
    total: int,
    page: int,
    limit: int,
  },
} as const;

const paymentTotalsSchema = {
  type: "object",
  required: ["count", "settledCount", "pendingCount", "failedCount"],
  properties: {
    count: int,
    settledCount: int,
    pendingCount: int,
    failedCount: int,
    volume: {
      type: "array",
      items: {
        type: "object",
        properties: {
          assetAddress: nullStr,
          network: str,
          amount: str,
        },
      },
    },
  },
} as const;

export const paymentSummaryResponseSchema = {
  type: "object",
  required: ["sent", "received"],
  properties: {
    sent: paymentTotalsSchema,
    received: paymentTotalsSchema,
  },
} as const;

const monthlyBucketSchema = {
  type: "object",
  required: ["month", "settledCount", "failedCount"],
  properties: {
    month: str,
    settledCount: int,
    failedCount: int,
    volume: {
      type: "array",
      items: {
        type: "object",
        properties: { assetAddress: nullStr, network: str, amount: str },
      },
    },
  },
} as const;

export const paymentStatsResponseSchema = {
  type: "object",
  required: ["months", "received", "sent"],
  properties: {
    months: { type: "array", items: str },
    received: { type: "array", items: monthlyBucketSchema },
    sent: { type: "array", items: monthlyBucketSchema },
  },
} as const;

export const batchDeleteResponseSchema = {
  type: "object",
  required: ["deleted", "notFound"],
  properties: {
    deleted: { type: "array", items: str },
    notFound: { type: "array", items: str },
  },
} as const;

export const verificationSentResponseSchema = {
  type: "object",
  required: ["sent"],
  properties: { sent: bool },
} as const;

export const errorResponseSchema = {
  type: "object",
  required: ["error", "message"],
  properties: {
    error: str,
    message: str,
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: { path: str, message: str },
      },
    },
  },
} as const;

/**
 * Responses every rate-limited route can produce regardless of its handler:
 * 429 from the limiter, 503 while the instance is draining.
 */
export const limitedResponses = {
  429: errorResponseSchema,
  503: errorResponseSchema,
} as const;
