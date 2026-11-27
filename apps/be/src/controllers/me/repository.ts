import { type Prisma, prisma } from "@4mica/db";
import { toE164 } from "@4mica/rules";
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
  bio: true,
  private: true,
  verified: true,
  locked: true,
  banned: true,
  theme: true,
  appTheme: true,
  language: true,
  timeZone: true,
  privacyMode: true,
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
  organizationId: true,
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

export const getUsername = async (userId: string): Promise<string | null> => {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });

  return row?.username ?? null;
};

export const isUsernameTaken = async (
  username: string,
  userId: string,
): Promise<boolean> => {
  const [user, organization] = await Promise.all([
    prisma.user.findUnique({ where: { username }, select: { id: true } }),
    prisma.organization.findFirst({
      where: {
        handle: username,
        NOT: { personal: true, memberships: { some: { userId } } },
      },
      select: { id: true },
    }),
  ]);

  return (user !== null && user.id !== userId) || organization !== null;
};

export const getBusiness = async (orgId: string) =>
  prisma.business.findUnique({
    where: { organizationId: orgId },
    select: BUSINESS_SELECT,
  });

type UpdatableUser =
  | UpdateProfileInput
  | UpdateAccountInput
  | UpdateNotificationsInput;

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

  return current?.email?.toLowerCase() === email
    ? { ...rest, pendingEmail: null }
    : { ...rest, pendingEmail: email };
};

const samePhone = (a: string | null, b: string | null): boolean =>
  (toE164(a) ?? a) === (toE164(b) ?? b);

const routePhoneChange = async (
  userId: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  if (!("phoneNumber" in data)) {
    return data;
  }

  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { phoneNumber: true },
  });

  return samePhone(
    current?.phoneNumber ?? null,
    (data.phoneNumber as string | null) ?? null,
  )
    ? data
    : { ...data, phoneNumberVerified: false };
};

const renamePersonalOrganization = async (
  tx: Prisma.TransactionClient,
  userId: string,
  handle: string | null,
) => {
  const personal = await tx.organization.findFirst({
    where: { personal: true, memberships: { some: { userId } } },
    select: { id: true },
  });

  if (personal) {
    await tx.organization.update({
      where: { id: personal.id },
      data: { handle },
    });
  }
};

export const updateUser = async (
  userId: string,
  data: UpdatableUser,
  previousUsername: string | null = null,
) => {
  const write = await routePhoneChange(
    userId,
    await routeEmailChange(userId, data),
  );
  const renames = "username" in data && data.username !== previousUsername;

  if (!renames) {
    return prisma.user.update({
      where: { id: userId },
      data: write,
      select: USER_SELECT,
    });
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: write,
      select: USER_SELECT,
    });
    await renamePersonalOrganization(tx, userId, updated.username);
    return updated;
  });
};

export const markPhoneVerified = async (userId: string) =>
  prisma.user.update({
    where: { id: userId },
    data: { phoneNumberVerified: true },
    select: USER_SELECT,
  });

export const upsertBusiness = async (
  orgId: string,
  data: UpsertBusinessInput,
) =>
  prisma.business.upsert({
    where: { organizationId: orgId },
    create: { legalName: "", ...data, organizationId: orgId },
    update: data,
    select: BUSINESS_SELECT,
  });
