export const NOTIFICATION_PLACEMENT = {
  TOP_LEFT: "topLeft",
  TOP_RIGHT: "topRight",
  BOTTOM_LEFT: "bottomLeft",
  BOTTOM_RIGHT: "bottomRight",
} as const;

export type NotificationPlacement =
  (typeof NOTIFICATION_PLACEMENT)[keyof typeof NOTIFICATION_PLACEMENT];

export const BUSINESS_TYPE = {
  SOLE_TRADER: "SOLE_TRADER",
  PARTNERSHIP: "PARTNERSHIP",
  LLC: "LLC",
  CORPORATION: "CORPORATION",
  NON_PROFIT: "NON_PROFIT",
} as const;

export type BusinessType = (typeof BUSINESS_TYPE)[keyof typeof BUSINESS_TYPE];

export const KYB_STATUS = {
  UNVERIFIED: "UNVERIFIED",
  PENDING: "PENDING",
  VERIFIED: "VERIFIED",
  REJECTED: "REJECTED",
} as const;

export type KybStatus = (typeof KYB_STATUS)[keyof typeof KYB_STATUS];

export interface User {
  id: string;
  clerkUserId: string;
  username: string | null;
  name: string;
  email: string | null;
  emailVerified: boolean;
  pendingEmail: string | null;
  phoneNumber: string | null;
  phoneNumberVerified: boolean;
  avatarUrl: string | null;
  description: string | null;
  bio: string | null;
  private: boolean;
  hidden: boolean;
  verified: boolean;
  locked: boolean;
  banned: boolean;
  theme: string;
  appTheme: string;
  language: string;
  timeZone: string;
  privacyMode: boolean;
  defaultHome: string;
  disableBranding: boolean;
  allowCustomBrandColor: boolean;
  primaryBrandColor: string;
  secondaryBrandColor: string;
  allowSEOIndexing: boolean;
  allowNotification: boolean;
  allowSMS: boolean;
  notificationPlacement: NotificationPlacement;
  allowMonthlyEmails: boolean;
  allowInviteAcceptedEmails: boolean;
  allowChangelogNewsletterEmails: boolean;
  allowMarketingOnboardingEmails: boolean;
  allowPrivacyLegalEmails: boolean;
  allowDpaEmails: boolean;
  allowEmailVisibility: boolean;
  allowPhoneNumberVisibility: boolean;
  completeOnboarding: boolean;
  lastViewed: string | null;
  lastLogin: string;
  usageTime: number;
  createdAt: string;
  updatedAt: string;
}

export interface Business {
  id: string;
  ownerId: string;
  legalName: string;
  tradingName: string | null;
  businessType: BusinessType | null;
  registrationNumber: string | null;
  taxId: string | null;
  vatNumber: string | null;
  industry: string | null;
  website: string | null;
  description: string | null;
  supportEmail: string | null;
  supportPhone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  statementDescriptor: string | null;
  payoutCurrency: string;
  kybStatus: KybStatus;
  kybVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const USERNAME_STATUS = {
  IDLE: "idle",
  CHECKING: "checking",
  AVAILABLE: "available",
  TAKEN: "taken",
  RESERVED: "reserved",
  BLACKLISTED: "blacklisted",
  ERROR: "error",
} as const;

export type UsernameStatus =
  (typeof USERNAME_STATUS)[keyof typeof USERNAME_STATUS];

export interface UsernameCheck {
  value: string;
  status: UsernameStatus;
}

export type UserState = {
  user: User | null;
  business: Business | null;
  usernameCheck: UsernameCheck;
  isLoading: boolean;
  savingSections: Record<string, boolean>;
  rollback: Partial<User> | null;
  businessRollback: Partial<Business> | null;
  error: string | null;
  validationIssues: Record<string, string>;
};
