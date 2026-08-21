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
      enum: ["taken", "reserved", null],
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
