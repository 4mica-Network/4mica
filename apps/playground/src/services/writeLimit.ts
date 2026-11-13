import "server-only";

import { auth } from "@clerk/nextjs/server";
import { requestLogger } from "@/logger";
import { createRateLimiter, type RateLimiter } from "@/utils/rateLimit";

export const WRITE_LIMIT = { limit: 10, windowMs: 60_000 } as const;

const STORE = Symbol.for("4mica.playground.writeLimiter");

const limiter = (): RateLimiter => {
  const scope = globalThis as typeof globalThis & {
    [STORE]?: RateLimiter;
  };
  scope[STORE] ??= createRateLimiter(WRITE_LIMIT);
  return scope[STORE];
};

export const allowWrite = async (action: string): Promise<boolean> => {
  let clerkUserId: string | null = null;

  try {
    ({ userId: clerkUserId } = await auth());
  } catch {
    return true;
  }

  if (!clerkUserId || limiter().take(clerkUserId)) {
    return true;
  }

  (await requestLogger()).warn("write rate limit exceeded", {
    action,
    clerkUserId,
  });
  return false;
};
