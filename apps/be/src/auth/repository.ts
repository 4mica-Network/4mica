import type { AuthIdentity } from "@4mica/auth";
import { prisma } from "@4mica/db";

const USER_FIELDS = {
  id: true,
  clerkUserId: true,
  email: true,
  name: true,
  avatarUrl: true,
  banned: true,
  locked: true,
  deletedAt: true,
} as const;

export type UserRow = {
  id: string;
  clerkUserId: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  banned: boolean;
  locked: boolean;
  deletedAt: Date | null;
};

export interface UpsertOptions {
  withEmail: boolean;
  username: string;
}

/**
 * Clerk seeds the profile; after that the user owns it. On a returning account
 * only the gaps are filled, so a sign-in never overwrites an edited name,
 * avatar or (verified) email with whatever the session token carries.
 */
const profileGaps = (
  identity: AuthIdentity,
  existing: UserRow | null,
  withEmail: boolean,
) => ({
  ...(withEmail && identity.email !== null && existing?.email === null
    ? { email: identity.email }
    : {}),
  ...(identity.name !== null && existing !== null && !existing.name
    ? { name: identity.name }
    : {}),
  ...(identity.avatarUrl !== null && existing?.avatarUrl === null
    ? { avatarUrl: identity.avatarUrl }
    : {}),
});

export const findUserByClerkId = (clerkUserId: string) =>
  prisma.user.findUnique({
    where: { clerkUserId },
    select: USER_FIELDS,
  });

export const upsertUser = (
  identity: AuthIdentity,
  existing: UserRow | null,
  { withEmail, username }: UpsertOptions,
): Promise<UserRow> =>
  prisma.user.upsert({
    where: { clerkUserId: identity.clerkUserId },
    create: {
      clerkUserId: identity.clerkUserId,
      username,
      ...(withEmail && identity.email !== null
        ? { email: identity.email }
        : {}),
      ...(identity.name !== null ? { name: identity.name } : {}),
      ...(identity.avatarUrl !== null ? { avatarUrl: identity.avatarUrl } : {}),
    },
    update: {
      ...profileGaps(identity, existing, withEmail),
      lastSeenAt: new Date(),
      lastLogin: new Date(),
    },
    select: USER_FIELDS,
  });

export const findApiKeyByHash = (hashedKey: string) =>
  prisma.apiKey.findUnique({
    where: { hashedKey },
    select: {
      id: true,
      ownerId: true,
      revokedAt: true,
      expiresAt: true,
      owner: { select: { banned: true, locked: true, deletedAt: true } },
    },
  });

export const touchApiKey = (id: string) =>
  prisma.apiKey.update({ where: { id }, data: { lastUsedAt: new Date() } });
