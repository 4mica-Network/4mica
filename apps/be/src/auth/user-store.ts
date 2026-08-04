import type { AuthIdentity, AuthUser } from "@4mica/auth";
import { prisma } from "@4mica/db";
import { createClerkClient } from "@clerk/backend";
import { config } from "../config/index";
import { appLogger } from "../logger/index";

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  user: AuthUser;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

const clerk = createClerkClient({
  secretKey: config.env.CLERK_SECRET_KEY,
  publishableKey: config.env.CLERK_PUBLISHABLE_KEY,
});

const USER_FIELDS = {
  id: true,
  clerkUserId: true,
  email: true,
  name: true,
  avatarUrl: true,
} as const;

const fetchProfile = async (identity: AuthIdentity): Promise<AuthIdentity> => {
  try {
    const clerkUser = await clerk.users.getUser(identity.clerkUserId);

    return {
      ...identity,
      email:
        identity.email ??
        clerkUser.primaryEmailAddress?.emailAddress ??
        clerkUser.emailAddresses[0]?.emailAddress ??
        null,
      name: identity.name ?? clerkUser.fullName ?? null,
      avatarUrl: identity.avatarUrl ?? clerkUser.imageUrl ?? null,
    };
  } catch (error) {
    appLogger.warn("Could not backfill profile from Clerk", {
      clerkUserId: identity.clerkUserId,
      error,
    });
    return identity;
  }
};

const upsert = async (identity: AuthIdentity): Promise<AuthUser> =>
  prisma.user.upsert({
    where: { clerkUserId: identity.clerkUserId },
    create: {
      clerkUserId: identity.clerkUserId,
      email: identity.email,
      name: identity.name,
      avatarUrl: identity.avatarUrl,
    },
    update: {
      ...(identity.email !== null ? { email: identity.email } : {}),
      ...(identity.name !== null ? { name: identity.name } : {}),
      ...(identity.avatarUrl !== null ? { avatarUrl: identity.avatarUrl } : {}),
      lastSeenAt: new Date(),
    },
    select: USER_FIELDS,
  });

export const loadUser = async (identity: AuthIdentity): Promise<AuthUser> => {
  const cached = cache.get(identity.clerkUserId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.user;
  }

  const existing = await prisma.user.findUnique({
    where: { clerkUserId: identity.clerkUserId },
    select: USER_FIELDS,
  });

  const resolved =
    existing === null && identity.email === null
      ? await fetchProfile(identity)
      : identity;

  const user = await upsert(resolved);

  cache.set(identity.clerkUserId, {
    user,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return user;
};

export const clearUserCache = (): void => cache.clear();
