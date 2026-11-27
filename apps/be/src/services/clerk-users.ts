import { clerk } from "./clerk";

export type ClerkUser = Awaited<ReturnType<typeof clerk.users.getUser>>;

const TTL_MS = 5 * 60_000;
const MAX_ENTRIES = 10_000;

interface Entry {
  user: Promise<ClerkUser>;
  expiresAt: number;
}

const cache = new Map<string, Entry>();

const remember = (clerkUserId: string, user: Promise<ClerkUser>) => {
  cache.delete(clerkUserId);
  cache.set(clerkUserId, { user, expiresAt: Date.now() + TTL_MS });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    cache.delete(oldest);
  }
};

export const getClerkUser = (clerkUserId: string): Promise<ClerkUser> => {
  const entry = cache.get(clerkUserId);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.user;
  }

  const pending = clerk.users.getUser(clerkUserId);
  remember(clerkUserId, pending);
  pending.catch(() => {
    if (cache.get(clerkUserId)?.user === pending) {
      cache.delete(clerkUserId);
    }
  });
  return pending;
};

export const invalidateClerkUser = (clerkUserId: string): void => {
  cache.delete(clerkUserId);
};

export const clearClerkUserCache = (): void => cache.clear();

export const verifiedEmailDomains = (user: ClerkUser): string[] => [
  ...new Set(
    (user.emailAddresses ?? [])
      .filter((entry) => entry.verification?.status === "verified")
      .map((entry) => emailDomain(entry.emailAddress))
      .filter((domain): domain is string => domain !== null),
  ),
];

export const primaryEmailDomain = (user: ClerkUser): string | null => {
  const primary =
    (user.emailAddresses ?? []).find(
      (entry) => entry.id === user.primaryEmailAddressId,
    ) ?? null;
  return primary ? emailDomain(primary.emailAddress) : null;
};

export const samlConnectionIds = (user: ClerkUser): string[] => [
  ...new Set(
    (user.samlAccounts ?? [])
      .filter((account) => account.active !== false)
      .flatMap((account) => [
        account.samlConnection?.id,
        account.enterpriseConnectionId,
      ])
      .filter((id): id is string => typeof id === "string" && id !== ""),
  ),
];

const emailDomain = (address: string | undefined): string | null => {
  const at = address?.lastIndexOf("@") ?? -1;
  return address && at > 0 ? address.slice(at + 1).toLowerCase() : null;
};
