import type { AuthIdentity, AuthUser } from "@4mica/auth";
import { createClerkClient } from "@clerk/backend";
import { config } from "@config/index";
import { appLogger } from "@logger/index";
import {
  isUniqueViolation,
  uniqueViolationTargets,
} from "@utils/prisma-errors";
import { generateUsername } from "@utils/username";
import {
  findUserByClerkId,
  type UpsertOptions,
  type UserRow,
  upsertUser,
} from "./repository";

const CACHE_TTL_MS = 60_000;
export const CACHE_MAX_ENTRIES = 10_000;
const CREATE_ATTEMPTS = 3;

interface CacheEntry {
  user: AuthUser;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

const readCache = (clerkUserId: string): AuthUser | undefined => {
  const entry = cache.get(clerkUserId);
  if (!entry) {
    return undefined;
  }

  cache.delete(clerkUserId);
  if (entry.expiresAt <= Date.now()) {
    return undefined;
  }

  cache.set(clerkUserId, entry);
  return entry.user;
};

const writeCache = (clerkUserId: string, user: AuthUser): void => {
  cache.delete(clerkUserId);
  cache.set(clerkUserId, { user, expiresAt: Date.now() + CACHE_TTL_MS });

  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    cache.delete(oldest);
  }
};

const clerk = createClerkClient({
  secretKey: config.env.CLERK_SECRET_KEY,
  publishableKey: config.env.CLERK_PUBLISHABLE_KEY,
});

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

const upsert = async (
  identity: AuthIdentity,
  existing: UserRow | null,
): Promise<AuthUser> => {
  let options: UpsertOptions = {
    withEmail: true,
    username: generateUsername(),
  };

  for (let attempt = 1; ; attempt += 1) {
    try {
      return toAuthUser(await upsertUser(identity, existing, options));
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === CREATE_ATTEMPTS) {
        throw error;
      }

      const targets = uniqueViolationTargets(error);

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
  const cached = readCache(identity.clerkUserId);
  if (cached) {
    return cached;
  }

  const existing = await findUserByClerkId(identity.clerkUserId);

  const resolved =
    existing === null && identity.email === null
      ? await fetchProfile(identity)
      : identity;

  const user = await upsert(resolved, existing);

  writeCache(identity.clerkUserId, user);

  return user;
};

export const invalidateUser = (clerkUserId: string): void => {
  cache.delete(clerkUserId);
};

export const clearUserCache = (): void => cache.clear();
