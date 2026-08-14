import type { AuthIdentity, AuthUser } from "@4mica/auth";
import { prisma } from "@4mica/db";
import { createClerkClient } from "@clerk/backend";
import { config } from "@config/index";
import { appLogger } from "@logger/index";
import {
  isUniqueViolation,
  uniqueViolationTargets,
} from "@services/prisma-errors";
import { generateUsername } from "@services/username";

const CACHE_TTL_MS = 60_000;

/** Handle collisions are a 40-bit coincidence; two retries is already generous. */
const CREATE_ATTEMPTS = 3;

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
  banned: true,
  locked: true,
  deletedAt: true,
} as const;

type UserRow = {
  id: string;
  clerkUserId: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  banned: boolean;
  locked: boolean;
  deletedAt: Date | null;
};

const toAuthUser = (row: UserRow): AuthUser => ({
  id: row.id,
  clerkUserId: row.clerkUserId,
  email: row.email,
  name: row.name,
  avatarUrl: row.avatarUrl,
  disabled: row.banned || row.locked || row.deletedAt !== null,
});

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

interface UpsertOptions {
  withEmail: boolean;
  /**
   * Written on create only. A returning user keeps whatever handle they have,
   * including one they picked themselves and including null on rows that
   * predate generated handles.
   */
  username: string;
}

const runUpsert = async (
  identity: AuthIdentity,
  { withEmail, username }: UpsertOptions,
): Promise<AuthUser> =>
  toAuthUser(
    await prisma.user.upsert({
      where: { clerkUserId: identity.clerkUserId },
      create: {
        clerkUserId: identity.clerkUserId,
        username,
        ...(withEmail && identity.email !== null
          ? { email: identity.email }
          : {}),
        ...(identity.name !== null ? { name: identity.name } : {}),
        ...(identity.avatarUrl !== null
          ? { avatarUrl: identity.avatarUrl }
          : {}),
      },
      update: {
        ...(withEmail && identity.email !== null
          ? { email: identity.email }
          : {}),
        ...(identity.name !== null ? { name: identity.name } : {}),
        ...(identity.avatarUrl !== null
          ? { avatarUrl: identity.avatarUrl }
          : {}),
        lastSeenAt: new Date(),
        lastLogin: new Date(),
      },
      select: USER_FIELDS,
    }),
  );

const upsert = async (identity: AuthIdentity): Promise<AuthUser> => {
  let options: UpsertOptions = {
    withEmail: true,
    username: generateUsername(),
  };

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await runUpsert(identity, options);
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === CREATE_ATTEMPTS) {
        throw error;
      }

      const targets = uniqueViolationTargets(error);

      // A generated handle lost a race with another insert. Draw a new one.
      if (targets.includes("username")) {
        appLogger.warn("Generated username was already taken, retrying", {
          clerkUserId: identity.clerkUserId,
        });
        options = { ...options, username: generateUsername() };
        continue;
      }

      if (!options.withEmail) {
        throw error;
      }

      appLogger.warn("Email already claimed by another user, skipping it", {
        clerkUserId: identity.clerkUserId,
      });
      options = { ...options, withEmail: false };
    }
  }
};

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
