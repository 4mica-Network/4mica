import { prisma } from "@4mica/db";
import type {
  UpdateAccountInput,
  UpdateNotificationsInput,
  UpdateProfileInput,
  UpsertBusinessInput,
} from "../schemas/profile";

export const USER_SELECT = {
  id: true,
  clerkUserId: true,
  username: true,
  name: true,
  email: true,
  emailVerified: true,
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

export const getBusiness = async (userId: string) =>
  prisma.business.findUnique({
    where: { ownerId: userId },
    select: BUSINESS_SELECT,
  });

export const updateUser = async (
  userId: string,
  data: UpdateProfileInput | UpdateAccountInput | UpdateNotificationsInput,
) =>
  prisma.user.update({
    where: { id: userId },
    data,
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

export const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (error as { code?: string }).code === "P2002";

export const uniqueViolationTarget = (error: unknown): string => {
  const target = (error as { meta?: { target?: unknown } })?.meta?.target;
  if (Array.isArray(target)) {
    return target.join(", ");
  }
  return typeof target === "string" ? target : "field";
};
