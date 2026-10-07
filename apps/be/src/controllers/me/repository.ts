import { prisma } from "@4mica/db";
import type {
  UpdateAccountInput,
  UpdateNotificationsInput,
  UpdateProfileInput,
  UpsertBusinessInput,
} from "./schema";

export const USER_SELECT = {
  id: true,
  clerkUserId: true,
  username: true,
  name: true,
  email: true,
  emailVerified: true,
  pendingEmail: true,
  phoneNumber: true,
  phoneNumberVerified: true,
  avatarUrl: true,
  description: true,
  bio: true,
  private: true,
  hidden: true,
  verified: true,
  locked: true,
  banned: true,
  theme: true,
  appTheme: true,
  language: true,
  timeZone: true,
  privacyMode: true,
  twoFactorEnabled: true,
  defaultHome: true,
  disableBranding: true,
  allowCustomBrandColor: true,
  primaryBrandColor: true,
  secondaryBrandColor: true,
  allowSEOIndexing: true,
  allowNotification: true,
  allowSMS: true,
  notificationPlacement: true,
  allowMonthlyEmails: true,
  allowInviteAcceptedEmails: true,
  allowChangelogNewsletterEmails: true,
  allowMarketingOnboardingEmails: true,
  allowPrivacyLegalEmails: true,
  allowDpaEmails: true,
  allowEmailVisibility: true,
  allowPhoneNumberVisibility: true,
  completeOnboarding: true,
  lastViewed: true,
  lastLogin: true,
  usageTime: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const BUSINESS_SELECT = {
  id: true,
  ownerId: true,
  legalName: true,
  tradingName: true,
  businessType: true,
  registrationNumber: true,
  taxId: true,
  vatNumber: true,
  industry: true,
  website: true,
  description: true,
  supportEmail: true,
  supportPhone: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  region: true,
  postalCode: true,
  country: true,
  statementDescriptor: true,
  payoutCurrency: true,
  kybStatus: true,
  kybVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const getProfile = async (userId: string) =>
  prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT });

/**
 * Who holds `username`, if anyone. Selects the id and nothing else — the
 * availability response must never leak whose handle it is.
 */
export const findUsernameOwner = async (username: string) =>
  prisma.user.findUnique({ where: { username }, select: { id: true } });

export const getBusiness = async (userId: string) =>
  prisma.business.findUnique({
    where: { ownerId: userId },
    select: BUSINESS_SELECT,
  });

type UpdatableUser =
  | UpdateProfileInput
  | UpdateAccountInput
  | UpdateNotificationsInput;

/**
 * A new address is parked in `pendingEmail` and only becomes `email` once its
 * owner follows the link sent to it (see controllers/verification). Writing it
 * straight to the unique `email` column would let anyone claim, or probe for,
 * an address they cannot read. Re-entering the current address cancels a
 * pending change.
 */
const routeEmailChange = async (
  userId: string,
  data: UpdatableUser,
): Promise<Record<string, unknown>> => {
  if (!("email" in data) || typeof data.email !== "string") {
    return data;
  }

  const { email, ...rest } = data;
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  return current?.email === email
    ? { ...rest, pendingEmail: null }
    : { ...rest, pendingEmail: email };
};

export const updateUser = async (userId: string, data: UpdatableUser) =>
  prisma.user.update({
    where: { id: userId },
    data: await routeEmailChange(userId, data),
    select: USER_SELECT,
  });

export const upsertBusiness = async (
  userId: string,
  data: UpsertBusinessInput,
) =>
  prisma.business.upsert({
    where: { ownerId: userId },
    // ownerId is written after the spread so a payload can never reassign the
    // row to someone else, independently of what the schema happens to strip.
    create: { legalName: "", ...data, ownerId: userId },
    update: data,
    select: BUSINESS_SELECT,
  });
